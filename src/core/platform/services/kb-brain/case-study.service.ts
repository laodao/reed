/**
 * 案例拆解（v2 P1）：每类场面选经典样本 → craft-case 卡（好在哪/学什么/原文）
 * @module platform/services/kb-brain/case-study.service
 *
 * 选样：桶内按质心代表性（embedding 中心度）+ 跨书分散优先；无嵌入降级为
 * 「不同书各取 quote 最长的一条」。每类 ≤2 个、单轮 ≤10 卡；同题跳过。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbEventRepository, KbEventRecord } from '@core/database/repositories/kb-event.repository'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { CASE_STUDY_SYSTEM, buildCaseStudyUser } from './prompts'
import { parseCaseStudyOutput } from './schemas'
import { defaultBrainLlm, type BrainLlmFn } from './llm'
import { defaultBrainEmbed, publishSmeltCard, topByCentrality } from './smelt-common'

const logger = createLogger('KbCaseStudy')

/** 单场面类型选样数与总量护栏 */
const PER_TYPE = 2
const TOTAL_CAP = 10
/** 该类型场面数达到此值才值得拆案例（低于此为孤例，孤例拆解无代表性） */
const MIN_BUCKET = 4

interface SmeltRepos {
  events: KbEventRepository
  notes: KbNoteRepository
  passes: KbDigestPassRepository
}

export interface CaseStudyDeps {
  llm?: BrainLlmFn
  embed?: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => SmeltRepos | null
}

export class KbCaseStudyService {
  private readonly llm: BrainLlmFn
  private readonly embedFn: NonNullable<CaseStudyDeps['embed']>
  private readonly reposFn: () => SmeltRepos | null
  private readonly running = new Set<string>()

  constructor(deps: CaseStudyDeps = {}) {
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

  async run(kbId: string, embeddingConfig: string | null, opts?: { review?: boolean }): Promise<{ cards: number; llmCalls: number; createdNoteIds: string[] }> {
    if (this.running.has(kbId)) return { cards: 0, llmCalls: 0, createdNoteIds: [] }
    const repos = this.reposFn()
    if (!repos) return { cards: 0, llmCalls: 0, createdNoteIds: [] }
    this.running.add(kbId)
    let llmCalls = 0
    try {
      const all = await repos.events.findByKb(kbId, { limit: 5000 })
      if (all.length === 0) return { cards: 0, llmCalls: 0, createdNoteIds: [] }

      const buckets = new Map<string, KbEventRecord[]>()
      for (const ev of all) {
        if (!buckets.has(ev.sceneType)) buckets.set(ev.sceneType, [])
        buckets.get(ev.sceneType)!.push(ev)
      }

      let cards = 0
      const createdNoteIds: string[] = []
      for (const [sceneType, bucket] of buckets) {
        if (bucket.length < MIN_BUCKET) continue
        if (cards >= TOTAL_CAP) break
        // 选样：中心度 top；同书去重优先（跨书分散）
        const texts = bucket.map((e) => `${e.summary}（${e.sceneType}）`)
        const vectors = await this.embedFn(texts, { id: kbId, embeddingConfig })
        const ranked = topByCentrality(bucket, vectors ?? [], bucket.length)
        const picked: KbEventRecord[] = []
        const seenDocs = new Set<string>()
        for (const ev of ranked) {
          if (picked.length >= PER_TYPE || cards + picked.length >= TOTAL_CAP) break
          if (seenDocs.has(ev.sourceDocumentId)) continue // 每类先保证跨书分散
          seenDocs.add(ev.sourceDocumentId)
          picked.push(ev)
        }
        for (const ev of picked) {
          const draft = await this.reflect(kbId, sceneType, ev)
          llmCalls += 1
          if (!draft) continue
          // 同题跳过（案例卡是一次性拆解，不演进）
          const similar = await repos.notes.findSimilarTitle(kbId, draft.title)
          if (similar.some((s) => s.title === draft.title && s.status !== 'archived')) continue
          const body = [
            `> 场面类型 ${sceneType}｜出自 ${ev.sourceDocumentId.slice(0, 8)}｜拆解质量 ${draft.quality}`,
            '',
            '## 好在哪',
            draft.whatWorks,
            '',
            '## 能学走什么',
            draft.learn,
            ...(draft.quoteFocus ? ['', '## 最值得细读的一句', `> ${draft.quoteFocus}`] : []),
            '',
            '## 原文',
            `> ${ev.sourceQuote.slice(0, 200)}`,
          ].join('\n')
          const created = await publishSmeltCard(repos.notes, kbId, {
            title: draft.title,
            description: `场面类型「${sceneType}」的经典案例拆解——写同类场面时可参考其结构与信息控制。`,
            body,
            type: 'craft-case',
            origin: 'ai-distill',
            evidence: JSON.stringify([{ eventId: ev.id, documentId: ev.sourceDocumentId, quote: ev.sourceQuote.slice(0, 120) }]),
            tags: JSON.stringify(['smelt', `scene:${sceneType}`]),
          }, { review: opts?.review })
          createdNoteIds.push(created.id)
          cards += 1
        }
      }

      if (llmCalls > 0) {
        await repos.passes.recordCompletedPass({
          knowledgeBaseId: kbId,
          documentId: kbId,
          passType: 'smelt',
          passKey: `smelt:case:${Date.now()}`,
          stats: { cards },
          cost: { calls: llmCalls, tokensIn: 0, tokensOut: 0 },
        })
      }
      logger.info(`[kb-smelt] kb=${kbId} 案例拆解: ${cards} 卡 / ${llmCalls} 调用`)
      return { cards, llmCalls, createdNoteIds }
    } finally {
      this.running.delete(kbId)
    }
  }

  private async reflect(kbId: string, sceneType: string, ev: KbEventRecord) {
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        attempt === 0
          ? buildCaseStudyUser({ sceneType, summary: ev.summary, cause: ev.cause, outcome: ev.outcome, quote: ev.sourceQuote, doc: ev.sourceDocumentId.slice(0, 8) })
          : `${buildCaseStudyUser({ sceneType, summary: ev.summary, cause: ev.cause, outcome: ev.outcome, quote: ev.sourceQuote, doc: ev.sourceDocumentId.slice(0, 8) })}\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。`
      try {
        const raw = await this.llm({ system: CASE_STUDY_SYSTEM, user, maxTokens: 2000 })
        const parsed = parseCaseStudyOutput(extractJsonFromResponse(raw))
        if ('skip' in parsed) {
          logger.info(`[kb-smelt] kb=${kbId} 案例平庸主动跳过：${(parsed.reason ?? "").slice(0, 80)}`)
          return null
        }
        return parsed
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    logger.warn(`[kb-smelt] kb=${kbId} 案例拆解两试失败: ${lastError}`)
    return null
  }
}

let singleton: KbCaseStudyService | null = null

export function getKbCaseStudyService(): KbCaseStudyService {
  if (!singleton) singleton = new KbCaseStudyService()
  return singleton
}
