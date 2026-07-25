/**
 * 面容参数 → AI 提示词翻译
 * @module portrait/geometry/paramPrompt
 * @description 双通道之文字通道（spec §F4）：
 *              参数 → 解剖学视觉短语 + 幅度 → 程度词，组装进 editFace 指令框架。
 */
import { PARAM_PROMPT_MAP } from '../../../../../shared/types/portrait.types'
import type { WarpParams } from './bandWarp'
import type { FaceMetrics } from './faceMetrics'

/** 幅度 → 程度词（<3 very subtly / 3-8 slightly / >8 significantly） */
export function degreeOf(pct: number): string {
  const a = Math.abs(pct)
  if (a < 0.03) return 'very subtly'
  if (a <= 0.08) return 'slightly'
  return 'significantly'
}

/**
 * 单参数 → 短语（如 "slightly shorter mid-face, more compact proportions..."）。
 * 零值返回空串（调用方过滤）。
 */
export function paramToPhrase(key: string, value: number): string {
  const map = PARAM_PROMPT_MAP[key]
  if (!map || value === 0) return ''
  const phrase = value < 0 ? map.negative : map.positive
  return `${degreeOf(value)} ${phrase}`
}

/**
 * 目标比例提示（可选，强模型可理解）：
 * 如 "make the mid-face occupy about 31% of face height"。
 * 基于变形后指标与原始面高换算。
 */
export function targetRatioHint(warpedMetrics: FaceMetrics | null): string {
  if (!warpedMetrics) return ''
  return `make the mid-face occupy about ${Math.round(warpedMetrics.midThird.pct)}% of face height`
}

/**
 * 组装完整 editFace 指令（复用已验证的编辑指令框架）。
 * @param params 变形参数
 * @param warpedMetrics 变形后指标（用于数值目标提示，可空）
 */
export function buildFaceEditPrompt(params: WarpParams, warpedMetrics?: FaceMetrics | null): string {
  const phrases = Object.entries(params)
    .map(([key, value]) => paramToPhrase(key, value ?? 0))
    .filter(Boolean)

  if (phrases.length === 0) return ''

  const parts = [
    'edit this portrait photo, apply the following facial changes while keeping the exact same person and identity',
    ...phrases,
    targetRatioHint(warpedMetrics ?? null),
    'modify only the face, keep hair, clothing, body, pose and background exactly the same',
  ].filter(Boolean)

  return parts.join(', ')
}
