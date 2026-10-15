/**
 * adapter-factory capabilities merge 语义单测（2026-09-25 一致性修复 Task 2 · 评审第 1 轮）
 *
 * customParams.videoCapabilities 从整对象替换改为 merge：
 * 用户只覆盖部分字段（如 maxDurationSec）时，推导出的 subjectReference/keyframes
 * 必须保留——否则既有 ComfyUI 用户的 assetRef 缺省路径会被 V1 守卫误拦截。
 */

import { describe, expect, it, vi } from 'vitest'
import type { VideoProviderCapabilities } from '@core/platform/episode-production/render/video/video-provider-adapter'

let mockCfg: any
vi.mock('@core/platform/episode-production/narrative/ai/_helpers', () => ({
  getProviderConfig: async () => ({ config: mockCfg, apiKey: 'k' }),
}))
vi.mock('@core/platform/providers/video', () => ({
  isProviderImplemented: () => true,
  createVideoProvider: () => ({}),
  // adapter-factory 现经 resolveVideoProviderType 推导 provider 类型（ai-hub → aihub 等）
  resolveVideoProviderType: (templateId: string) =>
    templateId === 'ai-hub' ? 'aihub' : templateId.replace('video-', ''),
}))
vi.mock(
  '@core/platform/episode-production/render/video/base-video-provider-bridge',
  () => ({
    adaptBaseVideoProvider: async (_base: unknown, opts: { capabilitiesOverride: VideoProviderCapabilities }) => ({
      capabilities: opts.capabilitiesOverride,
    }),
  }),
)

import { createAdapterForProviderWithReason } from '@core/platform/episode-production/render/video/adapter-factory'

function cfgOf(templateId: string, videoCapabilities?: Partial<VideoProviderCapabilities>) {
  return {
    templateId,
    models: [{ id: 'h3', type: 'video', features: { imageToVideo: true, maxDuration: 15 } }],
    customParams: videoCapabilities ? { videoCapabilities } : undefined,
  }
}

describe('createAdapterForProviderWithReason · capabilities merge', () => {
  it('comfyui + 用户只覆盖 maxDurationSec：subjectReference/keyframes 推导值保留', async () => {
    mockCfg = cfgOf('comfyui', { maxDurationSec: 30 })
    const { adapter, reason } = await createAdapterForProviderWithReason('cfg1', 'h3')
    expect(reason).toBe('ok')
    expect(adapter?.capabilities.subjectReference).toBe(true)
    expect(adapter?.capabilities.keyframes).toBe(true)
    expect(adapter?.capabilities.maxKeyframes).toBe(2)
    expect(adapter?.capabilities.maxDurationSec).toBe(30)
  })

  it('comfyui 无用户覆盖：subjectReference=true', async () => {
    mockCfg = cfgOf('comfyui')
    const { adapter } = await createAdapterForProviderWithReason('cfg1', 'h3')
    expect(adapter?.capabilities.subjectReference).toBe(true)
  })

  it('非 comfyui + 用户部分覆盖：subjectReference 保持 falsy（首帧语义不误放）', async () => {
    mockCfg = cfgOf('volcengine', { maxDurationSec: 10 })
    const { adapter } = await createAdapterForProviderWithReason('cfg1', 'h3')
    expect(adapter?.capabilities.maxDurationSec).toBe(10)
    expect(adapter?.capabilities.subjectReference).toBeFalsy()
  })

  it('用户显式 subjectReference 覆盖优先（显式声明自担语义风险）', async () => {
    mockCfg = cfgOf('volcengine', { subjectReference: true })
    const { adapter } = await createAdapterForProviderWithReason('cfg1', 'h3')
    expect(adapter?.capabilities.subjectReference).toBe(true)
  })
})
