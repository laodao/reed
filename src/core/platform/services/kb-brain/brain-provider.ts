/**
 * 知识大脑·structured-provider 注册（T17，详细设计 §8.3）
 * @module platform/services/kb-brain/brain-provider
 *
 * 把大脑论断/卡片以 KnowledgeSegment 供给 HostKit 装配层（与长文图谱同契约）。
 * 消费宿主：longwriting / domain-learning / episode-production（chat 走 kb_brain_query
 * 工具，不进装配通道——可行性核查决策）。检索面：启用大脑的库（cap 3）brain 池
 * synthesize 查询。存储不收编、检索面统一（架构对齐长文图谱先例）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KnowledgeSegment, StructuredKnowledgeQuery } from '@core/platform/agent-runtime/memory/structured-provider'
import { registerStructuredProvider } from '@core/platform/agent-runtime/memory/structured-provider'
import { parseBrainConfig } from './brain-config'
import { BrainQueryService, type BrainQueryDeps } from './brain-query.service'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import { defaultBrainLlm } from './llm'

/** 可注入（测试）；生产由 installKbBrainProvider 组装 */
export interface KbBrainProviderDeps {
  brainQuery?: BrainQueryService
  maxKbs?: number
  /** 启用大脑的库列表（测试注入；生产走 findAll + brainConfig 判定） */
  enabledKbs?: () => Promise<Array<{ id: string; embeddingConfig: string | null }>>
}

let installed = false

/** 装配（幂等）：随 installKbBrainDigest 一起调用 */
export function installKbBrainProvider(deps?: KbBrainProviderDeps): void {
  if (installed) return
  installed = true
  registerStructuredProvider({
    id: 'kb-brain',
    supports: (scope) =>
      ['longwriting', 'domain-learning', 'episode-production'].includes(scope.bizModule ?? ''),
    query: (req) => queryKbBrain(req, deps),
  })
}

/** 测试用：卸载标记 */
export function resetKbBrainProviderInstall(): void {
  installed = false
}

async function queryKbBrain(req: StructuredKnowledgeQuery, deps?: KbBrainProviderDeps): Promise<KnowledgeSegment[]> {
  const brainQuery = deps?.brainQuery ?? providerBrainQuery()
  if (!brainQuery) return []
  const maxSegments = req.budget.maxSegments
  const maxChars = req.budget.maxChars
  const queryText = req.topics.join(' ').trim()
  if (!queryText) return []

  const enabled = deps?.enabledKbs
    ? await deps.enabledKbs()
    : (await getCoreDatabaseManager().knowledgeBases?.findAll() ?? [])
        .filter((kb) => {
          try {
            return parseBrainConfig(kb.brainConfig)?.enabled ?? false
          } catch {
            return false // 损坏配置视为未启用（与 digest 侧 safeParseConfig 同口径）
          }
        })
        .slice(0, deps?.maxKbs ?? 3)

  const segments: KnowledgeSegment[] = []
  let chars = 0
  for (const kb of enabled) {
    if (segments.length >= maxSegments || chars >= maxChars) break
    let res
    try {
      res = await brainQuery.search({
        knowledgeBaseId: kb.id,
        query: queryText,
        topK: 2,
        include: ['atom', 'note'],
        intent: 'synthesize',
        embeddingConfig: kb.embeddingConfig ?? null,
      })
    } catch {
      continue // 单库失败不阻断
    }
    if (!res.success || !res.data) continue
    for (const r of res.data) {
      if (segments.length >= maxSegments || chars >= maxChars) break
      const kindLabel = r.kind === 'note' ? '思想卡' : r.kind === 'atom' ? '论断' : '原文'
      const text = `${r.documentName}（${kindLabel}）：${r.content}`
      if (chars + text.length > maxChars) {
        // 截断到剩余预算（break 会连带丢弃同库后续短结果）
        const remaining = maxChars - chars
        if (remaining < 40) break
        segments.push({
          layer: 'L3',
          kind: 'structured-fact',
          text: `${text.slice(0, Math.max(40, remaining))}…`,
          source: { provider: 'kb-brain', ref: r.chunkId },
        })
        break
      }
      segments.push({
        layer: 'L3',
        kind: 'structured-fact',
        text,
        source: { provider: 'kb-brain', ref: r.chunkId },
      })
      chars += text.length
    }
  }
  return segments
}

/** 缺省 brain query（模块级缓存；deps 内现取 manager 防陈旧闭包）。
 *  导出供深度研究流复用同一装配（架构统一：不为不同模块写第二份 deps 组装）。 */
let cachedQuery: BrainQueryService | null = null
export function createDefaultBrainQuery(): BrainQueryService | null {
  return providerBrainQuery()
}
function providerBrainQuery(): BrainQueryService | null {
  if (cachedQuery) return cachedQuery
  const db = getCoreDatabaseManager()
  if (!db.kbAtoms || !db.kbNotes || !db.kbChunks || !db.kbDocuments) return null
  const kbService = new KnowledgeBaseService()
  const deps: BrainQueryDeps = {
    embed: (texts, kb) => kbService.getEmbeddingVectors(texts, kb.embeddingConfig ? JSON.parse(kb.embeddingConfig) : {}),
    searchSimilar: (kbId, vector, topK) => {
      const vectors = getCoreDatabaseManager().kbVectors
      if (!vectors) return Promise.resolve([])
      return vectors.searchSimilar(kbId, vector, topK)
    },
    inverted: {
      findByTerms: (kbId, terms) => db.kbInvertedIndex?.findByTerms(kbId, terms) ?? Promise.resolve(new Map()),
      getDocumentFrequencies: (kbId, opts) => db.kbInvertedIndex?.getDocumentFrequencies(kbId, opts) ?? Promise.resolve(new Map()),
      getChunkCount: (kbId, opts) => db.kbInvertedIndex?.getChunkCount(kbId, opts) ?? Promise.resolve(0),
      getAverageChunkLength: (kbId, opts) => db.kbInvertedIndex?.getAverageChunkLength(kbId, opts) ?? Promise.resolve(0),
    },
    atoms: db.kbAtoms,
    notes: db.kbNotes,
    chunks: db.kbChunks,
    docs: db.kbDocuments,
    entities: db.kbBrainEntities ?? undefined,
    edges: db.kbKnowledgeEdges ?? undefined,
    cragLlm: defaultBrainLlm('kb-brain-adjudicate'),
  }
  cachedQuery = new BrainQueryService(deps)
  return cachedQuery
}
