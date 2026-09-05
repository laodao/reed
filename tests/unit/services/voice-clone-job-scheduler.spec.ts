/**
 * VoiceCloneJobScheduler 单元测试
 * @see src/core/platform/services/voice-clone-job-scheduler.ts
 *
 * 用 vi.useFakeTimers 测周期触发 + boot resume + 超时降级。
 * mock VoiceCloneService.refreshClonedVoiceStatus 来模拟状态推进。
 * mock dbModule + eventModule 避免真碰数据库。
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  VoiceCloneJobScheduler,
  type SchedulerTimerSource,
} from '@core/platform/services/voice-clone-job-scheduler'
import { VoiceCloneService } from '@core/platform/services/voice-clone.service'
import * as dbModule from '@core/database/database-manager.interface'
import * as eventModule from '@core/interfaces/event.interface'

/** 构造一个最小化的 db manager mock，clonedVoices.getByStatus 可被替换 */
function mockDbManager(getByStatusImpl: () => Promise<any[]>) {
  const update = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
    clonedVoices: {
      getByStatus: getByStatusImpl,
      update,
    },
  } as any)
  return { update }
}

function mockEventEmitter() {
  const emit = vi.fn()
  vi.spyOn(eventModule, 'getEventEmitter').mockReturnValue({
    emit,
    emitProgress: vi.fn(),
    emitStatus: vi.fn(),
  } as any)
  return { emit }
}

describe('VoiceCloneJobScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    VoiceCloneJobScheduler.resetSingletonForTest()
  })

  afterEach(() => {
    VoiceCloneJobScheduler.resetSingletonForTest()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // ===== start / stop =====

  it('start() 幂等：重复调用不起多个定时器', () => {
    mockDbManager(async () => [])
    mockEventEmitter()
    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.start()
    scheduler.start()
    scheduler.start()
    // 没法直接 inspect setInterval count，但 stop 后 pendingCount 必为 0 + 不抛错
    scheduler.stop()
    expect(scheduler.pendingCount).toBe(0)
  })

  it('boot 扫描：拉所有 training row 入队', async () => {
    mockDbManager(async () => [
      { id: 'v1' },
      { id: 'v2' },
      { id: 'v3' },
    ])
    mockEventEmitter()

    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.start()
    // bootScan 是 async fire-and-forget，等 microtask 队列清空
    await vi.advanceTimersByTimeAsync(0)
    expect(scheduler.pendingCount).toBe(3)
    scheduler.stop()
  })

  it('boot 扫描失败时不抛 — 落到 console.warn，下次 tick 再尝试', async () => {
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      clonedVoices: null,
    } as any)
    mockEventEmitter()
    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(scheduler.pendingCount).toBe(0)
    scheduler.stop()
  })

  // ===== scheduleOne =====

  it('scheduleOne 入队（未启动也有效）', () => {
    mockDbManager(async () => [])
    mockEventEmitter()
    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('v1')
    scheduler.scheduleOne('v2')
    expect(scheduler.pendingCount).toBe(2)
  })

  it('scheduleOne 同 id 重复入队不增加', () => {
    mockDbManager(async () => [])
    mockEventEmitter()
    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('v1')
    scheduler.scheduleOne('v1')
    scheduler.scheduleOne('v1')
    expect(scheduler.pendingCount).toBe(1)
  })

  it('空 id 被忽略', () => {
    mockDbManager(async () => [])
    mockEventEmitter()
    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('')
    expect(scheduler.pendingCount).toBe(0)
  })

  // ===== tick / 状态推进 =====

  it('tick 推进 training → ready：发 voice:clone-completed + 出队', async () => {
    mockDbManager(async () => [])
    const { emit } = mockEventEmitter()
    const refreshSpy = vi
      .spyOn(VoiceCloneService, 'refreshClonedVoiceStatus')
      .mockResolvedValue({
        success: true,
        data: {
          id: 'v1',
          status: 'ready',
          voiceId: 'cosyvoice-x',
          name: 'x',
          createdAt: new Date(),
        } as any,
      })

    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('v1')
    scheduler.start()

    // 等 boot 扫描完成 + 推进 1 个 interval
    await vi.advanceTimersByTimeAsync(1000)

    expect(refreshSpy).toHaveBeenCalledWith('v1')
    expect(emit).toHaveBeenCalledWith('voice:clone-completed', {
      id: 'v1',
      status: 'ready',
      voiceId: 'cosyvoice-x',
    })
    expect(scheduler.pendingCount).toBe(0)
    scheduler.stop()
  })

  it('tick 推进 training → failed：发 voice:clone-failed + 出队', async () => {
    mockDbManager(async () => [])
    const { emit } = mockEventEmitter()
    vi.spyOn(VoiceCloneService, 'refreshClonedVoiceStatus').mockResolvedValue({
      success: true,
      data: {
        id: 'v1',
        status: 'failed',
        errorMessage: '音频质量过低',
        name: 'x',
        createdAt: new Date(),
      } as any,
    })

    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('v1')
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1000)

    expect(emit).toHaveBeenCalledWith('voice:clone-failed', {
      id: 'v1',
      status: 'failed',
      errorMessage: '音频质量过低',
    })
    expect(scheduler.pendingCount).toBe(0)
    scheduler.stop()
  })

  it('tick 仍 training：保留任务下次再查', async () => {
    mockDbManager(async () => [])
    mockEventEmitter()
    vi.spyOn(VoiceCloneService, 'refreshClonedVoiceStatus').mockResolvedValue({
      success: true,
      data: {
        id: 'v1',
        status: 'training',
        name: 'x',
        createdAt: new Date(),
      } as any,
    })

    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('v1')
    scheduler.start()
    await vi.advanceTimersByTimeAsync(3500) // 3 次 tick
    expect(scheduler.pendingCount).toBe(1)
    scheduler.stop()
  })

  it('tick 单条失败不阻塞其他条', async () => {
    mockDbManager(async () => [])
    mockEventEmitter()
    const refreshSpy = vi
      .spyOn(VoiceCloneService, 'refreshClonedVoiceStatus')
      .mockImplementation(async (id: string) => {
        if (id === 'v1') throw new Error('connection lost')
        return {
          success: true,
          data: {
            id,
            status: 'ready',
            voiceId: `vid-${id}`,
            name: 'x',
            createdAt: new Date(),
          } as any,
        }
      })

    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('v1')
    scheduler.scheduleOne('v2')
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1000)

    // v1 抛了 — 保留；v2 成功 — 出队
    expect(refreshSpy).toHaveBeenCalledTimes(2)
    expect(scheduler.pendingCount).toBe(1)
    scheduler.stop()
  })

  it('refreshClonedVoiceStatus 返回 success=false 时保留任务', async () => {
    mockDbManager(async () => [])
    mockEventEmitter()
    vi.spyOn(VoiceCloneService, 'refreshClonedVoiceStatus').mockResolvedValue({
      success: false,
      error: 'temp error',
    })

    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('v1')
    scheduler.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(scheduler.pendingCount).toBe(1)
    scheduler.stop()
  })

  // ===== 超时降级 =====

  it('超过 maxDurationMs 自动降级 failed', async () => {
    const { update } = mockDbManager(async () => [])
    const { emit } = mockEventEmitter()
    vi.spyOn(VoiceCloneService, 'refreshClonedVoiceStatus').mockResolvedValue({
      success: true,
      data: {
        id: 'v1',
        status: 'training',
        name: 'x',
        createdAt: new Date(),
      } as any,
    })

    const scheduler = new VoiceCloneJobScheduler({
      intervalMs: 1000,
      maxDurationMs: 5_000, // 5s 超时（测试用极短）
    })
    scheduler.scheduleOne('v1')
    scheduler.start()
    // 推进到第 6 秒触发超时分支
    await vi.advanceTimersByTimeAsync(6_000)

    expect(update).toHaveBeenCalledWith('v1', {
      status: 'failed',
      errorMessage: expect.stringMatching(/训练超时/),
    })
    expect(emit).toHaveBeenCalledWith(
      'voice:clone-failed',
      expect.objectContaining({ id: 'v1', errorMessage: '训练超时' }),
    )
    expect(scheduler.pendingCount).toBe(0)
    scheduler.stop()
  })

  // ===== stop =====

  it('stop 清空 jobs + 不再 tick', async () => {
    mockDbManager(async () => [])
    mockEventEmitter()
    const refreshSpy = vi
      .spyOn(VoiceCloneService, 'refreshClonedVoiceStatus')
      .mockResolvedValue({
        success: true,
        data: {
          id: 'v1',
          status: 'training',
          name: 'x',
          createdAt: new Date(),
        } as any,
      })

    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('v1')
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(1)

    scheduler.stop()
    const callsBefore = refreshSpy.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(refreshSpy.mock.calls.length).toBe(callsBefore) // stop 后不再调
    expect(scheduler.pendingCount).toBe(0)
  })

  // ===== 单例 =====

  it('getInstance 返回同一实例', () => {
    const a = VoiceCloneJobScheduler.getInstance()
    const b = VoiceCloneJobScheduler.getInstance()
    expect(a).toBe(b)
  })

  it('resetSingletonForTest 之后 getInstance 是新实例', () => {
    const a = VoiceCloneJobScheduler.getInstance()
    VoiceCloneJobScheduler.resetSingletonForTest()
    const b = VoiceCloneJobScheduler.getInstance()
    expect(a).not.toBe(b)
  })

  // ===== EventEmitter 未注册时静默 =====

  it('EventEmitter 未注册时不抛错（Web 早期 boot 场景）', async () => {
    mockDbManager(async () => [])
    vi.spyOn(eventModule, 'getEventEmitter').mockImplementation(() => {
      throw new Error('未注册')
    })
    vi.spyOn(VoiceCloneService, 'refreshClonedVoiceStatus').mockResolvedValue({
      success: true,
      data: {
        id: 'v1',
        status: 'ready',
        voiceId: 'vid',
        name: 'x',
        createdAt: new Date(),
      } as any,
    })

    const scheduler = new VoiceCloneJobScheduler({ intervalMs: 1000 })
    scheduler.scheduleOne('v1')
    scheduler.start()
    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow()
    expect(scheduler.pendingCount).toBe(0)
    scheduler.stop()
  })

  // ===== timer 自定义注入 =====

  it('支持自定义 timer source（验证默认 timer 调用），now() 提供基准时间', async () => {
    mockDbManager(async () => [])
    mockEventEmitter()
    let nowMock = 1000
    const setIntervalSpy = vi.fn((_fn: () => void, _ms: number) => {
      return 'handle-1'
    })
    const clearIntervalSpy = vi.fn()
    const customTimer: SchedulerTimerSource = {
      setInterval: setIntervalSpy,
      clearInterval: clearIntervalSpy,
      now: () => nowMock,
    }
    const scheduler = new VoiceCloneJobScheduler({
      intervalMs: 1000,
      timer: customTimer,
    })
    scheduler.start()
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    scheduler.stop()
    expect(clearIntervalSpy).toHaveBeenCalledWith('handle-1')
  })
})
