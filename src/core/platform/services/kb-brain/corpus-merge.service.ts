/**
 * 跨书实体归并（v2 P3 品类库核心）：类型×嵌入分桶 → LLM 保守裁决 → 软合并
 * @module platform/services/kb-brain/corpus-merge.service
 *
 * 语义：
 * - 候选仅限品类级类型（setting-system/concept/item）——人物/地点/组织是书级实体，
 *   绝不跨书归并（「韩立」只属于一本书）；
 * - scope 标注：挂点论断覆盖 ≥2 本书的实体标 corpus（品类级），否则 book；
 * - 归并保守协议：同类型内嵌入聚簇（cos ≥ 阈值）→ 组 ≥2 → LLM 判「确定同一概念」
 *   才并（宁重复勿错并）；合并走既有软合并机制（entity.merge + 边改指 + 论断挂点改指）；
 * - 成本：每类型每簇一次 LLM 调用，passType 'smelt' 入台账（熔断可见）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import type { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import type { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { ENTITY_MERGE_SYSTEM, buildEntityMergeUser } from './prompts'
import { parseEntityMergeGroups } from './schemas'
import { defaultBrainLlm, type BrainLlmFn } from './llm'
import { clusterSimilar, defaultBrainEmbed } from './smelt-common'

const logger = createLogger('KbCorpusMerge')

/** 参与跨书归并的实体类型白名单（书级类型不进——人物跨书必错并） */
const CORPUS_TYPES = ['setting-system', 'concept', 'item'] as const
/** 候选实体上限（成本护栏：按创建序全量扫描的截断） */
const CANDIDATE_CAP = 300
/** 单类型一次送裁的簇数上限 */
const CLUSTER_CAP = 20

interface CorpusMergeRepos {
  entities: KbEntityRepository
  atoms: KbAtomRepository
  edges: KbKnowledgeEdgeRepository
  passes: KbDigestPassRepository
}

export interface CorpusMergeDeps {
  llm?: BrainLlmFn
  embed?: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => CorpusMergeRepos | null
}

export interface CorpusMergeOutcome {
  merged: number
  corpusMarked: number
  llmCalls: number
}

export class KbCorpusMergeService {
  private readonly llm: BrainLlmFn
  private readonly embedFn: NonNullable<CorpusMergeDeps['embed']>
  private readonly reposFn: () => CorpusMergeRepos | null
  private readonly running = new Set<string>()

  constructor(deps: CorpusMergeDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride)
    this.embedFn = deps.embed ?? defaultBrainEmbed
    this.reposFn =
      deps.repos ??
      ((): CorpusMergeRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbBrainEntities || !db.kbAtoms || !db.kbKnowledgeEdges || !db.kbDigestPasses) return null
        return { entities: db.kbBrainEntities, atoms: db.kbAtoms, edges: db.kbKnowledgeEdges, passes: db.kbDigestPasses }
      })
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  async run(kbId: string, embeddingConfig: string | null): Promise<CorpusMergeOutcome> {
    if (this.running.has(kbId)) return { merged: 0, corpusMarked: 0, llmCalls: 0 }
    const repos = this.reposFn()
    if (!repos) return { merged: 0, corpusMarked: 0, llmCalls: 0 }
    this.running.add(kbId)
    let llmCalls = 0
    try {
      const candidates = await repos.entities.listActiveByTypes(kbId, [...CORPUS_TYPES], CANDIDATE_CAP)
      if (candidates.length === 0) return { merged: 0, corpusMarked: 0, llmCalls: 0 }

      // 每实体的挂点论断书分布（scope 标注 + 裁决上下文数据源）
      const atoms = await repos.atoms.findByEntities(
        kbId,
        candidates.map((c) => c.id),
        { lensNoteId: null, statuses: ['supported'] },
      )
      const docsOf = new Map<string, Set<string>>()
      const atomCountOf = new Map<string, number>()
      for (const a of atoms) {
        for (const eid of [a.subjectEntityId, a.objectEntityId]) {
          if (!eid) continue
          if (!docsOf.has(eid)) docsOf.set(eid, new Set())
          docsOf.get(eid)!.add(a.sourceDocumentId)
          atomCountOf.set(eid, (atomCountOf.get(eid) ?? 0) + 1)
        }
      }

      // 1. scope 标注：跨 ≥2 书 = 品类级
      const corpusIds = candidates.filter((c) => (docsOf.get(c.id)?.size ?? 0) >= 2).map((c) => c.id)
      if (corpusIds.length > 0) await repos.entities.markScope(corpusIds, 'corpus')

      // 2. 同类型分桶 → 嵌入聚簇（名称+别名文本）→ 组 ≥2 → LLM 保守裁决 → 合并
      let merged = 0
      for (const entityType of CORPUS_TYPES) {
        const bucket = candidates.filter((c) => c.entityType === entityType)
        if (bucket.length < 2) continue
        const texts = bucket.map((c) => [c.name, ...c.aliases.slice(0, 3)].join('/'))
        const vectors = await this.embedFn(texts, { id: kbId, embeddingConfig })
        if (!vectors || vectors.length !== bucket.length) continue // 嵌入不可用不盲并
        const clusters = clusterSimilar(bucket, vectors, 0.78, 10).slice(0, CLUSTER_CAP)
        for (const cluster of clusters) {
          if (cluster.length < 2) continue
          const groups = await this.judge(kbId, entityType, cluster, docsOf)
          llmCalls += 1
          for (const group of groups) {
            // 组内锚定：挂点论断最多的为规范实体，其余并入
            const members = group.map((i) => cluster[i]!).filter((m) => m)
            const ranked = members.slice().sort((a, b) => (atomCountOf.get(b.id) ?? 0) - (atomCountOf.get(a.id) ?? 0))
            const primary = ranked[0]!
            for (const from of ranked.slice(1)) {
              try {
                await repos.entities.merge(from.id, primary.id)
                await repos.edges.redirectNode('entity', from.id, primary.id)
                await repos.atoms.redirectEntityRefs(from.id, primary.id)
                merged += 1
              } catch (e) {
                logger.warn(`[kb-corpus] 实体合并失败 ${from.name}→${primary.name}: ${e instanceof Error ? e.message : String(e)}`)
              }
            }
          }
        }
      }

      await repos.passes.recordCompletedPass({
        knowledgeBaseId: kbId,
        documentId: kbId,
        passType: 'smelt',
        passKey: `smelt:corpus-merge:${Date.now()}`,
        stats: { merged, corpusMarked: corpusIds.length },
        cost: { calls: llmCalls, tokensIn: 0, tokensOut: 0 },
      })
      logger.info(`[kb-corpus] kb=${kbId} 归并完成: 合并=${merged} 品类级标注=${corpusIds.length} 调用=${llmCalls}`)
      return { merged, corpusMarked: corpusIds.length, llmCalls }
    } finally {
      this.running.delete(kbId)
    }
  }

  /** 单簇裁决（两次尝试；保守：解析失败=不并） */
  private async judge(
    kbId: string,
    entityType: string,
    cluster: Array<{ name: string; aliases: string[]; id: string }>,
    docsOf: Map<string, Set<string>>,
  ): Promise<number[][]> {
    const candidates = cluster.map((c) => ({ name: c.name, aliases: c.aliases, docCount: docsOf.get(c.id)?.size ?? 1 }))
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        attempt === 0
          ? buildEntityMergeUser({ entityType, candidates })
          : `${buildEntityMergeUser({ entityType, candidates })}\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。`
      try {
        const raw = await this.llm({ system: ENTITY_MERGE_SYSTEM, user, maxTokens: 1500 })
        return parseEntityMergeGroups(extractJsonFromResponse(raw), { count: cluster.length })
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    logger.warn(`[kb-corpus] kb=${kbId} 归并裁决两试失败（保守不并）: ${lastError}`)
    return []
  }
}

let singleton: KbCorpusMergeService | null = null

export function getKbCorpusMergeService(): KbCorpusMergeService {
  if (!singleton) singleton = new KbCorpusMergeService()
  return singleton
}
