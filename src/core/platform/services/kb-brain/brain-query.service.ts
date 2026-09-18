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
import type { SearchResult } from '@shared/types/knowledge-base.types'
import { parseVectorNamespace } from './vector-namespace'
import { tokenizeForIndex } from '@core/platform/services/kb-tokenize'

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
  embed: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
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
}

export interface BrainSearchRequest {
  knowledgeBaseId: string
  query: string
  topK?: number
  include?: Array<'chunk' | 'atom' | 'note'>
  lensNoteId?: string
  embeddingConfig: string | null
  signal?: AbortSignal
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
      const vectors = await this.deps.embed([req.query], { id: kbId, embeddingConfig: req.embeddingConfig })
      if (vectors && vectors.length > 0) {
        const fetchK = topK * FETCH_MULTIPLIER + FETCH_PADDING
        const raw = await this.deps.searchSimilar(kbId, vectors[0], fetchK)
        for (const r of raw) {
          const { ns, id } = parseVectorNamespace(r.chunkId)
          if (ns === 'qa') continue // 存量语义：文档检索剔除 QA 命名空间
          if (!includeSet.has(ns)) continue
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
              if (ns === 'qa' || !includeSet.has(ns)) continue
              const key = item.chunkId
              let c = candidates.get(key)
              if (!c) {
                c = { ns, id, tfByTerm: new Map() }
                candidates.set(key, c)
              }
              c.tfByTerm.set(term, item.termFrequency)
            }
          }
          // docLen：chunk=内容分词长；atom=statement；note=title+description
          const docLen = new Map<string, number>()
          for (const c of candidates.values()) {
            docLen.set(c.id, await this.docLenOf(c.ns, c.id))
          }
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
            if (score > 0) bm25Scores.set(c.id, { ns: c.ns, id: c.id, score })
          }
          // 截断词法候选（防大库膨胀）
          if (bm25Scores.size > BM25_CANDIDATE_CAP) {
            const sorted = [...bm25Scores.values()].sort((a, b) => b.score - a.score).slice(0, BM25_CANDIDATE_CAP)
            bm25Scores.clear()
            for (const s of sorted) bm25Scores.set(s.id, s)
          }
        }
      }

      /* ---------- 3. 跨类型 RRF：两路各自名次，名次倒数求和 ---------- */
      const fused = new Map<string, FusedEntry>()
      const addRank = (ranked: Array<{ ns: 'chunk' | 'atom' | 'note'; id: string; score: number }>): void => {
        ranked.forEach((h, i) => {
          const key = h.id
          const prev = fused.get(key)
          const contribution = 1 / (RRF_K + i + 1)
          if (prev) prev.fused += contribution
          else fused.set(key, { ns: h.ns, id: h.id, fused: contribution, raw: h.score })
        })
      }
      addRank([...vecHits].sort((a, b) => b.score - a.score))
      addRank([...bm25Scores.values()].sort((a, b) => b.score - a.score))

      const ordered = [...fused.values()].sort((a, b) => b.fused - a.fused)

      /* ---------- 4. 命名空间分流解析 + 去重 ---------- */
      const results: SearchResult[] = []
      const sourceChunkIdsOfAtoms = new Set<string>()
      for (const entry of ordered) {
        if (results.length >= topK) break
        const resolved = await this.resolveHit(entry, req)
        if (!resolved) continue
        if (resolved.kind === 'atom') sourceChunkIdsOfAtoms.add(resolved.sourceChunkId ?? '')
        // score 回填原始分（余弦/BM25），fused 只用于排序——与存量检索的 score 语义一致
        resolved.searchResult.score = Number(entry.raw.toFixed(4))
        results.push(resolved.searchResult)
      }
      // 同文档去重：chunk 项的 chunkId 命中某 atom 的 sourceChunkId → 丢弃（atom 已带 quote 回链）
      const deduped = results.filter((r) => !(r.kind === 'chunk' && sourceChunkIdsOfAtoms.has(r.chunkId)))

      /* ---------- 5. 使用即再巩固（fire-and-forget） ---------- */
      const atomIds = deduped.filter((r) => r.kind === 'atom').map((r) => (r.atom as { id: string }).id)
      const noteIds = deduped.filter((r) => r.kind === 'note').map((r) => (r.note as { id: string }).id)
      if (atomIds.length > 0) void this.deps.atoms.incUse(atomIds).catch(() => {})
      if (noteIds.length > 0) void this.deps.notes.incCited(noteIds).catch(() => {})

      return { success: true, data: deduped }
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
      if (atom.status === 'superseded' || atom.status === 'stale') return null
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
        documentId: note.knowledgeBaseId,
        documentName: note.title,
        content: note.description,
        score: 0,
        kind: 'note',
        note: { id: note.id, title: note.title, type: note.type, evidenceCount },
      },
    }
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
