/**
 * 面容指标计算（纯函数）
 * @module portrait/geometry/faceMetrics
 * @description 由 478 个关键点（像素坐标）计算三庭五眼与脸型比例。
 *              纯函数无副作用，可单测。spec 2026-07-25-face-geometry-studio §F2
 */
import {
  LM_GLABELLA,
  LM_FOREHEAD_TOP,
  LM_SUBNASALE,
  LM_CHIN_BOTTOM,
  LM_RIGHT_EYE_OUTER,
  LM_RIGHT_EYE_INNER,
  LM_LEFT_EYE_OUTER,
  LM_LEFT_EYE_INNER,
  LM_NOSE_ALAR_RIGHT,
  LM_NOSE_ALAR_LEFT,
  LM_ZYGOMA_RIGHT,
  LM_ZYGOMA_LEFT,
  LM_JAW_ANGLE_RIGHT,
  LM_JAW_ANGLE_LEFT,
  FOREHEAD_EXTRAPOLATION,
} from './landmarkIndices'

export interface Point {
  x: number
  y: number
}

export interface ThirdMetric {
  px: number
  pct: number           // 占面高百分比（0-100）
  estimated: boolean    // 上庭为 true（无发际线关键点，外推估算）
}

export interface FaceMetrics {
  /** 面高（上庭估计 + 中庭 + 下庭），px */
  faceHeight: number
  upperThird: ThirdMetric
  midThird: ThirdMetric
  lowerThird: ThirdMetric
  /** 三庭比 上:中:下（如 "31:33:36"） */
  thirdsRatio: string
  /** 眼裂宽（左右眼平均），px */
  eyeWidth: number
  /** 眼距比 = 两内眼角距 / 眼裂宽（五眼标准 ≈1） */
  eyeSpacingRatio: number
  /** 鼻翼宽比 = 鼻翼宽 / 眼裂宽 */
  noseWidthRatio: number
  /** 面长宽比 = 面高 / 颧宽 */
  faceLengthWidthRatio: number
  /** 下颌角宽比 = 下颌角宽 / 颧宽 */
  jawWidthRatio: number
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function third(px: number, faceHeight: number, estimated: boolean): ThirdMetric {
  return {
    px: Math.round(px * 10) / 10,
    pct: Math.round((px / faceHeight) * 1000) / 10,
    estimated,
  }
}

/**
 * 计算面容指标。
 * @param landmarks 478 点像素坐标（已换算到图片坐标系）
 * @throws 点数不足时抛错（调用方负责降级）
 */
export function computeFaceMetrics(landmarks: Point[]): FaceMetrics {
  if (!landmarks || landmarks.length < 468) {
    throw new Error(`landmarks 点数不足（${landmarks?.length ?? 0}），无法计算指标`)
  }

  const glabella = landmarks[LM_GLABELLA]
  const foreheadTop = landmarks[LM_FOREHEAD_TOP]
  const subnasale = landmarks[LM_SUBNASALE]
  const chin = landmarks[LM_CHIN_BOTTOM]

  // 三庭（上庭外推估算，标 estimated）
  const upperPx = (glabella.y - foreheadTop.y) * FOREHEAD_EXTRAPOLATION
  const midPx = subnasale.y - glabella.y
  const lowerPx = chin.y - subnasale.y
  const faceHeight = upperPx + midPx + lowerPx

  // 五眼
  const rightEyeWidth = dist(landmarks[LM_RIGHT_EYE_OUTER], landmarks[LM_RIGHT_EYE_INNER])
  const leftEyeWidth = dist(landmarks[LM_LEFT_EYE_OUTER], landmarks[LM_LEFT_EYE_INNER])
  const eyeWidth = (rightEyeWidth + leftEyeWidth) / 2
  const eyeSpacing = dist(landmarks[LM_RIGHT_EYE_INNER], landmarks[LM_LEFT_EYE_INNER])
  const noseWidth = dist(landmarks[LM_NOSE_ALAR_RIGHT], landmarks[LM_NOSE_ALAR_LEFT])

  // 脸型
  const zygomaWidth = dist(landmarks[LM_ZYGOMA_RIGHT], landmarks[LM_ZYGOMA_LEFT])
  const jawWidth = dist(landmarks[LM_JAW_ANGLE_RIGHT], landmarks[LM_JAW_ANGLE_LEFT])

  const u = third(upperPx, faceHeight, true)
  const m = third(midPx, faceHeight, false)
  const l = third(lowerPx, faceHeight, false)

  return {
    faceHeight: Math.round(faceHeight * 10) / 10,
    upperThird: u,
    midThird: m,
    lowerThird: l,
    thirdsRatio: `${Math.round(u.pct)}:${Math.round(m.pct)}:${Math.round(l.pct)}`,
    eyeWidth: Math.round(eyeWidth * 10) / 10,
    eyeSpacingRatio: Math.round((eyeSpacing / eyeWidth) * 100) / 100,
    noseWidthRatio: Math.round((noseWidth / eyeWidth) * 100) / 100,
    faceLengthWidthRatio: Math.round((faceHeight / zygomaWidth) * 100) / 100,
    jawWidthRatio: Math.round((jawWidth / zygomaWidth) * 100) / 100,
  }
}
