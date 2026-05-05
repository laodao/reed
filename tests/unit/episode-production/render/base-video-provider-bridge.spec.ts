/**
 * BaseVideoProvider → VideoProviderAdapter 桥接单测（P5-T12）
 *
 * 用 mock BaseVideoProvider 验证翻译 + 轮询逻辑：
 * - 同步路径（generateVideo 直接返回 video）
 * - 异步路径（返回 taskId，轮询直至 completed）
 * - failed 状态抛错
 * - capabilities 推断（features.textToVideo / imageToVideo）
 * - text/image/keyframes 三模式 dispatch 正确
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { adaptBaseVideoProvider } from '@core/modules/episode-production/render/video/base-video-provider-bridge'
import type {
  BaseVideoProvider,
  VideoModel,
  VideoTaskStatus,
} from '@core/video-providers'

function makeMockProvider(opts: {
  features?: Partial<VideoModel['features']>
  generateResponse?: any
  taskStatuses?: VideoTaskStatus[] // 顺序返回的状态列表
}): BaseVideoProvider {
  let pollIdx = 0
  const statuses = opts.taskStatuses ?? [
    { taskId: 't1', status: 'completed', video: { localPath: '/tmp/v.mp4' } },
  ]
  return {
    id: 'mock',
    name: 'Mock',
    getModels: vi.fn(async () => [
      {
        id: 'mock-model',
        name: 'Mock',
        providerId: 'mock',
        providerName: 'Mock',
        features: {
          textToVideo: true,
          imageToVideo: true,
          videoToVideo: false,
          maxDuration: 8,
          supportedResolutions: ['1080p'],
          supportedAspectRatios: ['16:9'],
          ...opts.features,
        },
      } as VideoModel,
    ]),
    generateVideo: vi.fn(async () => {
      return (
        opts.generateResponse ?? {
          success: true,
          taskId: 't1',
        }
      )
    }),
    getTaskStatus: vi.fn(async () => {
      const status = statuses[Math.min(pollIdx, statuses.length - 1)]
      pollIdx++
      return status
    }),
    testConnection: vi.fn(async () => ({ success: true, message: 'ok' })),
  } as any as BaseVideoProvider
}

describe('adaptBaseVideoProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('capabilities 推断：features.textToVideo + imageToVideo → adapter 暴露对应方法', async () => {
    const base = makeMockProvider({})
    const adapter = await adaptBaseVideoProvider(base, { modelId: 'mock-model' })
    expect(adapter.capabilities.text).toBe(true)
    expect(adapter.capabilities.image).toBe(true)
    expect(adapter.capabilities.keyframes).toBe(false) // BaseVideoProvider 不暴露
    expect(adapter.capabilities.maxDurationSec).toBe(8)
    expect(adapter.textToVideo).toBeDefined()
    expect(adapter.imageToVideo).toBeDefined()
    expect(adapter.keyframesToVideo).toBeUndefined()
  })

  it('capabilitiesOverride：keyframes=true 时 adapter 暴露 keyframesToVideo', async () => {
    const base = makeMockProvider({})
    const adapter = await adaptBaseVideoProvider(base, {
      modelId: 'mock-model',
      capabilitiesOverride: {
        text: true,
        image: true,
        keyframes: true,
        maxKeyframes: 2,
        maxDurationSec: 5,
      },
    })
    expect(adapter.capabilities.keyframes).toBe(true)
    expect(adapter.keyframesToVideo).toBeDefined()
  })

  it('同步路径：generateVideo 直接返回 video → adapter 直接给结果', async () => {
    const base = makeMockProvider({
      generateResponse: {
        success: true,
        video: { localPath: '/tmp/sync.mp4', duration: 5, width: 1920, height: 1080 },
      },
    })
    const adapter = await adaptBaseVideoProvider(base, { modelId: 'mock-model' })
    const result = await adapter.textToVideo!({
      prompt: 'a cat',
      durationSec: 5,
    })
    expect(result.videoPath).toBe('/tmp/sync.mp4')
    expect(result.durationSec).toBe(5)
    expect(base.getTaskStatus).not.toHaveBeenCalled()
  })

  it('异步路径：taskId → polling → completed', async () => {
    const base = makeMockProvider({
      generateResponse: { success: true, taskId: 't1' },
      taskStatuses: [
        { taskId: 't1', status: 'pending', progress: 0 },
        { taskId: 't1', status: 'processing', progress: 50 },
        {
          taskId: 't1',
          status: 'completed',
          video: { localPath: '/tmp/async.mp4', duration: 6 },
        },
      ],
    })
    const adapter = await adaptBaseVideoProvider(base, { modelId: 'mock-model' })

    const promise = adapter.textToVideo!({ prompt: 'a dog', durationSec: 6 })
    // 推进 fake timers 让 polling 跑完
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(2_000)
    const result = await promise

    expect(result.videoPath).toBe('/tmp/async.mp4')
    expect(result.durationSec).toBe(6)
    expect(base.getTaskStatus).toHaveBeenCalled()
  })

  it('failed 状态：抛错', async () => {
    const base = makeMockProvider({
      generateResponse: { success: true, taskId: 't1' },
      taskStatuses: [
        { taskId: 't1', status: 'failed', error: 'API quota exceeded' },
      ],
    })
    const adapter = await adaptBaseVideoProvider(base, { modelId: 'mock-model' })

    // failed 在第一次 poll 就抛，无需 timer 推进
    await expect(
      adapter.textToVideo!({ prompt: 'x', durationSec: 5 }),
    ).rejects.toThrow(/API quota exceeded/)
  })

  it('imageToVideo 把 imagePath 传给 generateVideo.image', async () => {
    const base = makeMockProvider({
      generateResponse: {
        success: true,
        video: { localPath: '/tmp/i2v.mp4', duration: 4 },
      },
    })
    const adapter = await adaptBaseVideoProvider(base, { modelId: 'mock-model' })
    await adapter.imageToVideo!({
      imagePath: '/tmp/in.png',
      prompt: 'animate',
      durationSec: 4,
    })
    expect(base.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        image: '/tmp/in.png',
        prompt: 'animate',
        duration: 4,
      }),
    )
  })

  it('keyframesToVideo（策略 A）：用首帧走 image2video', async () => {
    const base = makeMockProvider({
      generateResponse: {
        success: true,
        video: { localPath: '/tmp/kf.mp4', duration: 5 },
      },
    })
    const adapter = await adaptBaseVideoProvider(base, {
      modelId: 'mock-model',
      capabilitiesOverride: {
        text: true,
        image: true,
        keyframes: true,
        maxKeyframes: 2,
        maxDurationSec: 5,
      },
    })
    await adapter.keyframesToVideo!({
      keyframes: [
        { imagePath: '/tmp/k0.png', timePercent: 0 },
        { imagePath: '/tmp/k1.png', timePercent: 1 },
      ],
      prompt: 'fade',
      durationSec: 5,
    })
    // 桥接策略 A：用首帧
    expect(base.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({ image: '/tmp/k0.png' }),
    )
  })

  it('generateVideo success=false → 抛 provider error', async () => {
    const base = makeMockProvider({
      generateResponse: { success: false, error: 'auth failed' },
    })
    const adapter = await adaptBaseVideoProvider(base, { modelId: 'mock-model' })
    await expect(
      adapter.textToVideo!({ prompt: 'x', durationSec: 5 }),
    ).rejects.toThrow(/auth failed/)
  })
})
