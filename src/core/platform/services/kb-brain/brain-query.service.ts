/**
 * 知识大脑·统一检索池（T10，详细设计 §5.1）
 * @module platform/services/kb-brain/brain-query.service
 *
 * brain 模式检索：向量召回（kb_vectors 全命名空间）+ BM25 词法召回（含
 * atom:/note: 倒排行），类型内归一排序 → 跨类型 RRF 融合（atom 短句余弦
 * 偏高，加权融合会偏科，RRF 只用名次免疫）→ 命名空间分流解析 → 同文档去重
 * （chunk 与其源 atom 同中保 atom）。
 * 纯 chunk 检索不走此处（KnowledgeBaseService.search 无 include 时走存量路径，
 * 逐字节旧行为）。
 */
import type { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import type { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import type { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import type { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import type { SearchResult } from '@shared/types/knowledge-base.types'
import { CRAG_SYSTEM } from './prompts'
import { parseVectorNamespace } from './vector-namespace'
import { detectLayerBoost, layerWeightOf } from './layer-intent'
import { SMELT_CARD_NOTE_TYPES } from './smelt-common'
import { tokenizeForIndex } from '@core/platform/services/kb-tokenize'
import { personalizedPageRank } from '@core/platform/services/graph/ppr'

const RRF_K = 60
/** 向量过召系数（混合融合需要并集；QA 存量 padding 同量级） */
const FETCH_MULTIPLIER = 3
const FETCH_PADDING = 10
/** BM25 候选上限（防御超大全库词法命中） */
const BM25_CANDIDATE_CAP = 500

/** 倒排行最小形态（与 KbInvertedIndexRepository 对齐） */
interface InvertedItem {
  term: string
  chunkId: string
  knowledgeBaseId: string
  termFrequency: number
}

export interface BrainQueryDeps {
  /** 生成查询向量；失败抛错（含真实原因），调用方降级为纯词法召回并留痕 */
  embed: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][]>
  searchSimilar: (kbId: string, vector: number[], topK: number) => Promise<Array<{ chunkId: string; score: number }>>
  inverted: {
    findByTerms(kbId: string, terms: string[]): Promise<Map<string, InvertedItem[]>>
    getDocumentFrequencies(kbId: string, opts?: { excludeChunkIdPrefixes?: string[] }): Promise<Map<string, number>>
    getChunkCount(kbId: string, opts?: { excludeChunkIdPrefixes?: string[] }): Promise<number>
    getAverageChunkLength(kbId: string, opts?: { excludeChunkIdPrefixes?: string[] }): Promise<number>
  }
  atoms: KbAtomRepository
  notes: KbNoteRepository
  chunks: KbChunkRepository
  docs: KbDocumentRepository
  /** 图路三件（M2；缺失则 PPR 图路跳过，不影响向量+词法主路） */
  entities?: KbEntityRepository
  edges?: KbKnowledgeEdgeRepository
  /** CRAG 判级 LLM（M3；未注入则 cragEnabled 不生效） */
  cragLlm?: (req: { system: string; user: string; maxTokens?: number }) => Promise<string>
}

export interface BrainSearchRequest {
  knowledgeBaseId: string
  query: string
  topK?: number
  include?: Array<'chunk' | 'atom' | 'note'>
  lensNoteId?: string
  embeddingConfig: string | null
  signal?: AbortSignal
  /** 限定文档（SearchRequest.documentIds 透传——缺失会静默变全库检索） */
  documentIds?: string[]
  /** 分数下限（SearchRequest.threshold 透传，作用于各通道原始分） */
  threshold?: number
  /** 检索模式：synthesize 时 chunk 名次后移（§5.1 第5点——综合型 atom/note 主导） */
  intent?: 'lookup' | 'synthesize'
  /** CRAG 纠错（§8.1 M3）：判级 incorrect → 改写重试 + 图路兜底（热路径多一次 LLM，默认关） */
  cragEnabled?: boolean
}

/** RRF 融合分（用于排序，不回写为结果 score——score 保持各类型原始分） */
type FusedEntry = { ns: 'chunk' | 'atom' | 'note'; id: string; fused: number; raw: number }

export class BrainQueryService {
  constructor(private readonly deps: BrainQueryDeps) {}

  async search(req: BrainSearchRequest): Promise<{ success: boolean; data?: SearchResult[]; error?: string }> {
    try {
      const include = req.include?.length ? req.include : (['chunk'] as Array<'chunk' | 'atom' | 'note'>)
      const includeSet = new Set(include)
      const topK = req.topK || 5
      const kbId = req.knowledgeBaseId

      /* ---------- 1. 向量召回 ---------- */
      const vecHits: Array<{ ns: 'chunk' | 'atom' | 'note'; id: string; score: number }> = []
      // 嵌入失败降级为「纯 BM25 词法召回」（brain 池的既定容错），但真实原因必须留痕，
      // 否则检索质量下降时完全无从排查（此前 embed 返回 null 是静默的）
      let vectors: number[][] | null = null
      try {
        vectors = await this.deps.embed([req.query], { id: kbId, embeddingConfig: req.embeddingConfig })
      } catch (e: unknown) {
        console.warn(
          `[BrainQuery] 查询向量生成失败，降级为纯词法召回: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
      if (vectors && vectors.length > 0) {
        const fetchK = topK * FETCH_MULTIPLIER + FETCH_PADDING
        const raw = await this.deps.searchSimilar(kbId, vectors[0], fetchK)
        for (const r of raw) {
          const { ns, id } = parseVectorNamespace(r.chunkId)
          if (ns === 'qa' || ns === 'ent' || ns === 'event') continue // qa 存量语义；ent=实体摘要（只供图路邻域）；event=场面原料（v2 P0 不进检索主池，仅供聚类）
          if (!includeSet.has(ns)) continue
          if (req.threshold != null && req.threshold > 0 && r.score < req.threshold) continue
          vecHits.push({ ns, id, score: r.score })
        }
      }

      /* ---------- 2. BM25 词法召回 ---------- */
      // 口径说明：brain 池是 chunk+atom+note 混合检索，统计必须用全池口径
      // （不排除 brain 行）——否则纯 brain 词项 df=0 拿不到分。排除口径只
      // 用于存量 chunk 检索（KnowledgeBaseService.bm25Scores）防统计污染。
      const bm25Scores = new Map<string, { ns: 'chunk' | 'atom' | 'note'; id: string; score: number }>()
      const terms = [...new Set(tokenizeForIndex(req.query))]
      if (terms.length > 0) {
        const [postings, dfMap, totalChunks, avgLen] = await Promise.all([
          this.deps.inverted.findByTerms(kbId, terms),
          this.deps.inverted.getDocumentFrequencies(kbId),
          this.deps.inverted.getChunkCount(kbId),
          this.deps.inverted.getAverageChunkLength(kbId),
        ])
        if (totalChunks > 0 && avgLen > 0) {
          // 候选收集（含命名空间过滤）
          const candidates = new Map<string, { ns: 'chunk' | 'atom' | 'note'; id: string; tfByTerm: Map<string, number> }>()
          for (const [term, items] of postings) {
            for (const item of items) {
              const { ns, id } = parseVectorNamespace(item.chunkId)
              if (ns === 'qa' || ns === 'ent' || ns === 'event' || !includeSet.has(ns)) continue
              const key = item.chunkId
              let c = candidates.get(key)
              if (!c) {
                c = { ns, id, tfByTerm: new Map() }
                candidates.set(key, c)
              }
              c.tfByTerm.set(term, item.termFrequency)
            }
          }
          // docLen：chunk=内容分词长；atom=statement；note=title+description。
          // 先粗裁候选（按命中词数降序）再取长度——高频词大库的无界 N+1 在此收口
          let candList = [...candidates.values()]
          if (candList.length > BM25_CANDIDATE_CAP) {
            candList = candList
              .sort((a, b) => b.tfByTerm.size - a.tfByTerm.size)
              .slice(0, BM25_CANDIDATE_CAP)
            candidates.clear()
            for (const c of candList) candidates.set(c.id, c)
          }
          const docLen = new Map<string, number>()
          await Promise.all(candList.map(async (c) => docLen.set(c.id, await this.docLenOf(c.ns, c.id))))
          for (const c of candidates.values()) {
            let score = 0
            for (const [term, tf] of c.tfByTerm) {
              const df = dfMap.get(term) ?? 0
              if (df === 0) continue
              const idf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5))
              const len = docLen.get(c.id) ?? avgLen
              const norm = (tf * 2.2) / (tf + 1.2 * (1 - 0.75 + (0.75 * len) / avgLen))
              score += idf * norm
            }
            if (score > 0 && !(req.threshold != null && req.threshold > 0 && score < req.threshold)) {
              bm25Scores.set(c.id, { ns: c.ns, id: c.id, score })
            }
          }
        }
      }

      /* ---------- 3. 跨类型 RRF：两路各自名次，名次倒数求和 ---------- */
      const fused = new Map<string, FusedEntry>()
      const addRank = (
        ranked: Array<{ ns: 'chunk' | 'atom' | 'note'; id: string; score: number }>,
        _offsetOf?: unknown,
        weightOf?: (h: { ns: string; id: string; score: number }) => number,
      ): void => {
        ranked.forEach((h, i) => {
          const key = h.id
          const prev = fused.get(key)
          const contribution = (1 / (RRF_K + i + 1)) * (weightOf?.(h) ?? 1)
          if (prev) {
            prev.fused += contribution
          } else {
            fused.set(key, { ns: h.ns, id: h.id, fused: contribution, raw: h.score })
          }
        })
      }
      const synthesize = req.intent === 'synthesize'
      // synthesize：chunk 的 RRF 贡献减半（名次偏移在 K=60 下仅 ~3%，乘法权重才达到设计语义）
      addRank([...vecHits].sort((a, b) => b.score - a.score), undefined, (h) => (synthesize && h.ns === 'chunk' ? 0.5 : 1))
      addRank([...bm25Scores.values()].sort((a, b) => b.score - a.score), undefined, (h) => (synthesize && h.ns === 'chunk' ? 0.5 : 1))

      const ordered = [...fused.values()].sort((a, b) => b.fused - a.fused)

      /* ---------- 4. 命名空间分流解析 + 同源去重 + 截断 ---------- */
      // 先解析（上限 3*topK）、后去重、再截断——保证去重后仍尽量满 topK（F12）
      const sourceChunkIdsOfAtoms = new Set<string>()
      const atomSourceChunk = new Map<string, string>() // atomId → sourceChunkId（context 降级用）
      const parsed: Array<{ entry: (typeof ordered)[number]; result: SearchResult }> = []
      const docIdFilter = req.documentIds?.length ? new Set(req.documentIds) : null
      for (const entry of ordered) {
        if (parsed.length >= topK * FETCH_MULTIPLIER) break
        const resolved = await this.resolveHit(entry, req)
        if (!resolved) continue
        if (docIdFilter && !docIdFilter.has(resolved.searchResult.documentId)) continue
        if (resolved.kind === 'atom' && resolved.sourceChunkId) {
          sourceChunkIdsOfAtoms.add(resolved.sourceChunkId)
          atomSourceChunk.set(resolved.searchResult.atom!.id, resolved.sourceChunkId)
        }
        // score 回填原始分（余弦/BM25），fused 只用于排序——与存量检索的 score 语义一致
        resolved.searchResult.score = Number(entry.raw.toFixed(4))
        parsed.push({ entry, result: resolved.searchResult })
      }
      // 同源去重：chunk 命中某 atom 的 sourceChunkId → 不丢弃，降级为该 atom 的 context（§5.1）
      const chunkContentById = new Map(parsed.filter((p) => p.result.kind === 'chunk').map((p) => [p.result.chunkId, p.result.content]))
      const vecRawIds = new Set(vecHits.map((h) => h.id))
      // M4 软衰减（呈现层，§6.3）：细节型论断随时间降权、常用论断增强——
      // boost = 1/(1+ageDays/180) * (1+ln(1+useCount))，作用于排序键（fused 不变，score 不变）
      const atomIdList = [...new Set(parsed.filter((p) => p.result.kind === 'atom').map((p) => (p.result.atom as { id: string }).id))]
      const atomCreatedAt = new Map<string, Date>()
      const atomUseCount = new Map<string, number>()
      const atomLayer = new Map<string, string>()
      if (atomIdList.length > 0 && this.deps.atoms) {
        for (const a of await this.deps.atoms.findByIds(atomIdList)) {
          atomCreatedAt.set(a.id, a.createdAt ?? new Date())
          atomUseCount.set(a.id, a.useCount)
          atomLayer.set(a.id, a.layer)
        }
      }
      const deduped = parsed
        .filter((p) => !(p.result.kind === 'chunk' && sourceChunkIdsOfAtoms.has(p.result.chunkId)))
        .map((p) => ({ ...p, sortKey: p.entry.fused }))
        .map((p) => {
          if (p.result.kind === 'atom') {
            const srcChunk = atomSourceChunk.get((p.result.atom as { id: string }).id)
            if (srcChunk) p.result.context = chunkContentById.get(srcChunk)
          }
          // scoreKind：向量通道命中的（entry.id 即裸 id，与 vecHits 同键）
          p.result.scoreKind = vecRawIds.has(p.entry.id) ? 'cosine' : 'bm25'
          return p
        })
      // M4 软衰减（呈现层，§6.3）：排序键 = fused × boost；boost = 1/(1+ageDays/180) × (1+ln(1+useCount))——
      // 细节随时间衰减、常用论断增强。注意：180 天参数在 RRF 分数尺度下可越位多名（非"微降"），需实测调优
      // 分层选层（§分层知识消费）：查询信号命中层加权（×1.4），非命中层轻降（×0.85）——乘法不硬过滤
      // v2 P2：冶炼成品卡（套路/原理/案例/品类/设定模式）×1.3——成品知识优先于裸论断碎片
      const layerBoost = detectLayerBoost(req.query)
      const cardTypeBoostOf = (item: (typeof parsed)[number]): number => {
        const type = item.result.note?.type
        return type && (SMELT_CARD_NOTE_TYPES as readonly string[]).includes(type) ? 1.3 : 1
      }
      if (atomIdList.length >= 2) {
        const boostOf = (item: (typeof parsed)[number]): number => {
          if (item.result.kind === 'note') return cardTypeBoostOf(item)
          if (item.result.kind !== 'atom' || !item.result.atom) return 1
          const created = atomCreatedAt.get(item.result.atom.id)
          const ageDays = created ? Math.max(0, (Date.now() - created.getTime()) / 86400000) : 0
          const useBoost = 1 + Math.log(1 + (atomUseCount.get(item.result.atom.id) ?? 0))
          const layerW = layerWeightOf(layerBoost, (atomLayer.get(item.result.atom.id) ?? 'detail') as never)
          return (1 / (1 + ageDays / 180)) * useBoost * layerW
        }
        deduped.sort((x, y) => y.sortKey * boostOf(y) - x.sortKey * boostOf(x))
      } else {
        // 结果里没有论断（纯卡/纯原文）时也应用成品卡加权
        deduped.sort((x, y) => y.sortKey * cardTypeBoostOf(y) - x.sortKey * cardTypeBoostOf(x))
      }
      const finalRows = deduped.slice(0, topK).map((p) => p.result)

      // M2 图路补充：综合型查询把 PPR 邻域论断并入尾部位（补多跳关联；主路不动）
      if (req.intent === 'synthesize' && finalRows.length < topK) {
        try {
          const supplement = await this.graphSupplement(kbId, req.query, topK - deduped.length)
          const seen = new Set(finalRows.map((r) => r.chunkId))
          for (const s of supplement) {
            if (finalRows.length >= topK) break
            if (seen.has(s.chunkId)) continue
            if (docIdFilter && !docIdFilter.has(s.documentId)) continue
            s.scoreKind = 'ppr'
            finalRows.push(s)
          }
        } catch {
          /* 图路失败不影响主路 */
        }
      }

      // M3 CRAG 纠错（§8.1）：判级 incorrect → 改写重试一次 + 图路兜底；失败/ambiguous 降级原序
      if (req.cragEnabled && this.deps.cragLlm && finalRows.length > 0) {
        try {
          const verdict = await this.cragJudge(req.query, finalRows.slice(0, 3))
          if (verdict.grade === 'incorrect' && verdict.rewrittenQuery) {
            const retry = await this.search({ ...req, query: verdict.rewrittenQuery, cragEnabled: false, intent: 'synthesize' })
            if (retry.success && retry.data && retry.data.length > 0) {
              return { success: true, data: retry.data }
            }
          }
        } catch {
          /* CRAG 失败降级原序（rerank 同款 fail-soft） */
        }
      }

      /* ---------- 5. 使用即再巩固（fire-and-forget） ---------- */
      const atomIds = finalRows.filter((r) => r.kind === 'atom').map((r) => (r.atom as { id: string }).id)
      const noteIds = finalRows.filter((r) => r.kind === 'note').map((r) => (r.note as { id: string }).id)
      if (atomIds.length > 0) void this.deps.atoms.incUse(atomIds).catch(() => {})
      if (noteIds.length > 0) void this.deps.notes.incCited(noteIds).catch(() => {})

      return { success: true, data: finalRows }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** 命名空间 → SearchResult（superseded/stale 论断与 archived 卡片跳过） */
  private async resolveHit(
    entry: { ns: 'chunk' | 'atom' | 'note'; id: string },
    req: BrainSearchRequest,
  ): Promise<{ searchResult: SearchResult; kind: 'atom'; sourceChunkId?: string } | { searchResult: SearchResult; kind: 'chunk' | 'note' } | null> {
    const docName = async (documentId: string): Promise<string> => {
      const doc = await this.deps.docs.findById(documentId)
      return doc?.name ?? documentId
    }

    if (entry.ns === 'chunk') {
      const chunk = await this.deps.chunks.findById(entry.id)
      if (!chunk) return null
      return {
        kind: 'chunk',
        searchResult: {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentName: await docName(chunk.documentId),
          content: chunk.content,
          score: 0, // 由调用侧回填（raw 余弦/BM25 分）
          kind: 'chunk',
        },
      }
    }

    if (entry.ns === 'atom') {
      const atom = await this.deps.atoms.findById(entry.id)
      if (!atom) return null
      // archived 也跳过（清理服务只改状态不清池——归档论断不得再从检索池召回）
      if (atom.status === 'superseded' || atom.status === 'stale' || atom.status === 'archived') return null
      if (req.lensNoteId && atom.lensNoteId !== req.lensNoteId) return null
      return {
        kind: 'atom',
        sourceChunkId: atom.sourceChunkId ?? undefined,
        searchResult: {
          chunkId: `atom:${atom.id}`,
          documentId: atom.sourceDocumentId,
          documentName: await docName(atom.sourceDocumentId),
          content: atom.statement,
          score: 0,
          kind: 'atom',
          atom: {
            id: atom.id,
            type: atom.type,
            layer: atom.layer,
            status: atom.status,
            quote: atom.sourceQuote,
            jumpTo: { chapterId: atom.sourceChapterId ?? '', startOffset: atom.startOffset ?? 0 },
          },
        },
      }
    }

    // note
    const note = await this.deps.notes.findById(entry.id)
    if (!note) return null
    if (note.status === 'archived') return null
    let evidenceCount = 0
    try {
      evidenceCount = (JSON.parse(note.evidence) as unknown[]).length
    } catch {
      evidenceCount = 0
    }
    return {
      kind: 'note',
      searchResult: {
        chunkId: `note:${note.id}`,
        documentId: '', // note 是库级实体，无文档归属（下游按 kind 判别，勿当文档 id 跳转）
        documentName: note.title,
        content: note.description,
        score: 0,
        kind: 'note',
        note: { id: note.id, title: note.title, type: note.type, evidenceCount },
      },
    }
  }

  /* ---------- M3 CRAG 判级 ---------- */

  private async cragJudge(query: string, top: SearchResult[]): Promise<{ grade: 'correct' | 'incorrect' | 'ambiguous'; rewrittenQuery?: string }> {
    const excerpt = top.map((r, i) => `[${i + 1}] ${r.content.slice(0, 120)}`).join('\n')
    const raw = await this.deps.cragLlm!({ system: CRAG_SYSTEM, user: `查询：${query}\n\n检索结果：\n${excerpt}`, maxTokens: 800 })
    const { extractJsonFromResponse } = await import('@core/platform/services/ai-call')
    const parsed = extractJsonFromResponse(raw) as { grade?: string; rewrittenQuery?: string }
    const grade = parsed.grade === 'incorrect' ? 'incorrect' : parsed.grade === 'ambiguous' ? 'ambiguous' : 'correct'
    return { grade, rewrittenQuery: typeof parsed.rewrittenQuery === 'string' ? parsed.rewrittenQuery : undefined }
  }

  /* ---------- M2 图路（PPR） ---------- */

  private graphCache = new Map<
    string,
    { nodes: Array<{ id: string; kind: string }>; edges: Array<[string, string, number]>; builtAt: number }
  >()
  /** 缓存 60s：写边后图路最长 1 分钟延迟（跨模块失效调用经评估引入耦合，不划算） */
  private static GRAPH_TTL = 60 * 1000

  private async graphSnapshotCached(kbId: string): Promise<{ nodes: Array<{ id: string; kind: string }>; edges: Array<[string, string, number]> } | null> {
    if (!this.deps.edges || !this.deps.atoms) return null
    const hit = this.graphCache.get(kbId)
    if (hit && Date.now() - hit.builtAt < BrainQueryService.GRAPH_TTL) {
      return hit
    }
    // 投影到实体空间（盲审 P1 修复）：leads-to 是 atom→atom 边，经论断的实体挂点折叠为
    // entity→entity 边——种子（实体 id）与图节点才在同一 id 空间，PPR 多跳才可达
    const raw = await this.deps.edges.graphSnapshot(kbId)
    const atomIds = new Set<string>()
    for (const [s, t] of raw.edges) {
      atomIds.add(s)
      atomIds.add(t)
    }
    const atoms = await this.deps.atoms.findByIds([...atomIds])
    const subj = new Map<string, string>()
    const obj = new Map<string, string>()
    for (const a of atoms) {
      if (a.subjectEntityId) subj.set(a.id, a.subjectEntityId)
      if (a.objectEntityId) obj.set(a.id, a.objectEntityId)
    }
    const projNodes = new Set<string>()
    const projEdges: Array<[string, string, number]> = []
    const seen = new Set<string>()
    for (const [s, t, w] of raw.edges) {
      const from = subj.get(s) ?? obj.get(s)
      const to = subj.get(t) ?? obj.get(t)
      if (!from || !to || from === to) continue
      projNodes.add(from)
      projNodes.add(to)
      const key = `${from}->${to}`
      if (seen.has(key)) continue
      seen.add(key)
      projEdges.push([from, to, w])
    }
    this.graphCache.set(kbId, {
      nodes: [...projNodes].map((id) => ({ id, kind: 'entity' })),
      edges: projEdges,
      builtAt: Date.now(),
    })
    return { nodes: [...projNodes].map((id) => ({ id, kind: 'entity' })), edges: projEdges }
  }

  /** 图快照失效（写边/实体合并后调用；IPC 层不感知） */
  invalidateGraph(kbId: string): void {
    this.graphCache.delete(kbId)
  }

  /**
   * 图路补充：query 实体提及 → PPR 种子扩散 → top 邻域论断并入结果尾部位。
   * 只在 synthesize intent 或纠错兜底时使用；事实主路仍是向量+BM25（HippoRAG 2 警训）。
   */
  private async graphSupplement(kbId: string, query: string, limit: number): Promise<SearchResult[]> {
    if (!this.deps.edges || !this.deps.entities || !this.deps.atoms) return []
    const snap = await this.graphSnapshotCached(kbId)
    if (!snap || snap.nodes.length === 0) return []
    // 种子：query 分词与实体名/别名精确命中
    const entities = await this.deps.entities.listActiveWithAliases(kbId, 500)
    const q = query.trim()
    const seeds = new Map<string, number>()
    for (const ent of entities) {
      // 精确等值或别名精确命中（盲审修复：双向子串会过度播种稀释 PPR）
      const aliasHit = ent.aliases.some((a) => a === q)
      if (ent.name === q || aliasHit) seeds.set(ent.id, 1)
    }
    if (seeds.size === 0) return []
    const scores = personalizedPageRank({ nodes: snap.nodes.map((n) => n.id), edges: snap.edges }, seeds, { iterations: 40, eps: 1e-4 })
    const topEntities = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id)
    if (topEntities.length === 0) return []
    const neighborAtoms = await this.deps.atoms.findByEntities(kbId, topEntities, {
      lensNoteId: null,
      statuses: ['supported', 'suspected'],
    })
    const docNames = new Map<string, string>()
    return neighborAtoms.slice(0, limit).map((a) => {
      if (!docNames.has(a.sourceDocumentId)) {
        void this.deps.docs.findById(a.sourceDocumentId).then((d) => docNames.set(a.sourceDocumentId, d?.name ?? a.sourceDocumentId))
      }
      return {
      chunkId: `atom:${a.id}`,
      documentId: a.sourceDocumentId,
      documentName: docNames.get(a.sourceDocumentId) ?? a.sourceDocumentId,
      content: a.statement,
      score: 0,
      kind: 'atom' as const,
      atom: {
        id: a.id,
        type: a.type,
        layer: a.layer,
        status: a.status,
        quote: a.sourceQuote,
        jumpTo: { chapterId: a.sourceChapterId ?? '', startOffset: a.startOffset ?? 0 },
      },
      }
    })
  }

  /** docLen：与建索引口径同源（分词项频次和） */
  private async docLenOf(ns: 'chunk' | 'atom' | 'note', id: string): Promise<number> {
    let text = ''
    if (ns === 'chunk') {
      const chunk = await this.deps.chunks.findById(id)
      text = chunk?.content ?? ''
    } else if (ns === 'atom') {
      const atom = await this.deps.atoms.findById(id)
      text = atom?.statement ?? ''
    } else {
      const note = await this.deps.notes.findById(id)
      text = note ? `${note.title} ${note.description}` : ''
    }
    return Math.max(1, tokenizeForIndex(text).length)
  }
}
