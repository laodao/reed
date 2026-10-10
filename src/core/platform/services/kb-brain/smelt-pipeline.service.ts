/**
 * 冶炼管线编排（v2 P1）：套路归纳 → 案例拆解 → 原理归纳 → 品类认知
 * @module platform/services/kb-brain/smelt-pipeline.service
 *
 * 顺序即依赖序：案例/原理消费套路的产出，品类认知汇总两者。每阶段 fail-soft
 * （单阶段失败不阻断后续，自动化下轮按冷却重试）；embeddingConfig 由 kb 行解析。
 * automation 消费的入口（零操作：冶炼只在后台管线发生，不设手动按钮）。
 * v2 P4：跑前解析质量门（qa-sampler 滚动均）——review 模式下产物进待审；
 * 跑后追加抽检阶段（judge 评分回写滚动窗口）；noteIds 聚合供动作日志/撤销。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import { parseModelRef } from './llm'
import { parseBrainConfig } from './brain-config'
import { KbPatternInductService, getKbPatternInductService } from './pattern-induct.service'
import { KbCaseStudyService, getKbCaseStudyService } from './case-study.service'
import { KbPrincipleDistillService } from './principle-distill.service'
import { KbCorpusPassesService } from './corpus-passes.service'

const logger = createLogger('KbSmeltPipeline')

export interface SmeltStageResult {
  stage: string
  ran: boolean
  summary: string
  error?: string
}

export interface SmeltPipelineOutcome {
  stages: SmeltStageResult[]
  llmCalls: number
  /** 本轮新建卡（撤销依据；automation 记 kb_automation_log） */
  noteIds: string[]
  /** 本轮质量门（review=产物进待审而非直发） */
  gate: 'publish' | 'review'
  /** 场面类型漂移告警（v3 #10：经 automation 记入动作日志，用户可见） */
  drift?: string
}

export interface SmeltPipelineDeps {
  modelRef?: string
  /** kb 行解析注入（测试）；缺省走 getCoreDatabaseManager */
  kbLookup?: (kbId: string) => Promise<{ embeddingConfig: string | null; modelRef?: string } | null>
  patternInduct?: KbPatternInductService
  caseStudy?: KbCaseStudyService
  principle?: KbPrincipleDistillService
  corpus?: KbCorpusPassesService
  /** 质检（v2 P4；缺省 qa-sampler 单例：门解析 + 跑后抽检） */
  qa?: { gateOf(kbId: string): Promise<'publish' | 'review'>; sample(kbId: string): Promise<unknown> }
}

export class KbSmeltPipelineService {
  private readonly deps: SmeltPipelineDeps

  constructor(deps: SmeltPipelineDeps = {}) {
    this.deps = deps
  }

  isRunning(kbId: string): boolean {
    const p = this.deps.patternInduct ?? getKbPatternInductService()
    const c = this.deps.caseStudy ?? getKbCaseStudyService()
    return p.isRunning(kbId) || c.isRunning(kbId)
  }

  /** 单库冶炼（阶段 fail-soft；返回各阶段摘要供日志/自动化记录） */
  async runAll(kbId: string, modelRef?: string): Promise<SmeltPipelineOutcome> {
    const kb = this.deps.kbLookup ? await this.deps.kbLookup(kbId) : await lookupKbForSmelt(kbId)
    if (!kb) return { stages: [], llmCalls: 0, noteIds: [], gate: 'publish' }
    const embeddingConfig = kb.embeddingConfig
    const resolvedModel = modelRef ?? this.deps.modelRef ?? kb.modelRef
    const override = () => (resolvedModel ? parseModelRef(resolvedModel) : {})

    // v2 P4 质量门：跑前解析（滚动抽检均分低 → 本轮产物进待审而非直发）
    const qa =
      this.deps.qa ??
      (await (async () => {
        const { getKbQaSamplerService } = await import('./qa-sampler.service')
        return getKbQaSamplerService()
      })())
    const gate = await qa.gateOf(kbId).catch(() => 'publish' as const)
    const review = { review: gate === 'review' }

    const patternInduct =
      this.deps.patternInduct ??
      new KbPatternInductService({ modelOverride: override })
    const caseStudy =
      this.deps.caseStudy ??
      new KbCaseStudyService({ modelOverride: override })
    const principle =
      this.deps.principle ??
      new KbPrincipleDistillService({ modelOverride: override })
    const corpus =
      this.deps.corpus ??
      new KbCorpusPassesService({ modelOverride: override })

    const stages: SmeltStageResult[] = []
    const noteIds: string[] = []
    let llmCalls = 0
    let drift: string | undefined
    const stage = async (name: string, fn: () => Promise<string>): Promise<void> => {
      try {
        const summary = await fn()
        stages.push({ stage: name, ran: true, summary })
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        stages.push({ stage: name, ran: false, summary: '', error })
        logger.warn(`[kb-smelt] kb=${kbId} ${name} 失败（不阻断后续）: ${error}`)
      }
    }

    await stage('pattern-induct', async () => {
      const out = await patternInduct.run(kbId, embeddingConfig, review)
      llmCalls += out.llmCalls
      noteIds.push(...out.createdNoteIds)
      return out.skipped ? `跳过：${out.reason ?? ''}` : `簇=${out.clustersExamined} 新卡=${out.cardsCreated} 演进=${out.cardsEvolved}`
    })
    await stage('case-study', async () => {
      const out = await caseStudy.run(kbId, embeddingConfig, review)
      llmCalls += out.llmCalls
      noteIds.push(...out.createdNoteIds)
      return `卡=${out.cards}`
    })
    await stage('principle', async () => {
      const out = await principle.run(kbId, embeddingConfig, review)
      llmCalls += out.llmCalls
      noteIds.push(...out.createdNoteIds)
      return `卡=${out.cards}`
    })
    await stage('genre-insight', async () => {
      const out = await corpus.runGenreInsight(kbId, review)
      noteIds.push(...out.createdNoteIds)
      return out.card ? '新卡' : out.evolved ? '演进' : '未产出'
    })
    // v2 P4：跑后抽检（judge 评分回写滚动窗口——质量门的数据来源）
    await stage('qa-sample', async () => {
      const out = await qa.sample(kbId)
      const o = out as { sampled?: number; avg?: number | null; gate?: string; drift?: string }
      if (o.drift) drift = o.drift
      return `抽检=${o.sampled ?? 0} 均分=${o.avg?.toFixed(2) ?? '—'}${o.drift ? `；漂移告警：${o.drift}` : ''}`
    })

    logger.info(`[kb-smelt] kb=${kbId} 冶炼完成(${gate}): ${stages.map((s) => `${s.stage}(${s.ran ? s.summary || 'ok' : '失败'})`).join(' → ')}`)
    return { stages, llmCalls, noteIds, gate, drift }
  }
}

let singleton: KbSmeltPipelineService | null = null

/** 生产 kb 行解析：embedding 配置 + 每库裁决模型（brainConfig.models.adjudicate） */
async function lookupKbForSmelt(kbId: string): Promise<{ embeddingConfig: string | null; modelRef?: string } | null> {
  const db = getCoreDatabaseManager()
  const kbs = db.knowledgeBases
  if (!kbs) return null
  const row = await kbs.findById(kbId)
  if (!row) return null
  let modelRef: string | undefined
  try {
    modelRef = parseBrainConfig(row.brainConfig)?.models.adjudicate || undefined
  } catch {
    modelRef = undefined
  }
  return { embeddingConfig: row.embeddingConfig ?? null, modelRef }
}

export function getKbSmeltPipelineService(): KbSmeltPipelineService {
  if (!singleton) singleton = new KbSmeltPipelineService()
  return singleton
}
