/**
 * provider-capability-matcher 单测（P5-T10）
 *
 * 覆盖 spec §4.4 全部决策分支：
 * - 理想模式（按 keyframeCount=0/1/2/N 选）
 * - provider 不支持时降级链
 * - 全不支持 → null
 * - clampKeyframesToCapability：上限截断（首尾 + 中间均匀）
 */

import { describe, it, expect } from 'vitest'
import {
  pickVideoMode,
  isModeSupported,
  clampKeyframesToCapability,
} from '@core/platform/episode-production/render/video/provider-capability-matcher'
import type {
  VideoProviderCapabilities,
  KeyframeInput,
} from '@core/platform/episode-production/render/video/video-provider-adapter'

const FULL_CAP: VideoProviderCapabilities = {
  text: true,
  image: true,
  keyframes: true,
  maxKeyframes: 9,
  maxDurationSec: 10,
}

const TEXT_ONLY: VideoProviderCapabilities = {
  text: true,
  image: false,
  keyframes: false,
  maxKeyframes: 0,
  maxDurationSec: 5,
}

const IMAGE_ONLY: VideoProviderCapabilities = {
  text: false,
  image: true,
  keyframes: false,
  maxKeyframes: 0,
  maxDurationSec: 8,
}

describe('pickVideoMode', () => {
  it('keyframeCount=0 + 全能 provider → text2video（无降级）', () => {
    const r = pickVideoMode(0, FULL_CAP)
    expect(r.mode).toBe('text2video')
    expect(r.degraded).toBe(false)
    expect(r.trace).toEqual(['text2video'])
  })

  it('keyframeCount=1 + 全能 → image2video', () => {
    const r = pickVideoMode(1, FULL_CAP)
    expect(r.mode).toBe('image2video')
    expect(r.degraded).toBe(false)
  })

  it('keyframeCount=2 + 全能 → keyframes2video（用首尾）', () => {
    const r = pickVideoMode(2, FULL_CAP)
    expect(r.mode).toBe('keyframes2video')
    expect(r.effectiveKeyframeCount).toBe(2)
    expect(r.degraded).toBe(false)
  })

  it('keyframeCount=5 + 全能 → keyframes2video（5 帧）', () => {
    const r = pickVideoMode(5, FULL_CAP)
    expect(r.mode).toBe('keyframes2video')
    expect(r.effectiveKeyframeCount).toBe(5)
  })

  it('keyframeCount=5 + provider maxKeyframes=3 → keyframes2video 截到 3 帧', () => {
    const cap: VideoProviderCapabilities = {
      ...FULL_CAP,
      maxKeyframes: 3,
    }
    const r = pickVideoMode(5, cap)
    expect(r.mode).toBe('keyframes2video')
    expect(r.effectiveKeyframeCount).toBe(3)
    expect(r.degraded).toBe(false) // 还在 keyframes 模式，只是帧数截断
  })

  it('keyframeCount=3 + provider 不支持 keyframes → 降级 image2video', () => {
    const r = pickVideoMode(3, IMAGE_ONLY)
    expect(r.mode).toBe('image2video')
    expect(r.degraded).toBe(true)
    expect(r.trace).toEqual(['keyframes2video', 'image2video'])
  })

  it('keyframeCount=3 + provider 仅 text → 降级 text2video', () => {
    const r = pickVideoMode(3, TEXT_ONLY)
    expect(r.mode).toBe('text2video')
    expect(r.degraded).toBe(true)
    expect(r.trace).toEqual(['keyframes2video', 'image2video', 'text2video'])
  })

  it('keyframeCount=1 + provider 仅 keyframes → 降级 text2video（image不支持，再降）', () => {
    const cap: VideoProviderCapabilities = {
      text: true,
      image: false,
      keyframes: true,
      maxKeyframes: 9,
      maxDurationSec: 10,
    }
    const r = pickVideoMode(1, cap)
    // ideal=image2video，image=false → 降到 text2video
    expect(r.mode).toBe('text2video')
    expect(r.degraded).toBe(true)
    expect(r.trace).toEqual(['image2video', 'text2video'])
  })

  it('全不支持的 provider → null', () => {
    const r = pickVideoMode(2, {
      text: false,
      image: false,
      keyframes: false,
      maxKeyframes: 0,
      maxDurationSec: 0,
    })
    expect(r.mode).toBeNull()
  })
})

describe('isModeSupported', () => {
  it('keyframes2video：keyframeCount<2 不支持', () => {
    expect(isModeSupported('keyframes2video', 1, FULL_CAP)).toBe(false)
    expect(isModeSupported('keyframes2video', 2, FULL_CAP)).toBe(true)
  })

  it('image2video：keyframeCount=0 不支持', () => {
    expect(isModeSupported('image2video', 0, FULL_CAP)).toBe(false)
    expect(isModeSupported('image2video', 1, FULL_CAP)).toBe(true)
  })

  it('text2video：与 keyframeCount 无关', () => {
    expect(isModeSupported('text2video', 0, FULL_CAP)).toBe(true)
    expect(isModeSupported('text2video', 5, FULL_CAP)).toBe(true)
    expect(isModeSupported('text2video', 0, IMAGE_ONLY)).toBe(false)
  })
})

describe('clampKeyframesToCapability', () => {
  function makeKfs(n: number): KeyframeInput[] {
    return Array.from({ length: n }, (_, i) => ({
      imagePath: `/tmp/${i}.png`,
      timePercent: i / Math.max(1, n - 1),
    }))
  }

  it('keyframes 数 <= maxKeyframes：原样返回', () => {
    const kfs = makeKfs(3)
    const out = clampKeyframesToCapability(kfs, FULL_CAP)
    expect(out).toHaveLength(3)
  })

  it('截断到 maxKeyframes=2：首 + 尾', () => {
    const kfs = makeKfs(5)
    const out = clampKeyframesToCapability(kfs, { ...FULL_CAP, maxKeyframes: 2 })
    expect(out).toHaveLength(2)
    expect(out[0].timePercent).toBe(0)
    expect(out[1].timePercent).toBe(1)
  })

  it('截断到 maxKeyframes=3：首 + 中间 + 尾', () => {
    const kfs = makeKfs(7)
    const out = clampKeyframesToCapability(kfs, { ...FULL_CAP, maxKeyframes: 3 })
    expect(out).toHaveLength(3)
    expect(out[0].timePercent).toBe(0)
    expect(out[2].timePercent).toBe(1)
    // 中间应在 0.5 附近
    expect(out[1].timePercent).toBeCloseTo(0.5, 1)
  })

  it('capabilities.keyframes=false → 空数组', () => {
    const kfs = makeKfs(3)
    const out = clampKeyframesToCapability(kfs, IMAGE_ONLY)
    expect(out).toEqual([])
  })

  it('截断到 maxKeyframes=1：仅首', () => {
    const kfs = makeKfs(5)
    const out = clampKeyframesToCapability(kfs, { ...FULL_CAP, maxKeyframes: 1 })
    expect(out).toHaveLength(1)
    expect(out[0].timePercent).toBe(0)
  })
})
