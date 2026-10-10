/**
 * 知识大脑·后台自动化（提炼动作免手点）
 * @module platform/services/kb-brain/automation.service
 *
 * 开机延时 + 挂机定时，按库跑流程化管线（顺序即依赖序）：
 *   续消化 → 分层补标 → 书级汇总 → 目标提炼 → 归纳整理 → 垃圾清理 → 伏笔扫描
 *
 * 设计约束：
 * - 产物一律进待审提议（人审），自动化的是生产不是入库——与「AI 产物永不直接
 *   published」的既有纪律一致；
 * - 每个动作有冷却（brain_state.automation 记账，重启不复位），目标重跑额外要求
 *   论断池明显增长（防日日重复出近似卡）；
 * - 消化中/动作进行中让位：本轮跳过该步，下一轮继续（各服务自带单飞锁）；
 * - 需要 LLM 的步骤共享 KB_BRAIN_DAILY_COST_LIMIT 熔断（与消化链路同一口径）；
 * - Electron 挂机调度（metabolize 同款限制：Web 多租户不启用）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import type { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import type { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import {
  parseBrainConfig,
  parseBrainState,
  stringifyBrainState,
  type KbBrainConfig,
  type KbBrainState
} from './brain-config'
import {
  enqueueDigestForExisting,
  reviveExhaustedFor,
  backfillScenesForKb
} from './digest-orchestrator.service'
import { getKbLayerRelabelService, KbLayerRelabelService } from './layer-relabel.service'
import { getKbRejudgeService } from './rejudge.service'
import { getKbDimensionInductService } from './dimension-induct.service'
import { getKbBookReadingService } from './book-reading.service'
import { getKbGraphBuildService } from './graph-build.service'
import { getKbBookReviewService } from './book-review.service'
import { getKbBookPassesService, KbBookPassesService } from './book-passes.service'
import { getKbGoalDistillService, KbGoalDistillService } from './goal-distill.service'
import { getKbConsolidateService } from './consolidate.service'
import { getKbCleanupService } from './cleanup.service'
import { getKbForeshadowScanService } from './foreshadow-scan.service'
import { getKbSmeltPipelineService } from './smelt-pipeline.service'
import { isDigestLive } from './liveness'
import { MIN_EVENTS_FOR_SMELT } from './pattern-induct.service'
import { KbCorpusMergeService } from './corpus-merge.service'
import { KbCorpusPassesService } from './corpus-passes.service'
import { getKbQaSamplerService } from './qa-sampler.service'
import { getKbAutomationLogService } from './automation-log.service'
import { parseModelRef } from './llm'

const logger = createLogger('KbBrainAutomation')

/** 各动作冷却（ms）：补标/书级/目标/归纳/冶炼 24h，清理/伏笔 7d，耗尽章复活 24h，场面补采 6h（一轮 200 章） */
const COOLDOWN = {
  relabel: 24 * 3600_000,
  rejudge: 24 * 3600_000,
  dimensionInduct: 7 * 24 * 3600_000,
  /** 四件套（精读/图谱/复核/综述）按文档 7 天一轮——重活在自动化里的最低频档 */
  quartet: 7 * 24 * 3600_000,
  bookPasses: 24 * 3600_000,
  goal: 24 * 3600_000,
  consolidate: 24 * 3600_000,
  cleanup: 7 * 24 * 3600_000,
  foreshadow: 7 * 24 * 3600_000,
  reviveExhausted: 24 * 3600_000,
  sceneBackfill: 6 * 3600_000,
  smelt: 24 * 3600_000,
  corpusMerge: 7 * 24 * 3600_000
} as const

/** 四件套目标挑选：已消化、7 天未跑过的文档，取最旧一个（null=本轮没有可跑目标） */
async function docsQuartetTargets(
  repos: { docs: { findByKnowledgeBaseId(kbId: string): Promise<Array<{ id: string; name: string; brainStatus?: string | null }>> } },
  kbId: string,
  runs: Record<string, string>
): Promise<{ id: string; name: string } | null> {
  const docs = (await repos.docs.findByKnowledgeBaseId(kbId)).filter(d => d.brainStatus === 'digested')
  const now = Date.now()
  const due = docs
    .filter(d => {
      const last = runs[d.id]
      return !last || now - new Date(last).getTime() >= 7 * 24 * 3600_000
    })
    .sort((a, b) => (runs[a.id] ?? '').localeCompare(runs[b.id] ?? ''))
  return due[0] ?? null
}

/** 目标重跑的论断增长门槛：工作集论断较上次自动运行增长 ≥10% 且至少 +1 条 */
const GOAL_RERUN_GROWTH = 1.1

export interface KbBrainAutomationDeps {
  intervalMs?: number
  initialDelayMs?: number
  /** 测试注.fake 时间 */
  now?: () => number
  repos?: () => AutomationRepos | null
  digest?: {
    enqueue(documentId: string): Promise<boolean> | boolean
    reviveExhausted(documentId: string): Promise<number>
  }
  /** 存量场面补采（v2 P0 故事轨回填；缺省走 digest-orchestrator 的 activeService） */
  sceneBackfill?: (kbId: string, batch?: number) => Promise<{ processed: number; scenes: number }>
  /** 冶炼管线（v2 P1；缺省走 smelt-pipeline——每库按 brainConfig.models 现构造服务，模型按库隔离） */
  smelt?: { isRunning(kbId: string): boolean; runAll(kbId: string, modelRef?: string): Promise<unknown> }
  /** 品类归并（v2 P3：跨书实体归并 + 变体矩阵；缺省合并 corpus-merge 与 corpus-passes） */
  corpus?: {
    isRunning(kbId: string): boolean
    run(kbId: string, modelRef?: string): Promise<{ merged: number; corpusMarked: number; matrixNoteIds: string[] }>
  }
  /** 存量论断重判（v3 M1；缺省 rejudge 单例） */
  rejudge?: { isRunning(kbId: string): boolean; setModelOverride?(kbId: string, fn: () => { providerConfigId?: string; modelId?: string }): void; run(kbId: string): Promise<{ knowledgeCount: number; evidenceCount: number; junkCount: number; failedBatches: number }> }
  /** 维度归纳（v3 M1；缺省 dimension-induct 单例） */
  dimensionInduct?: { isRunning(kbId: string): boolean; setModelOverride?(kbId: string, fn: () => { providerConfigId?: string; modelId?: string }): void; propose(kbId: string): Promise<{ seeded: number; proposed: number; skipped: boolean; reason?: string }> }
  /** 滚动阅读四件套（v3 M1 #9：精读/图谱/复核/综述；缺省动态 import 各单例） */
  quartet?: {
    isRunning(kbId: string): boolean
    reading(kbId: string, documentId: string): Promise<unknown>
    graph(kbId: string, documentId: string): Promise<unknown>
    review(kbId: string, documentId: string, docName: string): Promise<unknown>
    summary(kbId: string, documentId: string, docName: string): Promise<unknown>
  }
  /** 动作日志（v2 P4 undo 依据；缺省 automation-log 单例） */
  autoLog?: { record(kbId: string, action: string, detail: Record<string, unknown>): Promise<unknown> }
  relabel?: Pick<KbLayerRelabelService, 'isRunning' | 'run' | 'setModelOverride'>
  bookPasses?: Pick<KbBookPassesService, 'isRunningKb' | 'runForKnowledgeBase' | 'setModelOverride'>
  goals?: Pick<KbGoalDistillService, 'isRunning' | 'runGoal' | 'setModelOverride'>
  consolidate?: { isRunning(kbId: string): boolean; run(kbId: string): Promise<unknown> }
  cleanup?: { isRunning(kbId: string): boolean; run(kbId: string): Promise<unknown> }
  foreshadow?: { isRunning(kbId: string): boolean; run(kbId: string): Promise<unknown> }
}

export interface AutomationRepos {
  kbs: Pick<KnowledgeBaseRepository, 'findAll' | 'findById' | 'updateBrainState'>
  docs: Pick<KbDocumentRepository, 'findByKnowledgeBaseId' | 'updateBrainStatus'>
  atoms: Pick<KbAtomRepository, 'statsByKb'>
  passes: Pick<KbDigestPassRepository, 'costByKb' | 'listByDocument'>
  /** 场面事件量（v2 P1 冶炼增长门的数据源；旧库未装配时为 null——冶炼步骤跳过） */
  events?: { countByKb(kbId: string): Promise<number> } | null
}

export interface AutomationCycleResult {
  kbId: string
  ran: Array<string>
  skipped?: 'disabled' | 'digesting' | 'cost-limit' | 'busy' | 'no-repos'
  /** 各动作失败原因（fail-soft：单动作失败不阻断后续动作，下轮按冷却重试） */
  errors?: Array<{ action: string; error: string }>
}

export class KbBrainAutomationService {
  private readonly depsDeps: KbBrainAutomationDeps
  private readonly intervalMs: number
  private readonly initialDelayMs: number
  private readonly nowFn: () => number
  private timer: ReturnType<typeof setInterval> | null = null
  private bootTimer: ReturnType<typeof setTimeout> | null = null
  /** 每库周期单飞（goal 提炼可达数十分钟，interval 重入靠它让位） */
  private readonly cycleRunning = new Set<string>()

  constructor(deps: KbBrainAutomationDeps = {}) {
    this.depsDeps = deps
    this.intervalMs = deps.intervalMs ?? 30 * 60_000
    this.initialDelayMs = deps.initialDelayMs ?? 90_000
    this.nowFn = deps.now ?? (() => Date.now())
  }

  /* ---------- 生产依赖（惰性组装，避免 import 期触碰未初始化的管理器/服务） ---------- */

  private repos(): AutomationRepos | null {
    if (this.depsDeps.repos) return this.depsDeps.repos()
    const db = getCoreDatabaseManager()
    if (!db.knowledgeBases || !db.kbDocuments || !db.kbAtoms || !db.kbDigestPasses) return null
    return {
      kbs: db.knowledgeBases,
      docs: db.kbDocuments,
      atoms: db.kbAtoms,
      passes: db.kbDigestPasses,
      events: db.kbEvents ?? null
    }
  }

  private get digest(): NonNullable<KbBrainAutomationDeps['digest']> {
    return (
      this.depsDeps.digest ?? {
        enqueue: id => enqueueDigestForExisting(id, { revive: false }),
        reviveExhausted: reviveExhaustedFor
      }
    )
  }
  private get sceneBackfillFn(): NonNullable<KbBrainAutomationDeps['sceneBackfill']> {
    return this.depsDeps.sceneBackfill ?? ((kbId, batch) => backfillScenesForKb(kbId, batch))
  }
  private get smelt(): NonNullable<KbBrainAutomationDeps['smelt']> {
    return this.depsDeps.smelt ?? getKbSmeltPipelineService()
  }
  private get corpus(): NonNullable<KbBrainAutomationDeps['corpus']> {
    return (
      this.depsDeps.corpus ?? {
        isRunning: (kbId: string) => new KbCorpusMergeService().isRunning(kbId),
        run: async (kbId: string, modelRef?: string) => {
          const override = () => (modelRef ? parseModelRef(modelRef) : {})
          // 修复（10-07 审查 H1 死链）：曾硬传 null → 嵌入走降级 → 归并恒 merged:0；
          // 按库取 embeddingConfig 才能让跨书概念比对真正跑起来
          const kbRow = await getCoreDatabaseManager().knowledgeBases?.findById(kbId)
          const embeddingConfig = kbRow?.embeddingConfig ?? null
          const merged = await new KbCorpusMergeService({ modelOverride: override }).run(kbId, embeddingConfig)
          // 矩阵吃 merge 的 scope 标注；质量门与冶炼同源（低分期矩阵也走待审）
          const gate = await getKbQaSamplerService().gateOf(kbId).catch(() => 'publish' as const)
          const matrix = await new KbCorpusPassesService({ modelOverride: override }).runSettingMatrix(kbId, { review: gate === 'review' })
          return { merged: merged.merged, corpusMarked: merged.corpusMarked, matrixNoteIds: matrix.createdNoteIds }
        },
      }
    )
  }
  private get autoLog(): NonNullable<KbBrainAutomationDeps['autoLog']> {
    return (
      this.depsDeps.autoLog ?? {
        record: (kbId: string, action: string, detail: Record<string, unknown>) =>
          getKbAutomationLogService().record(kbId, action, detail),
      }
    )
  }
  private get relabel(): NonNullable<KbBrainAutomationDeps['relabel']> {
    return this.depsDeps.relabel ?? getKbLayerRelabelService()
  }
  private get rejudge(): NonNullable<KbBrainAutomationDeps['rejudge']> {
    return this.depsDeps.rejudge ?? getKbRejudgeService()
  }
  private get dimensionInduct(): NonNullable<KbBrainAutomationDeps['dimensionInduct']> {
    return this.depsDeps.dimensionInduct ?? getKbDimensionInductService()
  }
  private get quartet(): NonNullable<KbBrainAutomationDeps['quartet']> {
    return (
      this.depsDeps.quartet ?? {
        isRunning: (kbId: string) => getKbBookReadingService().isRunningKb(kbId) || getKbGraphBuildService().isRunning(kbId),
        reading: async (kbId, documentId) => {
          const svc = getKbBookReadingService()
          const kbRow = await getCoreDatabaseManager().knowledgeBases?.findById(kbId)
          const cfg = kbRow?.brainConfig ? parseBrainConfig(kbRow.brainConfig) : null
          svc.setModelOverride(kbId, () => (cfg?.models.adjudicate ? parseModelRef(cfg.models.adjudicate) : {}))
          return svc.run(kbId, documentId)
        },
        graph: async (kbId, documentId) => {
          const svc = getKbGraphBuildService()
          const kbRow = await getCoreDatabaseManager().knowledgeBases?.findById(kbId)
          const cfg = kbRow?.brainConfig ? parseBrainConfig(kbRow.brainConfig) : null
          svc.setModelOverride(kbId, () => (cfg?.models.adjudicate ? parseModelRef(cfg.models.adjudicate) : {}))
          return svc.run(kbId, documentId)
        },
        review: async (kbId, documentId, docName) => {
          const svc = getKbBookReviewService()
          const kbRow = await getCoreDatabaseManager().knowledgeBases?.findById(kbId)
          const cfg = kbRow?.brainConfig ? parseBrainConfig(kbRow.brainConfig) : null
          svc.setModelOverride(kbId, () => (cfg?.models.adjudicate ? parseModelRef(cfg.models.adjudicate) : {}))
          return svc.runReview(kbId, documentId, docName)
        },
        summary: async (kbId, documentId, docName) => {
          const svc = getKbBookReviewService()
          return svc.runSummary(kbId, documentId, docName)
        },
      }
    )
  }
  private get bookPasses(): NonNullable<KbBrainAutomationDeps['bookPasses']> {
    return this.depsDeps.bookPasses ?? getKbBookPassesService()
  }
  private get goals(): NonNullable<KbBrainAutomationDeps['goals']> {
    return this.depsDeps.goals ?? getKbGoalDistillService()
  }
  private get consolidate(): NonNullable<KbBrainAutomationDeps['consolidate']> {
    return this.depsDeps.consolidate ?? getKbConsolidateService()
  }
  private get cleanup(): NonNullable<KbBrainAutomationDeps['cleanup']> {
    return this.depsDeps.cleanup ?? getKbCleanupService()
  }
  private get foreshadow(): NonNullable<KbBrainAutomationDeps['foreshadow']> {
    return this.depsDeps.foreshadow ?? getKbForeshadowScanService()
  }

  /* ---------- 调度 ---------- */

  /** Electron 挂机调度；幂等可重复调用。Web 端不启用（metabolize 同款限制）。 */
  start(): void {
    if (this.timer) return
    this.bootTimer = setTimeout(() => {
      this.bootTimer = null
      void this.runAll()
    }, this.initialDelayMs)
    this.timer = setInterval(() => {
      void this.runAll()
    }, this.intervalMs)
    logger.info(
      `[kb-brain-auto] 后台自动化已启动（开机 ${Math.round(this.initialDelayMs / 1000)}s 后首跑，之后每 ${Math.round(this.intervalMs / 60000)}min 巡检；各动作按冷却记账执行）`
    )
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.bootTimer) {
      clearTimeout(this.bootTimer)
      this.bootTimer = null
    }
  }

  /** 全库巡检：每库一个周期，并行启动、周期内步骤串行；周期单飞防重入 */
  async runAll(): Promise<AutomationCycleResult[]> {
    const repos = this.repos()
    if (!repos) return []
    let kbIds: string[] = []
    try {
      kbIds = (await repos.kbs.findAll()).map(k => k.id)
      logger.info(`[kb-brain-auto] 巡检开始：${kbIds.length} 个库`)
    } catch (e) {
      logger.warn(`[kb-brain-auto] 列库失败: ${e instanceof Error ? e.message : String(e)}`)
      return []
    }
    const results: Array<Promise<AutomationCycleResult>> = []
    for (const kbId of kbIds) {
      if (this.cycleRunning.has(kbId)) continue
      this.cycleRunning.add(kbId)
      const cycle: Promise<AutomationCycleResult> = this.runCycle(kbId)
        .catch(
          (e): AutomationCycleResult => ({
            kbId,
            ran: [],
            errors: [{ action: 'cycle', error: e instanceof Error ? e.message : String(e) }]
          })
        )
        .finally(() => this.cycleRunning.delete(kbId))
      results.push(cycle)
    }
    return Promise.all(results)
  }

  /* ---------- 单库周期 ---------- */

  async runCycle(kbId: string): Promise<AutomationCycleResult> {
    const repos = this.repos()
    if (!repos) return { kbId, ran: [], skipped: 'no-repos' }
    const kb = await repos.kbs.findById(kbId)
    if (!kb) return { kbId, ran: [], skipped: 'disabled' }
    let cfg: KbBrainConfig | null
    try {
      cfg = parseBrainConfig(kb.brainConfig)
    } catch (e) {
      logger.warn(
        `[kb-brain-auto] kb=${kbId} 配置损坏跳过: ${e instanceof Error ? e.message : String(e)}`
      )
      return { kbId, ran: [], skipped: 'disabled' }
    }
    if (!cfg?.enabled || !cfg.automation.enabled) return { kbId, ran: [], skipped: 'disabled' }
    if (await this.costExceeded(kbId, repos.passes)) return { kbId, ran: [], skipped: 'cost-limit' }

    const state = parseBrainState(kb.brainState)
    const auto = cfg.automation
    const ran: string[] = []
    const errors: Array<{ action: string; error: string }> = []
    // 单动作 fail-soft：失败记入 errors 不阻断后续动作（下轮按冷却重试），与消化链路同纪律
    const step = async (action: string, fn: () => Promise<void>): Promise<void> => {
      try {
        await fn()
        ran.push(action)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push({ action, error: msg })
        logger.warn(`[kb-brain-auto] kb=${kbId} ${action} 失败（不阻断后续）: ${msg}`)
      }
    }

    // 1. 续消化：有 failed/pending 文档 → 冷却复活耗尽章 + 入队，本轮到此为止
    //    （管线让位：消化完成的下一轮再跑下游提炼）
    if (auto.digest) {
      const docs = await repos.docs.findByKnowledgeBaseId(kbId)
      // 僵死看护：'digesting' 但台账 15min 内无任何更新 → 残留（崩溃/被杀时
      // status 停在 digesting、章级 pass 停在 running/pending，续消化会永久让位）。
      // 进程内存活的 run（liveness 注册表）先豁免——单章 LLM 调用（64K 预算下
      // 15-35min）超过时间窗是常态而非僵死，不能按台账静默误复位（review H5）；
      // 注册表只在本进程有效，进程死亡后 DB 侧陈旧判定照常兜底跨进程残留。
      const STALE_MS = 15 * 60_000
      for (const d of docs) {
        if (d.brainStatus !== 'digesting') continue
        if (isDigestLive(d.id)) continue
        const rows = await repos.passes.listByDocument(d.id)
        const now = this.nowFn()
        const freshActivity = rows.some(r => now - (r.updatedAt?.getTime() ?? 0) <= STALE_MS)
        if (freshActivity) continue
        const staleRunning = rows.filter(r => r.status === 'running')
        for (const r of staleRunning) await repos.passes.resetToPending(r.id)
        await repos.docs.updateBrainStatus(d.id, { status: 'pending' })
        d.brainStatus = 'pending'
        logger.info(
          `[kb-brain-auto] 僵死消化复位: doc=${d.id}（复位 ${staleRunning.length} 张陈旧 running 台账，台账 ${Math.round((now - Math.max(...rows.map(r => r.updatedAt?.getTime() ?? 0))) / 60_000)}min 无活动）`
        )
      }
      const digesting = docs.some(d => d.brainStatus === 'digesting')
      // v3 修复（M1 #8）：skipped 不再永久排除——文档完成时大脑未启用/未开消化被标
      // skipped，之后库启用了大脑却永远不补消化（加书不自动消化的病根）。
      // 本循环已按 cfg.enabled 门控，走到这里的库都是启用态，skipped 视同待消化。
      const pending = docs.filter(d => {
        const s = d.brainStatus ?? ''
        return s !== 'digested' && s !== 'digesting'
      })
      if (digesting) return { kbId, ran, skipped: 'digesting' }
      if (pending.length > 0) {
        if (this.cool(state, 'lastExhaustedReviveAt', COOLDOWN.reviveExhausted)) {
          for (const d of pending) await this.digest.reviveExhausted(d.id)
          this.mark(state, 'lastExhaustedReviveAt')
          await this.saveState(kbId, repos.kbs, state)
        }
        for (const d of pending) await this.digest.enqueue(d.id)
        logger.info(
          `[kb-brain-auto] kb=${kbId} 续消化 ${pending.length} 篇（耗尽章按冷却复活），下游提炼等消化完成`
        )
        return { kbId, ran: ['digest'] }
      }
    }

    // 1.5 存量场面补采（v2 P0 故事轨）：已消化文档的 events-only 回填，每轮 ≤200 章、
    //     6h 冷却 + 成本熔断（digest-orchestrator 内部同口径判定），台账幂等推进
    if (auto.sceneBackfill && this.cool(state, 'lastSceneBackfillAt', COOLDOWN.sceneBackfill)) {
      await step('scene-backfill', async () => {
        const out = await this.sceneBackfillFn(kbId)
        // 一轮跑满 200 章说明存量还没采完——冷却照记（熔断/日限才是真正的节流阀），
        // processed=0 且台账全 done 时后续轮次自然空转零成本
        this.mark(state, 'lastSceneBackfillAt')
        await this.saveState(kbId, repos.kbs, state)
        if (out.processed > 0)
          logger.info(
            `[kb-brain-auto] kb=${kbId} 场面补采 ${out.processed} 章 / ${out.scenes} 场面`
          )
      })
    }

    // 1.6 冶炼层（v2 P1）：事件原料够量（首跑 ≥16）且较上次明显增长（≥10%+1）才跑——
    //     阶段序（套路→案例→原理→品类认知）与 fail-soft 在 smelt-pipeline 内部；成本入台账对熔断可见
    if (auto.smelt && repos.events && !this.smelt.isRunning(kbId)) {
      const eventsNow = await repos.events.countByKb(kbId)
      const baseline = state.automation?.smeltEvents
      const enough = eventsNow >= MIN_EVENTS_FOR_SMELT
      const grew = baseline === undefined || eventsNow >= Math.ceil(baseline * GOAL_RERUN_GROWTH) + 1
      if (enough && grew && this.cool(state, 'lastSmeltAt', COOLDOWN.smelt)) {
        await step('smelt', async () => {
          const out = (await this.smelt.runAll(kbId, cfg.models.adjudicate || undefined)) as {
            noteIds?: string[]
            gate?: string
            drift?: string
          }
          // v2 P4 动作日志：产物 noteIds 落台账（面板时间线 + 撤销依据）；无产物不记。
          // v3 #10：场面类型漂移告警随日志可见（此前只进文件日志，用户无从感知）
          if (out?.noteIds?.length || out?.drift) {
            await this.autoLog.record(kbId, 'smelt', {
              noteIds: out.noteIds ?? [],
              gate: out.gate ?? 'publish',
              ...(out.drift ? { drift: out.drift } : {}),
            })
          }
          this.mark(state, 'lastSmeltAt')
          state.automation = { ...state.automation, smeltEvents: eventsNow }
          await this.saveState(kbId, repos.kbs, state)
        })
      }
    }

    // 1.7 品类归并（v2 P3）：跨书实体归并 + 设定变体矩阵，7d 冷却（低频重活）；
    //     依赖冶炼先跑出套路卡/事件分布——紧跟 smelt 之后
    if (auto.corpusMerge && !this.corpus.isRunning(kbId) && this.cool(state, 'lastCorpusMergeAt', COOLDOWN.corpusMerge)) {
      await step('corpus-merge', async () => {
        const out = await this.corpus.run(kbId, cfg.models.adjudicate || undefined)
        if (out.matrixNoteIds.length > 0) {
          await this.autoLog.record(kbId, 'corpus', { noteIds: out.matrixNoteIds, merged: out.merged, corpusMarked: out.corpusMarked })
        }
        this.mark(state, 'lastCorpusMergeAt')
        await this.saveState(kbId, repos.kbs, state)
      })
    }

    // 2. 分层补标：仅「工作集全 detail」且论断池较上次补标有增长时触发
    const stats = await repos.atoms.statsByKb(kbId)
    const workingTotal =
      (stats.byStatus.supported ?? 0) +
      (stats.byStatus.suspected ?? 0) +
      (stats.byStatus.stale ?? 0)
    if (auto.layerRelabel && !this.relabel.isRunning(kbId)) {
      const allDetail =
        workingTotal > 0 &&
        (stats.byLayer.setting ?? 0) === 0 &&
        (stats.byLayer.craft ?? 0) === 0 &&
        (stats.byLayer.describe ?? 0) === 0
      const grew =
        !state.automation?.relabelAtoms ||
        workingTotal >= Math.ceil(state.automation.relabelAtoms * GOAL_RERUN_GROWTH) + 1
      if (allDetail && grew && this.cool(state, 'lastLayerRelabelAt', COOLDOWN.relabel)) {
        await step('layer-relabel', async () => {
          this.relabel.setModelOverride?.(kbId, this.modelOverride(cfg))
          await this.relabel.run(kbId)
          this.mark(state, 'lastLayerRelabelAt')
          state.automation = { ...state.automation, relabelAtoms: workingTotal }
          await this.saveState(kbId, repos.kbs, state)
        })
      }
    }

    // 2.5 存量论断重判（v3 M1）：换书测试三档处置（knowledge/evidence/junk）——
    //     判据换血后对存量读书笔记的批量纠偏；按增长门槛门控防重确认空转
    if (auto.rejudge && !this.rejudge.isRunning(kbId)) {
      const grew =
        !state.automation?.rejudgeAtoms ||
        workingTotal >= Math.ceil(state.automation.rejudgeAtoms * GOAL_RERUN_GROWTH) + 1
      if (grew && this.cool(state, 'lastRejudgeAt', COOLDOWN.rejudge)) {
        await step('rejudge', async () => {
          this.rejudge.setModelOverride?.(kbId, this.modelOverride(cfg))
          const p = await this.rejudge.run(kbId)
          logger.info(
            `[kb-brain-auto] kb=${kbId} 重判完成: 知识 ${p.knowledgeCount} / 降证据 ${p.evidenceCount} / 归档 ${p.junkCount}（失败批 ${p.failedBatches}）`
          )
          this.mark(state, 'lastRejudgeAt')
          state.automation = { ...state.automation, rejudgeAtoms: workingTotal }
          await this.saveState(kbId, repos.kbs, state)
        })
      }
    }

    // 2.6 维度归纳（v3 M1）：种子补齐 + 从语料归纳建议维度（停用待启用）——
    //     7d 冷却；素材不足（synthesis 卡 <3）服务内部自跳过
    if (auto.dimensionInduct && !this.dimensionInduct.isRunning(kbId) && this.cool(state, 'lastDimensionInductAt', COOLDOWN.dimensionInduct)) {
      await step('dimension-induct', async () => {
        this.dimensionInduct.setModelOverride?.(kbId, this.modelOverride(cfg))
        const out = await this.dimensionInduct.propose(kbId)
        this.mark(state, 'lastDimensionInductAt')
        await this.saveState(kbId, repos.kbs, state)
        if (out.skipped) logger.info(`[kb-brain-auto] kb=${kbId} 维度归纳跳过: ${out.reason ?? ''}`)
        else logger.info(`[kb-brain-auto] kb=${kbId} 维度归纳: 种子 ${out.seeded} / 建议 ${out.proposed}`)
      })
    }

    // 3. 书级汇总：台账幂等（指纹未变的关自动跳过），冷却防空转
    if (
      auto.bookPasses &&
      !this.bookPasses.isRunningKb(kbId) &&
      this.cool(state, 'lastBookPassesAt', COOLDOWN.bookPasses)
    ) {
      await step('book-passes', async () => {
        this.bookPasses.setModelOverride(kbId, this.modelOverride(cfg))
        const docs = await repos.docs.findByKnowledgeBaseId(kbId)
        await this.bookPasses.runForKnowledgeBase(
          kbId,
          cfg.profile?.contentType ?? '',
          docs.map(d => d.id)
        )
        this.mark(state, 'lastBookPassesAt')
        await this.saveState(kbId, repos.kbs, state)
      })
    }

    // 3.5 滚动阅读四件套（v3 M1 #9）：精读→图谱→复核→综述，每轮至多一本已消化书，
    //     按文档 7 天冷却 + 成本熔断同口径——此前四件套只能人在面板手点，「合上电脑」状态下永不运行
    if (auto.smelt && !this.quartet.isRunning(kbId)) {
      // 成本熔断同口径（与补采一致）：当日调用超限则四件套让位
      const today = await repos.passes.costByKb(kbId, (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })())
      const costLimit = Number(process.env.KB_BRAIN_DAILY_COST_LIMIT ?? '')
      const overLimit = Number.isFinite(costLimit) && costLimit > 0 && today.calls > costLimit
      if (!overLimit) {
        const runs = state.automation?.quartetRuns ?? {}
        const target = await docsQuartetTargets(repos, kbId, runs)
        if (target) {
          await step('quartet', async () => {
            logger.info(`[kb-brain-auto] kb=${kbId} 四件套开始: doc=${target.id}（${target.name}）`)
            await this.quartet.reading(kbId, target.id)
            await this.quartet.graph(kbId, target.id)
            await this.quartet.review(kbId, target.id, target.name)
            await this.quartet.summary(kbId, target.id, target.name)
            state.automation = {
              ...(state.automation ?? {}),
              quartetRuns: { ...(state.automation?.quartetRuns ?? {}), [target.id]: new Date().toISOString() },
            }
            await this.saveState(kbId, repos.kbs, state)
          })
        }
      }
    }

    // 4. 目标提炼：首跑必跑；重跑需「冷却 + 论断池较上次增长」——素材没变不出近似卡
    if (auto.goalDistill) {
      for (const goal of cfg.goals.filter(g => g.enabled)) {
        if (this.goals.isRunning(kbId, goal.id)) continue
        const last = state.automation?.goalRuns?.[goal.id]
        const cooled = !last?.at || this.nowFn() - Date.parse(last.at) >= COOLDOWN.goal
        const grew = !last || workingTotal >= Math.ceil(last.atoms * GOAL_RERUN_GROWTH) + 1
        if (!cooled || !grew) continue
        await step(`goal:${goal.name}`, async () => {
          this.goals.setModelOverride(kbId, this.modelOverride(cfg))
          await this.goals.runGoal(kbId, goal)
          state.automation = {
            ...state.automation,
            goalRuns: {
              ...(state.automation?.goalRuns ?? {}),
              [goal.id]: { at: new Date(this.nowFn()).toISOString(), atoms: workingTotal }
            }
          }
          await this.saveState(kbId, repos.kbs, state)
        })
      }
    }

    // 5-7. 池子整理（归纳/清理/伏笔）：冷却 + 单飞让位
    if (
      auto.consolidate &&
      !this.consolidate.isRunning(kbId) &&
      this.cool(state, 'lastConsolidateAt', COOLDOWN.consolidate)
    ) {
      await step('consolidate', async () => {
        await this.consolidate.run(kbId)
        this.mark(state, 'lastConsolidateAt')
        await this.saveState(kbId, repos.kbs, state)
      })
    }
    if (
      auto.cleanup &&
      !this.cleanup.isRunning(kbId) &&
      this.cool(state, 'lastCleanupAt', COOLDOWN.cleanup)
    ) {
      await step('cleanup', async () => {
        await this.cleanup.run(kbId)
        this.mark(state, 'lastCleanupAt')
        await this.saveState(kbId, repos.kbs, state)
      })
    }
    if (
      auto.foreshadow &&
      !this.foreshadow.isRunning(kbId) &&
      this.cool(state, 'lastForeshadowAt', COOLDOWN.foreshadow)
    ) {
      await step('foreshadow', async () => {
        await this.foreshadow.run(kbId)
        this.mark(state, 'lastForeshadowAt')
        await this.saveState(kbId, repos.kbs, state)
      })
    }

    if (ran.length > 0) logger.info(`[kb-brain-auto] kb=${kbId} 周期完成: ${ran.join(' → ')}`)
    return errors.length > 0 ? { kbId, ran, errors } : { kbId, ran }
  }

  /* ---------- 工具 ---------- */

  private modelOverride(cfg: KbBrainConfig): () => { providerConfigId?: string; modelId?: string } {
    return () => (cfg.models.adjudicate ? parseModelRef(cfg.models.adjudicate) : {})
  }

  /** KB_BRAIN_DAILY_COST_LIMIT 熔断（与消化链路同口径：当日 calls 超限 → 本轮不做 LLM 动作） */
  private async costExceeded(
    kbId: string,
    passes: Pick<KbDigestPassRepository, 'costByKb'>
  ): Promise<boolean> {
    const rawLimit = process.env.KB_BRAIN_DAILY_COST_LIMIT
    const limit = Number(rawLimit ?? '')
    if (!rawLimit || !Number.isFinite(limit) || limit <= 0) return false
    const since = new Date()
    since.setHours(0, 0, 0, 0)
    const today = await passes.costByKb(kbId, since)
    if (today.calls > limit) {
      logger.warn(
        `[kb-brain-auto] kb=${kbId} 成本熔断: 今日 ${today.calls} 次 > 限额 ${limit}，本轮跳过`
      )
      return true
    }
    return false
  }

  private cool(
    state: KbBrainState,
    key: keyof NonNullable<KbBrainState['automation']>,
    cooldownMs: number
  ): boolean {
    const raw = state.automation?.[key]
    if (typeof raw !== 'string') return true
    const t = Date.parse(raw)
    return !Number.isFinite(t) || this.nowFn() - t >= cooldownMs
  }

  private mark(state: KbBrainState, key: keyof NonNullable<KbBrainState['automation']>): void {
    state.automation = { ...(state.automation ?? {}), [key]: new Date(this.nowFn()).toISOString() }
  }

  private async saveState(
    kbId: string,
    kbs: Pick<KnowledgeBaseRepository, 'updateBrainState'>,
    state: KbBrainState
  ): Promise<void> {
    try {
      await kbs.updateBrainState(kbId, stringifyBrainState(state))
    } catch (e) {
      logger.warn(
        `[kb-brain-auto] kb=${kbId} 记账写回失败（不影响动作）: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }
}

let singleton: KbBrainAutomationService | null = null

export function getKbBrainAutomationService(): KbBrainAutomationService {
  if (!singleton) singleton = new KbBrainAutomationService()
  return singleton
}
