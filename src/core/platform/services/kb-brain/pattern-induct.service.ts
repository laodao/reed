/**
 * 套路归纳（v2 P1 冶炼核心）：故事轨 kb_events → 跨章跨书套路卡
 * @module platform/services/kb-brain/pattern-induct.service
 *
 * 管线：按 sceneType 分桶 → 桶内嵌入聚类（同 distill 口径；嵌入失败降级整桶一簇）→
 * 成卡门槛 max(8, 2%) 与分布验证（覆盖章数/跨书数）→ LLM 归纳套路假设（骨架/变体/
 * 边界/为什么）→ 套路卡 published（A3：带实例验证门槛的冶炼产物直发）。
 * 幂等：同题卡不重建——新实例并入 pattern_instances + version 演进。
 * 与 distill 分工：distill=设定轨（atoms），本服务=故事轨（events）。
 * 成本：每簇一次 LLM 调用，经 recordCompletedPass（passType 'smelt'）入台账对熔断可见。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbEventRepository, KbEventRecord } from '@core/database/repositories/kb-event.repository'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { INDUCE_PATTERN_SYSTEM, buildInducePatternUser } from './prompts'
import { parseInducePatternOutput } from './schemas'
import { defaultBrainLlm, type BrainLlmFn } from './llm'
import { cardThreshold, clusterSimilar, defaultBrainEmbed, mergeInstanceEntries, publishSmeltCard } from './smelt-common'

const logger = createLogger('KbPatternInduct')

/** 送 LLM 的实例样本上限（实例登记另计——卡上链全簇） */
const SAMPLE_CAP = 30
/** 单簇实例登记上限（pattern_instances 体积护栏） */
const INSTANCE_CAP = 40
/** 触发冶炼的库级事件总量下限（低于此数原料不足，不烧调用） */
export const MIN_EVENTS_FOR_SMELT = 16

interface SmeltRepos {
  events: KbEventRepository
  notes: KbNoteRepository
  passes: KbDigestPassRepository
}

export interface PatternInductOutcome {
  cardsCreated: number
  cardsEvolved: number
  clustersExamined: number
  llmCalls: number
  skipped: boolean
  reason?: string
  /** 本轮新建卡的 noteIds（自动化动作日志/撤销依据） */
  createdNoteIds: string[]
}

export interface PatternInductDeps {
  llm?: BrainLlmFn
  embed?: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => SmeltRepos | null
}

const EMPTY: PatternInductOutcome = { cardsCreated: 0, cardsEvolved: 0, clustersExamined: 0, llmCalls: 0, skipped: true, createdNoteIds: [] }

export class KbPatternInductService {
  private readonly llm: BrainLlmFn
  private readonly embedFn: NonNullable<PatternInductDeps['embed']>
  private readonly reposFn: () => SmeltRepos | null
  private readonly running = new Set<string>()

  constructor(deps: PatternInductDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride)
    this.embedFn = deps.embed ?? defaultBrainEmbed
    this.reposFn =
      deps.repos ??
      ((): SmeltRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbEvents || !db.kbNotes || !db.kbDigestPasses) return null
        return { events: db.kbEvents, notes: db.kbNotes, passes: db.kbDigestPasses }
      })
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  async run(kbId: string, embeddingConfig: string | null, opts?: { review?: boolean }): Promise<PatternInductOutcome> {
    if (this.running.has(kbId)) return { ...EMPTY, reason: 'running' }
    const repos = this.reposFn()
    if (!repos) return { ...EMPTY, reason: 'no-repos' }
    this.running.add(kbId)
    let llmCalls = 0
    try {
      const all = await repos.events.findByKb(kbId, { limit: 5000 })
      if (all.length < MIN_EVENTS_FOR_SMELT) {
        return { ...EMPTY, reason: `事件不足（${all.length} < ${MIN_EVENTS_FOR_SMELT}）` }
      }
      const outcome: PatternInductOutcome = { cardsCreated: 0, cardsEvolved: 0, clustersExamined: 0, llmCalls: 0, skipped: false, createdNoteIds: [] }

      // 按场面类型分桶
      const buckets = new Map<string, KbEventRecord[]>()
      for (const ev of all) {
        if (!buckets.has(ev.sceneType)) buckets.set(ev.sceneType, [])
        buckets.get(ev.sceneType)!.push(ev)
      }
      const docIdsWithEvents = new Set(all.map((e) => e.sourceDocumentId))
      const needCrossDoc = docIdsWithEvents.size >= 2 // 多书库要求跨书成卡（单书簇是情节记录不是品类套路）

      for (const [sceneType, bucket] of buckets) {
        const threshold = cardThreshold(bucket.length)
        // 桶内聚类（嵌入失败降级整桶一簇——样本同型时仍可归纳）
        const texts = bucket.map((e) => `${e.summary}（${e.sceneType}）`)
        const vectors = await this.embedFn(texts, { id: kbId, embeddingConfig })
        const clusters =
          vectors && vectors.length === bucket.length ? clusterSimilar(bucket, vectors) : [bucket]
        for (const cluster of clusters) {
          // 验证门（降级策略：频率门 + 分布检查；反例扫描不做——v2 设计 §9）
          if (cluster.length < threshold) continue
          const chapters = new Set(cluster.map((e) => e.sourceChapterId))
          if (chapters.size < Math.ceil(threshold / 2)) continue // 同章复读不算套路
          const docs = new Set(cluster.map((e) => e.sourceDocumentId))
          if (needCrossDoc && docs.size < 2) continue
          outcome.clustersExamined += 1

          const sample = cluster.slice(0, SAMPLE_CAP)
          const draft = await this.reflect(kbId, sceneType, sample)
          llmCalls += 1
          outcome.llmCalls = llmCalls
          if (!draft) continue

          const instances = cluster.slice(0, INSTANCE_CAP).map((e) => ({
            eventId: e.id,
            documentId: e.sourceDocumentId,
            chapterId: e.sourceChapterId,
            sceneType: e.sceneType,
            summary: e.summary,
            quote: e.sourceQuote.slice(0, 120),
          }))
          const evidence = instances.slice(0, 12).map((i) => ({ eventId: i.eventId, documentId: i.documentId, quote: i.quote }))
          const freqLine = `出现 ${cluster.length} 次（覆盖 ${chapters.size} 章 / ${docs.size} 本书）`
          const body = [
            `> ${freqLine}；模型置信 ${draft.confidence}`,
            '',
            '## 骨架',
            ...draft.steps.map((s, i) => `${i + 1}. ${s}`),
            ...(draft.variants.length ? ['', '## 变体', ...draft.variants.map((v) => `- ${v}`)] : []),
            '',
            '## 为什么有效',
            draft.why,
            '',
            '## 边界（什么时候别用）',
            draft.boundary,
          ].join('\n')

          // 幂等：同题卡吸收新实例演进，不重建
          const similar = await repos.notes.findSimilarTitle(kbId, draft.title)
          const existing = similar.find((s) => s.title === draft.title && s.status !== 'archived')
          if (existing) {
            const { merged, added } = mergeInstanceEntries(existing.patternInstances, instances)
            if (added > 0) {
              await repos.notes.evolveCard(existing.id, {
                body,
                description: draft.whenToUse,
                patternSkeleton: JSON.stringify(draft.steps),
                patternInstances: JSON.stringify(merged),
              })
              outcome.cardsEvolved += 1
            }
            continue
          }
          const created = await publishSmeltCard(repos.notes, kbId, {
            title: draft.title,
            description: draft.whenToUse,
            body,
            type: 'plot-pattern',
            origin: 'ai-distill',
            evidence: JSON.stringify(evidence),
            patternSkeleton: JSON.stringify(draft.steps),
            patternInstances: JSON.stringify(instances),
            tags: JSON.stringify(['smelt', `scene:${sceneType}`]),
          }, { review: opts?.review })
          outcome.createdNoteIds.push(created.id)
          outcome.cardsCreated += 1
        }
      }

      // 成本入台账（A5：熔断可见）
      await repos.passes.recordCompletedPass({
        knowledgeBaseId: kbId,
        documentId: kbId,
        passType: 'smelt',
        passKey: `smelt:pattern:${Date.now()}`,
        stats: { clusters: outcome.clustersExamined, created: outcome.cardsCreated, evolved: outcome.cardsEvolved },
        cost: { calls: llmCalls, tokensIn: 0, tokensOut: 0 },
      })
      logger.info(
        `[kb-smelt] kb=${kbId} 套路归纳: 簇=${outcome.clustersExamined} 新卡=${outcome.cardsCreated} 演进=${outcome.cardsEvolved} 调用=${llmCalls}`,
      )
      return outcome
    } finally {
      this.running.delete(kbId)
    }
  }

  /** 单簇归纳（两次尝试；模型可主动 skip） */
  private async reflect(kbId: string, sceneType: string, sample: KbEventRecord[]) {
    let lastError = ''
    const scenes = sample.map((e) => {
      let participants: string[] = []
      try {
        participants = (JSON.parse(e.participants) as Array<{ name: string }>).map((p) => p.name)
      } catch {
        participants = []
      }
      return {
        summary: e.summary,
        participants,
        cause: e.cause,
        outcome: e.outcome,
        doc: e.sourceDocumentId.slice(0, 8),
      }
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        attempt === 0
          ? buildInducePatternUser({ sceneType, scenes })
          : `${buildInducePatternUser({ sceneType, scenes })}\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。`
      try {
        const raw = await this.llm({ system: INDUCE_PATTERN_SYSTEM, user, maxTokens: 3000 })
        const parsed = parseInducePatternOutput(extractJsonFromResponse(raw))
        if ('skip' in parsed) {
          logger.info(`[kb-smelt] kb=${kbId} 套路簇主动跳过：${(parsed.reason ?? "").slice(0, 80)}`)
          return null
        }
        return parsed
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    logger.warn(`[kb-smelt] kb=${kbId} 套路归纳两试失败: ${lastError}`)
    return null
  }
}

let singleton: KbPatternInductService | null = null

export function getKbPatternInductService(): KbPatternInductService {
  if (!singleton) singleton = new KbPatternInductService()
  return singleton
}
