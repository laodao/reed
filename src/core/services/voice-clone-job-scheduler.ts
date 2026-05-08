/**
 * 声音复刻轮询调度器
 * @module services/voice-clone-job-scheduler
 *
 * 职责：扫 cloned_voices 表里 status='training' 的记录，定期调 provider
 * 的 query_voice 刷新状态；状态变 ready / failed 时通过 EventEmitter
 * 广播事件，让渲染端 UI 实时刷新。
 *
 * 触发时机：
 *   1. boot 钩子：app 启动后 .start() — 捕获上次开机训练中的任务
 *   2. 创建后：VoiceCloneService.cloneVoice 成功后调 .scheduleOne(id) 立即起单条
 *   3. 用户手动刷新：UI 调 voice:clone-refresh-status IPC（不走 scheduler）
 *
 * 设计要点：
 *   - 单例：所有 task 共享一个调度器实例（避免多套定时器）
 *   - 间隔：默认 10 秒（DashScope DEPLOYING 多数 30-60s 完成）
 *   - 上限：单条任务最多轮询 10 分钟，超时降级标记 failed
 *   - boot 扫描：只 resume status='training' 的记录，已是终态的不动
 *   - 测试模式：可注入 fake timer + 短间隔，便于 vitest fake timers
 *
 * 事件广播 channel：
 *   - 'voice:clone-completed'  payload: { id, status: 'ready', voiceId }
 *   - 'voice:clone-failed'     payload: { id, status: 'failed', errorMessage }
 *
 * 设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §5.5 / §7.1
 */

import { VoiceCloneService } from './voice-clone.service'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'

export interface VoiceCloneJobSchedulerOptions {
  /** 轮询间隔（毫秒）。默认 10 秒 */
  intervalMs?: number
  /** 单条任务最大耗时（毫秒）。默认 10 分钟 */
  maxDurationMs?: number
  /** 单测注入 setInterval / clearInterval / Date.now，便于 fake timers */
  timer?: SchedulerTimerSource
}

/**
 * 调度器使用的 timer source 接口 — 单测可注入 vi.useFakeTimers 提供的实现。
 *
 * 注意：vi.useFakeTimers 默认替换 globalThis 的 setInterval / setTimeout / Date.now，
 * 所以正常情况下不需要注入；这个接口仅作为 belt-and-suspenders。
 */
export interface SchedulerTimerSource {
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
  now(): number
}

const defaultTimerSource: SchedulerTimerSource = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as any),
  now: () => Date.now(),
}

/** 单条任务追踪条目（per-task 起始时间） */
interface JobEntry {
  startedAtMs: number
}

/**
 * 复刻状态轮询调度器（单例）。
 *
 * 用法：
 * ```ts
 * // boot
 * VoiceCloneJobScheduler.getInstance().start()
 *
 * // 创建后
 * VoiceCloneJobScheduler.getInstance().scheduleOne(clonedVoiceId)
 *
 * // 测试 / shutdown
 * VoiceCloneJobScheduler.getInstance().stop()
 * ```
 */
export class VoiceCloneJobScheduler {
  private static singleton: VoiceCloneJobScheduler | null = null

  static getInstance(
    options?: VoiceCloneJobSchedulerOptions,
  ): VoiceCloneJobScheduler {
    if (!VoiceCloneJobScheduler.singleton) {
      VoiceCloneJobScheduler.singleton = new VoiceCloneJobScheduler(options)
    }
    return VoiceCloneJobScheduler.singleton
  }

  /** 测试用：重置单例（默认场景不应该用） */
  static resetSingletonForTest(): void {
    if (VoiceCloneJobScheduler.singleton) {
      VoiceCloneJobScheduler.singleton.stop()
    }
    VoiceCloneJobScheduler.singleton = null
  }

  private readonly intervalMs: number
  private readonly maxDurationMs: number
  private readonly timer: SchedulerTimerSource

  private intervalHandle: unknown = null
  private readonly jobs = new Map<string, JobEntry>()
  private started = false

  /**
   * 构造器是 public 的（便于直接 new 在测试里），但生产环境请用 getInstance。
   */
  constructor(options: VoiceCloneJobSchedulerOptions = {}) {
    this.intervalMs = options.intervalMs ?? 10_000
    this.maxDurationMs = options.maxDurationMs ?? 10 * 60_000
    this.timer = options.timer ?? defaultTimerSource
  }

  /**
   * 启动调度器。幂等 — 重复调 start() 不会起多个定时器。
   *
   * 1. 立即扫一次表，把所有 status='training' 的 row 加进 jobs map
   *    （捕获上次开机未完成的任务，"启动 resume"）
   * 2. 起 setInterval 周期触发 tick
   *
   * 注意：start() 内部会异步触发首次 boot 扫描；调用方不应 await（fire and forget）。
   */
  start(): void {
    if (this.started) return
    this.started = true

    // boot 扫描：异步扫表，不阻塞 boot 流程
    void this.bootScan()

    // 起周期性 tick
    this.intervalHandle = this.timer.setInterval(
      () => void this.tick(),
      this.intervalMs,
    )
  }

  /** 停止调度器（清定时器 + 清 jobs map）。幂等。 */
  stop(): void {
    if (this.intervalHandle != null) {
      this.timer.clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
    this.jobs.clear()
    this.started = false
  }

  /**
   * 立即把某条 cloned_voice id 加入轮询列表。
   * 通常 cloneVoice 创建成功后立刻调用 — 即使 scheduler 未 start，
   * 入列也有效，待 start() 后会被 tick() 处理。
   *
   * 不立即触发 tick — 调用方如果需要"立即查"应直接调 refreshClonedVoiceStatus。
   */
  scheduleOne(id: string): void {
    if (!id) return
    if (!this.jobs.has(id)) {
      this.jobs.set(id, { startedAtMs: this.timer.now() })
    }
  }

  /** 当前在轮询中的任务数（测试可见性） */
  get pendingCount(): number {
    return this.jobs.size
  }

  /**
   * 启动时扫一次表，把数据库里所有 status='training' 的 row id 灌进 jobs。
   * 失败仅 console — 不抛错（即使 DB 暂时未就绪，下次 tick 还会再尝试）。
   */
  private async bootScan(): Promise<void> {
    try {
      const dbm = getCoreDatabaseManager()
      if (!dbm.clonedVoices) return
      const rows = await dbm.clonedVoices.getByStatus('training')
      for (const r of rows) {
        if (!this.jobs.has(r.id)) {
          this.jobs.set(r.id, { startedAtMs: this.timer.now() })
        }
      }
      if (rows.length > 0) {
        console.log(
          `[VoiceCloneJobScheduler] boot 扫描：恢复 ${rows.length} 个训练中的复刻任务`,
        )
      }
    } catch (e: any) {
      console.warn(
        '[VoiceCloneJobScheduler.bootScan] DB 未就绪或扫描失败（将在 tick 重试）:',
        e?.message ?? e,
      )
    }
  }

  /**
   * 每个间隔触发：
   * - 没任务：直接返回
   * - 有任务：每条调 refreshClonedVoiceStatus
   *   - 终态（ready/failed）：发 event + 从 jobs 移除
   *   - 仍 training 但已超时：调 service 写 failed + 发 failed event + 移除
   *   - 仍 training 未超时：保留下次再查
   *
   * 单条失败不影响其他条 — 每条 try/catch 包裹。
   */
  private async tick(): Promise<void> {
    if (this.jobs.size === 0) return

    // 复制一份 id 列表，tick 中可能修改 jobs map
    const ids = Array.from(this.jobs.keys())

    for (const id of ids) {
      const entry = this.jobs.get(id)
      if (!entry) continue

      try {
        // 超时检查：超过 maxDuration 直接降级 failed
        const elapsed = this.timer.now() - entry.startedAtMs
        if (elapsed > this.maxDurationMs) {
          await this.markTimeoutFailed(id)
          this.jobs.delete(id)
          continue
        }

        // 调 service 刷新
        const r = await VoiceCloneService.refreshClonedVoiceStatus(id)
        if (!r.success || !r.data) {
          // refresh 内部错误 — 不删 job，下次再试
          continue
        }
        if (r.data.status === 'ready') {
          this.emitCompleted(r.data.id, r.data.voiceId)
          this.jobs.delete(id)
        } else if (r.data.status === 'failed') {
          this.emitFailed(r.data.id, r.data.errorMessage)
          this.jobs.delete(id)
        }
        // 仍 training：保留
      } catch (e: any) {
        console.warn(
          `[VoiceCloneJobScheduler.tick] id=${id} 刷新失败（保留下次重试）:`,
          e?.message ?? e,
        )
      }
    }
  }

  private async markTimeoutFailed(id: string): Promise<void> {
    try {
      const dbm = getCoreDatabaseManager()
      if (!dbm.clonedVoices) return
      await dbm.clonedVoices.update(id, {
        status: 'failed',
        errorMessage: '训练超时（超过 10 分钟未返回结果）',
      })
      this.emitFailed(id, '训练超时')
    } catch (e: any) {
      console.warn(
        `[VoiceCloneJobScheduler.markTimeoutFailed] id=${id} 落库失败:`,
        e?.message ?? e,
      )
    }
  }

  private emitCompleted(id: string, voiceId?: string | undefined): void {
    try {
      getEventEmitter().emit('voice:clone-completed', {
        id,
        status: 'ready',
        voiceId,
      })
    } catch (e: any) {
      console.warn(
        '[VoiceCloneJobScheduler] EventEmitter 未注册（Web 端无窗口绑定时正常）:',
        e?.message ?? e,
      )
    }
  }

  private emitFailed(id: string, errorMessage?: string): void {
    try {
      getEventEmitter().emit('voice:clone-failed', {
        id,
        status: 'failed',
        errorMessage: errorMessage ?? '复刻失败',
      })
    } catch (e: any) {
      console.warn(
        '[VoiceCloneJobScheduler] EventEmitter 未注册:',
        e?.message ?? e,
      )
    }
  }
}
