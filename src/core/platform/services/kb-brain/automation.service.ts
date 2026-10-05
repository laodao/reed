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
  type KbBrainState,
} from './brain-config'
import { enqueueDigestForExisting, reviveExhaustedFor } from './digest-orchestrator.service'
import { getKbLayerRelabelService, KbLayerRelabelService } from './layer-relabel.service'
import { getKbBookPassesService, KbBookPassesService } from './book-passes.service'
import { getKbGoalDistillService, KbGoalDistillService } from './goal-distill.service'
import { getKbConsolidateService } from './consolidate.service'
import { getKbCleanupService } from './cleanup.service'
import { getKbForeshadowScanService } from './foreshadow-scan.service'
import { parseModelRef } from './llm'

const logger = createLogger('KbBrainAutomation')

/** 各动作冷却（ms）：补标/书级/目标/归纳 24h，清理/伏笔 7d，耗尽章复活 24h */
const COOLDOWN = {
  relabel: 24 * 3600_000,
  bookPasses: 24 * 3600_000,
  goal: 24 * 3600_000,
  consolidate: 24 * 3600_000,
  cleanup: 7 * 24 * 3600_000,
  foreshadow: 7 * 24 * 3600_000,
  reviveExhausted: 24 * 3600_000,
} as const

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
  relabel?: Pick<KbLayerRelabelService, 'isRunning' | 'run' | 'setModelOverride'>
  bookPasses?: Pick<KbBookPassesService, 'isRunningKb' | 'runForKnowledgeBase' | 'setModelOverride'>
  goals?: Pick<KbGoalDistillService, 'isRunning' | 'runGoal' | 'setModelOverride'>
  consolidate?: { isRunning(kbId: string): boolean; run(kbId: string): Promise<unknown> }
  cleanup?: { isRunning(kbId: string): boolean; run(kbId: string): Promise<unknown> }
  foreshadow?: { isRunning(kbId: string): boolean; run(kbId: string): Promise<unknown> }
}

export interface AutomationRepos {
  kbs: Pick<KnowledgeBaseRepository, 'findAll' | 'findById' | 'updateBrainState'>
  docs: Pick<KbDocumentRepository, 'findByKnowledgeBaseId'>
  atoms: Pick<KbAtomRepository, 'statsByKb'>
  passes: Pick<KbDigestPassRepository, 'costByKb'>
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
    }
  }

  private get digest(): NonNullable<KbBrainAutomationDeps['digest']> {
    return this.depsDeps.digest ?? { enqueue: (id) => enqueueDigestForExisting(id, { revive: false }), reviveExhausted: reviveExhaustedFor }
  }
  private get relabel(): NonNullable<KbBrainAutomationDeps['relabel']> {
    return this.depsDeps.relabel ?? getKbLayerRelabelService()
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
    logger.info(`[kb-brain-auto] 后台自动化已启动（开机 ${Math.round(this.initialDelayMs / 1000)}s 后首跑，之后每 ${Math.round(this.intervalMs / 60000)}min 巡检；各动作按冷却记账执行）`)
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
      kbIds = (await repos.kbs.findAll()).map((k) => k.id)
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
            errors: [{ action: 'cycle', error: e instanceof Error ? e.message : String(e) }],
          }),
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
      logger.warn(`[kb-brain-auto] kb=${kbId} 配置损坏跳过: ${e instanceof Error ? e.message : String(e)}`)
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
      const digesting = docs.some((d) => d.brainStatus === 'digesting')
      const pending = docs.filter((d) => {
        const s = d.brainStatus ?? ''
        return s !== 'digested' && s !== 'digesting' && s !== 'skipped'
      })
      if (digesting) return { kbId, ran, skipped: 'digesting' }
      if (pending.length > 0) {
        if (this.cool(state, 'lastExhaustedReviveAt', COOLDOWN.reviveExhausted)) {
          for (const d of pending) await this.digest.reviveExhausted(d.id)
          this.mark(state, 'lastExhaustedReviveAt')
          await this.saveState(kbId, repos.kbs, state)
        }
        for (const d of pending) await this.digest.enqueue(d.id)
        logger.info(`[kb-brain-auto] kb=${kbId} 续消化 ${pending.length} 篇（耗尽章按冷却复活），下游提炼等消化完成`)
        return { kbId, ran: ['digest'] }
      }
    }

    // 2. 分层补标：仅「工作集全 detail」且论断池较上次补标有增长时触发
    const stats = await repos.atoms.statsByKb(kbId)
    const workingTotal = (stats.byStatus.supported ?? 0) + (stats.byStatus.suspected ?? 0) + (stats.byStatus.stale ?? 0)
    if (auto.layerRelabel && !this.relabel.isRunning(kbId)) {
      const allDetail =
        workingTotal > 0 &&
        (stats.byLayer.outline ?? 0) === 0 &&
        (stats.byLayer.setting ?? 0) === 0 &&
        (stats.byLayer.describe ?? 0) === 0
      const grew = !state.automation?.relabelAtoms || workingTotal >= Math.ceil(state.automation.relabelAtoms * GOAL_RERUN_GROWTH) + 1
      if (allDetail && grew && this.cool(state, 'lastLayerRelabelAt', COOLDOWN.relabel)) {
        await step('layer-relabel', async () => {
          this.relabel.setModelOverride?.(this.modelOverride(cfg))
          await this.relabel.run(kbId)
          this.mark(state, 'lastLayerRelabelAt')
          state.automation = { ...state.automation, relabelAtoms: workingTotal }
          await this.saveState(kbId, repos.kbs, state)
        })
      }
    }

    // 3. 书级汇总：台账幂等（指纹未变的关自动跳过），冷却防空转
    if (auto.bookPasses && !this.bookPasses.isRunningKb(kbId) && this.cool(state, 'lastBookPassesAt', COOLDOWN.bookPasses)) {
      await step('book-passes', async () => {
        this.bookPasses.setModelOverride(this.modelOverride(cfg))
        const docs = await repos.docs.findByKnowledgeBaseId(kbId)
        await this.bookPasses.runForKnowledgeBase(kbId, cfg.profile?.contentType ?? '', docs.map((d) => d.id))
        this.mark(state, 'lastBookPassesAt')
        await this.saveState(kbId, repos.kbs, state)
      })
    }

    // 4. 目标提炼：首跑必跑；重跑需「冷却 + 论断池较上次增长」——素材没变不出近似卡
    if (auto.goalDistill) {
      for (const goal of cfg.goals.filter((g) => g.enabled)) {
        if (this.goals.isRunning(kbId, goal.id)) continue
        const last = state.automation?.goalRuns?.[goal.id]
        const cooled = !last?.at || this.nowFn() - Date.parse(last.at) >= COOLDOWN.goal
        const grew = !last || workingTotal >= Math.ceil(last.atoms * GOAL_RERUN_GROWTH) + 1
        if (!cooled || !grew) continue
        await step(`goal:${goal.name}`, async () => {
          this.goals.setModelOverride(this.modelOverride(cfg))
          await this.goals.runGoal(kbId, goal)
          state.automation = {
            ...state.automation,
            goalRuns: { ...(state.automation?.goalRuns ?? {}), [goal.id]: { at: new Date(this.nowFn()).toISOString(), atoms: workingTotal } },
          }
          await this.saveState(kbId, repos.kbs, state)
        })
      }
    }

    // 5-7. 池子整理（归纳/清理/伏笔）：冷却 + 单飞让位
    if (auto.consolidate && !this.consolidate.isRunning(kbId) && this.cool(state, 'lastConsolidateAt', COOLDOWN.consolidate)) {
      await step('consolidate', async () => {
        await this.consolidate.run(kbId)
        this.mark(state, 'lastConsolidateAt')
        await this.saveState(kbId, repos.kbs, state)
      })
    }
    if (auto.cleanup && !this.cleanup.isRunning(kbId) && this.cool(state, 'lastCleanupAt', COOLDOWN.cleanup)) {
      await step('cleanup', async () => {
        await this.cleanup.run(kbId)
        this.mark(state, 'lastCleanupAt')
        await this.saveState(kbId, repos.kbs, state)
      })
    }
    if (auto.foreshadow && !this.foreshadow.isRunning(kbId) && this.cool(state, 'lastForeshadowAt', COOLDOWN.foreshadow)) {
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
  private async costExceeded(kbId: string, passes: Pick<KbDigestPassRepository, 'costByKb'>): Promise<boolean> {
    const rawLimit = process.env.KB_BRAIN_DAILY_COST_LIMIT
    const limit = Number(rawLimit ?? '')
    if (!rawLimit || !Number.isFinite(limit) || limit <= 0) return false
    const since = new Date()
    since.setHours(0, 0, 0, 0)
    const today = await passes.costByKb(kbId, since)
    if (today.calls > limit) {
      logger.warn(`[kb-brain-auto] kb=${kbId} 成本熔断: 今日 ${today.calls} 次 > 限额 ${limit}，本轮跳过`)
      return true
    }
    return false
  }

  private cool(state: KbBrainState, key: keyof NonNullable<KbBrainState['automation']>, cooldownMs: number): boolean {
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
    state: KbBrainState,
  ): Promise<void> {
    try {
      await kbs.updateBrainState(kbId, stringifyBrainState(state))
    } catch (e) {
      logger.warn(`[kb-brain-auto] kb=${kbId} 记账写回失败（不影响动作）: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

let singleton: KbBrainAutomationService | null = null

export function getKbBrainAutomationService(): KbBrainAutomationService {
  if (!singleton) singleton = new KbBrainAutomationService()
  return singleton
}
