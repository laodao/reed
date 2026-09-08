/**
 * 领域学习周期推进调度器（M2-C；包内单例，基于 agent-harness 宿主直跑）
 * @module packs/domain-learning/services/dl-pace-scheduler.service
 *
 * 语义（m2-implementation-plan §2 M2-C）：
 * - 每个「active 且 pace.enabled」的空间按 intervalMin 周期推进一次，每 tick 最多
 *   起一个自动研究任务（概念研究优先，无候选时对未解问题开子研究）；
 * - 任务 = DlAgentHarnessService.sendMessage('research')（动作仍经 dl 服务校验落库，
 *   不另起炉灶；宿主 busy/scope 互斥之外再加调度器在途集合与冷却，防风暴/重复）；
 * - 载体：单例 + setInterval（可注入 timer），tick 为公开方法便于 TDD 直测；
 * - 候选口径：概念 = 非 group 且尚无任何卡片（无论 draft/published）；问题 =
 *   dl_question status=open；
 * - 仅桌面端（Electron 主进程）自动启停：Web 多租户无进程级定时器语义，返回
 *   web-disabled（IPC 仍可读写配置）。
 */

import { createLogger } from '@core/utils/logger'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type { DlConceptRow } from '@core/database/repositories/dl-concept.repository'
import type { DlQuestionRow } from '@core/database/repositories/dl-question.repository'
import type { DlProjectRow } from '@core/database/repositories/dl-project.repository'
import type { DlPaceSettings } from '@shared/types/domain-learning.types'
import { DEFAULT_DL_PACE_SETTINGS } from '@shared/types/domain-learning.types'

const logger = createLogger('DlPaceScheduler')

/** 定时器抽象（可注入 fake 便于测试） */
export interface DlTimerLike {
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

const defaultTimer: DlTimerLike = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
}

/** 调度默认值（进程级；每空间推进周期以 pace.intervalMin 为准） */
export const DL_PACE_TICK_MS = 60_000
export const DL_PACE_COOLDOWN_MS = 10 * 60_000
export const DL_PACE_MAX_CONCURRENT = 3

export type DlPaceJobKind = 'concept' | 'question'

/** 一个自动推进任务（sendMessage 载荷） */
export interface DlPaceJob {
  kind: DlPaceJobKind
  spaceId: string
  conceptId?: string | null
  questionId?: string | null
  message: string
}

export interface DlPaceSchedulerDeps {
  db: ICoreDatabaseManager
  /** 任务执行器（实际装配为 DlAgentHarnessService.sendMessage） */
  runJob: (job: DlPaceJob) => Promise<unknown>
  clock?: () => number
  timer?: DlTimerLike
  tickMs?: number
  cooldownMs?: number
  maxConcurrent?: number
}

/** 解析/归一化推进配置（行 DTO 已解析，这里兜底非法值） */
export function normalizePaceSettings(raw: DlPaceSettings | null | undefined): DlPaceSettings {
  const base = { ...DEFAULT_DL_PACE_SETTINGS, ...(raw ?? {}) }
  return {
    enabled: !!base.enabled,
    intervalMin: typeof base.intervalMin === 'number' && base.intervalMin >= 1 ? Math.floor(base.intervalMin) : 30,
    autoResearchConcepts: base.autoResearchConcepts !== false,
    autoResolveOpenQuestions: base.autoResolveOpenQuestions !== false,
  }
}

export class DlPaceSchedulerService {
  private static instance: DlPaceSchedulerService | null = null

  static getInstance(): DlPaceSchedulerService {
    if (!DlPaceSchedulerService.instance) {
      DlPaceSchedulerService.instance = new DlPaceSchedulerService()
    }
    return DlPaceSchedulerService.instance
  }

  /** 测试/热更重置 */
  static resetInstance(): void {
    DlPaceSchedulerService.instance?.stop()
    DlPaceSchedulerService.instance = null
  }

  private deps: DlPaceSchedulerDeps | null = null
  private handle: unknown | null = null
  /** 在途任务 key（防重复/并发帽） */
  private readonly running = new Set<string>()
  /** 每空间上次推进时间戳 */
  private readonly lastSpaceRun = new Map<string, number>()
  /** 任务级冷却（上次发起时间戳；失败/无卡片概念防风暴重试） */
  private readonly lastLaunch = new Map<string, number>()

  /** 装配依赖（幂等；服务层首次使用时调用一次） */
  configure(deps: DlPaceSchedulerDeps): void {
    this.deps = deps
  }

  isConfigured(): boolean {
    return this.deps !== null
  }

  /** 桌面端自动启停（web 端由调用方决定不启动） */
  start(timer: DlTimerLike = defaultTimer): void {
    if (!this.deps) return
    if (this.handle !== null) return
    const tickMs = this.deps.tickMs ?? DL_PACE_TICK_MS
    this.handle = timer.setInterval(() => {
      void this.tick().catch((e) => {
        logger.error(`[dl-pace] tick 异常：${e instanceof Error ? e.message : String(e)}`)
      })
    }, tickMs)
    logger.info(`[dl-pace] 调度器已启动（tick=${tickMs}ms）`)
  }

  stop(): void {
    if (this.handle === null) return
    defaultTimer.clearInterval(this.handle)
    this.handle = null
    logger.info('[dl-pace] 调度器已停止')
  }

  isRunning(): boolean {
    return this.handle !== null
  }

  runningCount(): number {
    return this.running.size
  }

  private get now(): () => number {
    return this.deps?.clock ?? Date.now
  }

  private get cooldownMs(): number {
    return this.deps?.cooldownMs ?? DL_PACE_COOLDOWN_MS
  }

  private get maxConcurrent(): number {
    return this.deps?.maxConcurrent ?? DL_PACE_MAX_CONCURRENT
  }

  // ==================== 候选查询（公开便于测试） ====================

  /** 尚无任何卡片的非目录知识概念（按创建序；图数据权威，不入 AI 判定） */
  async listConceptsNeedingResearch(spaceId: string): Promise<DlConceptRow[]> {
    const db = this.deps!.db
    const concepts = (await db.dlConcepts?.listByProject(spaceId)) ?? []
    const out: DlConceptRow[] = []
    for (const c of concepts) {
      if (c.nodeType === 'group') continue
      if (c.cardId) continue
      const card = await db.dlCards?.getCurrentByConcept(spaceId, c.id)
      if (!card) out.push(c)
    }
    return out
  }

  /** open 未解问题（按创建序） */
  async listOpenQuestions(spaceId: string): Promise<DlQuestionRow[]> {
    return (await this.deps!.db.dlQuestions?.listOpenByProject(spaceId)) ?? []
  }

  // ==================== 推进主循环 ====================

  /**
   * 执行一轮推进扫描（可注入 now 直测）。
   * @returns 本轮发起的任务数
   */
  async tick(now: number = this.now()): Promise<number> {
    if (!this.deps) throw new Error('DlPaceScheduler 未 configure')
    const db = this.deps.db
    const projects = (await db.dlProjects?.listAll()) ?? []
    let started = 0
    for (const p of projects) {
      if (started + this.running.size >= this.maxConcurrent) break
      if (p.status !== 'active') continue
      const pace = p.pace
      if (!pace?.enabled) continue
      const last = this.lastSpaceRun.get(p.id) ?? 0
      const intervalMs = Math.max(1, pace.intervalMin) * 60_000
      // last=0 = 从未推进过 → 视为到期（否则距 epoch 差会小于周期被误判为「刚跑过」）
      if (last !== 0 && now - last < intervalMs) continue

      const job = await this.nextJob(p, now)
      if (job) {
        this.launch(job, now)
        started++
      }
      this.lastSpaceRun.set(p.id, now)
    }
    return started
  }

  /** 每空间候选选择：概念优先；均冷却/在途则 null（本 tick 不推进） */
  private async nextJob(p: DlProjectRow, now: number): Promise<DlPaceJob | null> {
    const pace = normalizePaceSettings(p.pace)
    if (pace.autoResearchConcepts) {
      const candidates = await this.listConceptsNeedingResearch(p.id)
      for (const c of candidates) {
        const key = `concept:${p.id}:${c.id}`
        if (this.running.has(key) || this.isCooling(key, now)) continue
        return {
          kind: 'concept',
          spaceId: p.id,
          conceptId: c.id,
          message: `（自动推进）请研究概念「${c.name}」并产出讲义草稿。采集纪律：资料不足先规划路由，知识库（wf_kb_retrieve）/网页（wf_web_extract/http_get，含 arXiv export.arxiv.org）取真实资料，evidence 有出处才 dl_save_card；完成后用一段话总结。`,
        }
      }
    }
    if (pace.autoResolveOpenQuestions) {
      const open = await this.listOpenQuestions(p.id)
      for (const q of open) {
        const key = `question:${p.id}:${q.id}`
        if (this.running.has(key) || this.isCooling(key, now)) continue
        return {
          kind: 'question',
          spaceId: p.id,
          conceptId: q.conceptId ?? null,
          questionId: q.id,
          message: `（自动推进·未解问题开子研究）请研究下面的问题并尽量给出有据答案（找不到足够材料时如实说明缺什么、保持问题 open）：${q.question}`,
        }
      }
    }
    return null
  }

  /** 发起任务：入在途集合 + 冷却，fire-and-forget 执行（异常日志不炸 tick） */
  private launch(job: DlPaceJob, now: number): void {
    const key = this.keyOf(job)
    this.running.add(key)
    this.lastLaunch.set(key, now)
    void this.deps!.runJob(job)
      .catch((e) => {
        logger.error(`[dl-pace] 自动任务失败 ${key}：${e instanceof Error ? e.message : String(e)}`)
      })
      .finally(() => {
        this.running.delete(key)
      })
  }

  private keyOf(job: DlPaceJob): string {
    return job.kind === 'concept'
      ? `concept:${job.spaceId}:${job.conceptId}`
      : `question:${job.spaceId}:${job.questionId}`
  }

  private isCooling(key: string, now: number): boolean {
    const last = this.lastLaunch.get(key)
    if (last === undefined) return false
    return now - last < this.cooldownMs
  }
}
