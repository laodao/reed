/**
 * 工作流触发调度器（cron 定时 + 事件触发）
 * @module core/modules/workflow/trigger/workflow-trigger-scheduler.service
 * @description 参照 VoiceCloneJobScheduler 的单例 + setInterval + 可注入 timer 模式。
 *
 *              cron 语义（功能定稿）：
 *              - tick 扫 next_fire_at 到期的已发布定义（跨租户 raw 扫描，
 *                按 userId 分组重建 ALS 后执行）
 *              - 错过判定：next_fire_at 落后超过 graceWindow（2×tick）视为错过，
 *                不补跑，推进到未来首个触发点；grace 内正常触发
 *              - 只在触发/推进时写库（tick 空转零写）
 *              - 发布/启停触发器时调 recomputeOne 立即刷新 next_fire_at
 *
 *              事件触发：启动时全量构建内存索引（事件名 → 触发器列表），
 *              定义发布/更新时 refreshEventIndex；匹配 userId（同租户）+
 *              可选 payload 等值过滤 → startRun。
 *
 *              双端 boot：Electron 与 Web 启动序列各调 start()。
 */

import { CronExpressionParser } from 'cron-parser'
import { runWithUserAsync } from '@core/context/user-context'
import type { WorkflowTrigger } from '@shared/types/workflow.types'
import { WORKFLOW_DEFAULTS } from '@shared/types/workflow.types'
import { subscribeDomainEvents, type DomainEvent } from './domain-event-bus'
import type { WorkflowDefinitionRepository } from '../../../database/repositories/workflow-definition.repository'
import type { WorkflowRunService } from '../workflow-run.service'

/** 定时器注入接口（测试用 fake timers） */
export interface SchedulerTimer {
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

const defaultTimer: SchedulerTimer = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
}

/** cron 表达式预览结果（编辑器即时反馈） */
export function previewCronExpression(expression: string): {
  valid: boolean
  next5: string[]
  error?: string
} {
  try {
    const interval = CronExpressionParser.parse(expression)
    const next5: string[] = []
    for (let i = 0; i < 5; i++) {
      next5.push(interval.next().toDate().toISOString())
    }
    return { valid: true, next5 }
  } catch (e) {
    return { valid: false, next5: [], error: e instanceof Error ? e.message : '表达式无效' }
  }
}

export class WorkflowTriggerScheduler {
  private static instance: WorkflowTriggerScheduler | null = null

  private tickHandle: unknown = null
  private unsubscribeEvents: (() => void) | null = null
  /** 事件触发器内存索引：事件名 → 触发器列表 */
  private eventIndex = new Map<string, Array<{
    definitionId: string
    userId: string | null
    match?: Record<string, string | number | boolean>
  }>>()
  private started = false

  constructor(
    private readonly deps: {
      definitions: WorkflowDefinitionRepository
      runService: WorkflowRunService
    },
    private readonly timer: SchedulerTimer = defaultTimer,
    private readonly tickMs: number = WORKFLOW_DEFAULTS.cronTickMs
  ) {}

  static getInstance(deps?: ConstructorParameters<typeof WorkflowTriggerScheduler>[0]): WorkflowTriggerScheduler {
    if (!WorkflowTriggerScheduler.instance) {
      if (!deps) throw new Error('[WorkflowTriggerScheduler] 未初始化（首次 getInstance 需传入依赖）')
      WorkflowTriggerScheduler.instance = new WorkflowTriggerScheduler(deps)
    }
    return WorkflowTriggerScheduler.instance
  }

  static resetInstance(): void {
    WorkflowTriggerScheduler.instance = null
  }

  /** 双端 boot 启动（幂等） */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.tickHandle = this.timer.setInterval(() => void this.tick(), this.tickMs)
    await this.refreshEventIndex()
    this.unsubscribeEvents = subscribeDomainEvents(event => void this.handleDomainEvent(event))
    console.log(`[WorkflowTriggerScheduler] 已启动（tick=${this.tickMs}ms）`)
  }

  stop(): void {
    if (this.tickHandle !== null) this.timer.clearInterval(this.tickHandle)
    this.tickHandle = null
    this.unsubscribeEvents?.()
    this.unsubscribeEvents = null
    this.started = false
  }

  /** cron tick：扫描到期 → 按 userId 分组 → 触发或推进 */
  async tick(now = new Date()): Promise<void> {
    let due: Awaited<ReturnType<WorkflowDefinitionRepository['scanDueCronTriggers']>>
    try {
      due = await this.deps.definitions.scanDueCronTriggers(now)
    } catch (e) {
      console.error('[WorkflowTriggerScheduler] 扫描到期触发器失败', e)
      return
    }
    const graceMs = this.tickMs * WORKFLOW_DEFAULTS.cronGraceFactor
    for (const row of due) {
      const cronTriggers = row.triggers.filter(
        (t): t is Extract<WorkflowTrigger, { type: 'cron' }> => t.type === 'cron' && t.enabled
      )
      if (cronTriggers.length === 0) continue
      // 多个 cron 触发器：逐个判定；任一在 grace 内即触发
      await runWithUserAsync(row.userId ?? '', async () => {
        let fired = false
        for (const t of cronTriggers) {
          const next = this.computeNext(t.expression, row.lastFireAt ?? row.nextFireAt)
          if (next === null) continue
          const overdueMs = now.getTime() - row.nextFireAt.getTime()
          if (overdueMs <= graceMs) {
            // grace 内：正常触发（互斥跳过由 runService 记 skipped）
            try {
              await this.deps.runService.startRun({
                definitionId: row.id,
                triggerType: 'cron',
                triggerInfo: { expression: t.expression },
              })
              fired = true
            } catch (e) {
              console.error(`[WorkflowTriggerScheduler] 定时触发失败: ${row.id}`, e)
            }
          } else {
            console.warn(
              `[WorkflowTriggerScheduler] 错过触发点（${Math.round(overdueMs / 1000)}s 前），跳过不补跑: ${row.id}`
            )
          }
        }
        // 推进 next_fire_at 到未来首个触发点（只在有动作时写库）
        const nextFire = this.computeNext(
          cronTriggers[0].expression,
          // 从当前时间起算（错过的不补）
          now
        )
        await this.deps.definitions.update(row.id, {
          nextFireAt: nextFire,
          lastFireAt: fired ? now : row.lastFireAt,
        })
      })
    }
  }

  /** 发布/启停触发器后立即刷新该定义的调度状态 */
  async recomputeOne(definitionId: string): Promise<void> {
    const def = await this.deps.definitions.getById(definitionId)
    if (!def) return
    const cron = def.triggers.find(
      (t): t is Extract<WorkflowTrigger, { type: 'cron' }> => t.type === 'cron' && t.enabled
    )
    if (cron && def.publishedVersion > 0) {
      const next = this.computeNext(cron.expression, new Date())
      await this.deps.definitions.update(definitionId, { nextFireAt: next })
    } else {
      // 无启用的 cron：清调度状态
      await this.deps.definitions.update(definitionId, { nextFireAt: null, lastFireAt: null })
    }
    await this.refreshEventIndex()
  }

  /** 重建事件触发器内存索引 */
  async refreshEventIndex(): Promise<void> {
    try {
      const rows = await this.deps.definitions.scanEventTriggers()
      const index = new Map<typeof this.eventIndex extends Map<infer K, infer V> ? K : never, Array<{
        definitionId: string
        userId: string | null
        match?: Record<string, string | number | boolean>
      }>>()
      for (const row of rows) {
        for (const t of row.triggers) {
          if (t.type !== 'event' || !t.enabled) continue
          const list = index.get(t.eventName) ?? []
          list.push({ definitionId: row.id, userId: row.userId, match: t.match })
          index.set(t.eventName, list)
        }
      }
      this.eventIndex = index
    } catch (e) {
      console.error('[WorkflowTriggerScheduler] 重建事件索引失败', e)
    }
  }

  /** 领域事件 → 匹配触发器 → 同租户启动 */
  private async handleDomainEvent(event: DomainEvent): Promise<void> {
    const triggers = this.eventIndex.get(event.name)
    if (!triggers || triggers.length === 0) return
    for (const t of triggers) {
      // 同租户匹配：事件发布者的 userId 必须与定义归属一致（null 事件只匹配 null 用户——
      // Electron 单用户进程默认值场景实际会带 LOCAL_DEFAULT_USER_ID，不会是 null）
      if (t.userId !== event.userId) continue
      // 可选 payload 等值过滤（AND）
      if (t.match && !matchPayload(t.match, event.payload)) continue
      try {
        await runWithUserAsync(t.userId ?? '', () =>
          this.deps.runService.startRun({
            definitionId: t.definitionId,
            triggerType: 'event',
            triggerInfo: { eventName: event.name, payload: event.payload },
          })
        )
      } catch (e) {
        console.error(`[WorkflowTriggerScheduler] 事件触发失败: ${t.definitionId}`, e)
      }
    }
  }

  /** 计算 fromDate 之后的首个触发点（表达式无效返回 null 并记日志） */
  private computeNext(expression: string, fromDate: Date): Date | null {
    try {
      return CronExpressionParser.parse(expression, { currentDate: fromDate }).next().toDate()
    } catch (e) {
      console.error(`[WorkflowTriggerScheduler] cron 表达式无效: ${expression}`, e)
      return null
    }
  }
}

/** payload 等值匹配（AND；宽松相等容忍数字字符串） */
function matchPayload(
  match: Record<string, string | number | boolean>,
  payload: Record<string, unknown>
): boolean {
  for (const [key, expected] of Object.entries(match)) {
    const actual = payload[key]
    const eq =
      actual === expected ||
      (typeof expected === 'number' && Number(actual) === expected) ||
      String(actual) === String(expected)
    if (!eq) return false
  }
  return true
}
