/**
 * 视频 provider 能力匹配 + 模式降级（spec §4.4 · P5-T10）
 * @module modules/episode-production/render/video/provider-capability-matcher
 *
 * 给定 keyframeCount + provider capabilities，挑出最合适的 video mode；
 * 不支持时按"功能更弱"方向降级。
 *
 * 调度策略（spec §4.4）：
 *   keyframeCount == 0  → text2video
 *   keyframeCount == 1  → image2video
 *   keyframeCount == 2  → keyframes2video（首尾）或退化为 image2video（仅用首帧）
 *   keyframeCount >= 3  → keyframes2video（多帧）
 *
 * 降级链：keyframes2video → image2video → text2video → null（无法生成）
 *
 * 纯函数模块（无 IO 无 DI），便于单测覆盖。
 */

import type {
  VideoMode,
  VideoProviderCapabilities,
  KeyframeInput,
} from './video-provider-adapter'

/** 匹配结果 */
export interface VideoModeMatch {
  /** 选中的模式；null 表示该 provider 无法生成 */
  mode: VideoMode | null
  /** 是否走了降级（即非"理想模式"） */
  degraded: boolean
  /**
   * 降级路径上的所有备选（idealMode → ... → mode），
   * 用于 UI 提示"原本应走 keyframes2video，因 provider 不支持降为 image2video"。
   */
  trace: VideoMode[]
  /** 实际可用的关键帧数（针对 keyframes2video 模式，若 provider 上限 < keyframeCount，
   *  会截断到上限；其它模式忽略此字段） */
  effectiveKeyframeCount?: number
}

/**
 * 按 keyframeCount + capabilities 选模式。
 *
 * @param keyframeCount 当前分镜配置的关键帧数（0~9）
 * @param capabilities provider 声明的能力矩阵
 */
export function pickVideoMode(
  keyframeCount: number,
  capabilities: VideoProviderCapabilities,
): VideoModeMatch {
  const n = Math.max(0, Math.min(9, Math.floor(keyframeCount)))

  // 理想模式
  let idealMode: VideoMode
  if (n === 0) idealMode = 'text2video'
  else if (n === 1) idealMode = 'image2video'
  else idealMode = 'keyframes2video' // n >= 2

  // 按 ideal → 降级链尝试
  const chain: VideoMode[] = buildDegradeChain(idealMode)

  for (let i = 0; i < chain.length; i++) {
    const mode = chain[i]
    const ok = isModeSupported(mode, n, capabilities)
    if (ok) {
      const result: VideoModeMatch = {
        mode,
        degraded: i > 0,
        trace: chain.slice(0, i + 1),
      }
      if (mode === 'keyframes2video') {
        result.effectiveKeyframeCount = Math.min(n, capabilities.maxKeyframes)
      }
      return result
    }
  }
  return { mode: null, degraded: true, trace: chain }
}

/** 构造降级链：keyframes2video → image2video → text2video */
function buildDegradeChain(start: VideoMode): VideoMode[] {
  const chain: VideoMode[] = []
  let mode: VideoMode | null = start
  while (mode) {
    chain.push(mode)
    mode = nextDegradeMode(mode)
  }
  return chain
}

function nextDegradeMode(mode: VideoMode): VideoMode | null {
  if (mode === 'keyframes2video') return 'image2video'
  if (mode === 'image2video') return 'text2video'
  return null
}

/** 该模式在该 provider 上是否可行 */
export function isModeSupported(
  mode: VideoMode,
  keyframeCount: number,
  capabilities: VideoProviderCapabilities,
): boolean {
  if (mode === 'text2video') return capabilities.text === true
  if (mode === 'image2video') {
    // image2video 至少需要一帧；keyframeCount=0 时降级也无法走 image，会触发再降到 text
    return capabilities.image === true && keyframeCount >= 1
  }
  // keyframes2video
  return (
    capabilities.keyframes === true &&
    keyframeCount >= 2 &&
    capabilities.maxKeyframes >= 2
  )
}

/**
 * 对 keyframes2video 入参做"按 capability 截断"。
 * 当 capabilities.maxKeyframes < keyframes.length 时，按时间顺序均匀采样到上限。
 */
export function clampKeyframesToCapability(
  keyframes: KeyframeInput[],
  capabilities: VideoProviderCapabilities,
): KeyframeInput[] {
  if (!capabilities.keyframes) return []
  const max = capabilities.maxKeyframes
  if (keyframes.length <= max) return keyframes.slice()

  // 均匀采样：保留首尾 + 中间均匀挑（按 timePercent 排序）
  const sorted = keyframes.slice().sort((a, b) => a.timePercent - b.timePercent)
  if (max <= 1) return [sorted[0]]
  if (max === 2) return [sorted[0], sorted[sorted.length - 1]]

  const result: KeyframeInput[] = []
  result.push(sorted[0]) // 首
  // 中间 max-2 个：均匀采样
  const innerCount = max - 2
  const step = (sorted.length - 1) / (innerCount + 1)
  for (let i = 1; i <= innerCount; i++) {
    const idx = Math.round(i * step)
    if (idx > 0 && idx < sorted.length - 1) {
      result.push(sorted[idx])
    }
  }
  result.push(sorted[sorted.length - 1]) // 尾
  return result
}
