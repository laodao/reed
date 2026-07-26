/**
 * faceMetrics 单元测试
 * @see src/renderer/src/components/portrait/geometry/faceMetrics.ts
 *
 * 用合成 478 点验证三庭五眼/脸型指标计算（含上庭外推估算与 estimated 标记）。
 */
import { describe, expect, it } from 'vitest'
import { computeFaceMetrics, type Point } from '@/components/portrait/geometry/faceMetrics'
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
} from '@/components/portrait/geometry/landmarkIndices'

/** 合成 478 点：默认全 0，按索引设置关键点 */
function makeLandmarks(over: Record<number, Point>): Point[] {
  const pts: Point[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }))
  for (const [k, p] of Object.entries(over)) pts[Number(k)] = p
  return pts
}

// 基准人脸：眉心 y=100，鼻底 y=200，颏底 y=400，额头轮廓顶点 y=20
const base = makeLandmarks({
  [LM_GLABELLA]: { x: 300, y: 100 },
  [LM_FOREHEAD_TOP]: { x: 300, y: 20 },
  [LM_SUBNASALE]: { x: 300, y: 200 },
  [LM_CHIN_BOTTOM]: { x: 300, y: 400 },
  [LM_RIGHT_EYE_OUTER]: { x: 200, y: 90 },
  [LM_RIGHT_EYE_INNER]: { x: 250, y: 90 },
  [LM_LEFT_EYE_OUTER]: { x: 400, y: 90 },
  [LM_LEFT_EYE_INNER]: { x: 350, y: 90 },
  [LM_NOSE_ALAR_RIGHT]: { x: 270, y: 190 },
  [LM_NOSE_ALAR_LEFT]: { x: 330, y: 190 },
  [LM_ZYGOMA_RIGHT]: { x: 150, y: 150 },
  [LM_ZYGOMA_LEFT]: { x: 450, y: 150 },
  [LM_JAW_ANGLE_RIGHT]: { x: 220, y: 330 },
  [LM_JAW_ANGLE_LEFT]: { x: 380, y: 330 },
})

describe('computeFaceMetrics', () => {
  it('三庭：中庭/下庭精确，上庭外推且标 estimated', () => {
    const m = computeFaceMetrics(base)
    // 中庭 200-100=100；下庭 400-200=200；上庭 (100-20)*1.6=128
    expect(m.midThird.px).toBe(100)
    expect(m.lowerThird.px).toBe(200)
    expect(m.upperThird.px).toBeCloseTo(128, 1)
    expect(m.upperThird.estimated).toBe(true)
    expect(m.midThird.estimated).toBe(false)
    // 面高 = 128+100+200 = 428
    expect(m.faceHeight).toBeCloseTo(428, 1)
    expect(m.midThird.pct).toBeCloseTo(23.4, 0.1)
    expect(m.lowerThird.pct).toBeCloseTo(46.7, 0.1)
  })

  it('三庭比输出 上:中:下 整数比', () => {
    const m = computeFaceMetrics(base)
    expect(m.thirdsRatio).toBe('30:23:47')
  })

  it('五眼：眼裂宽/眼距比/鼻翼宽比', () => {
    const m = computeFaceMetrics(base)
    // 眼裂宽 = (50+50)/2 = 50；眼距 = 350-250=100 → 2.0；鼻翼 330-270=60 → 1.2
    expect(m.eyeWidth).toBe(50)
    expect(m.eyeSpacingRatio).toBe(2)
    expect(m.noseWidthRatio).toBeCloseTo(1.2, 2)
  })

  it('脸型：面长宽比/下颌角宽比', () => {
    const m = computeFaceMetrics(base)
    // 颧宽 = 450-150=300；面长宽比 = 428/300 ≈ 1.43
    expect(m.faceLengthWidthRatio).toBeCloseTo(1.43, 2)
    // 下颌角宽 = 380-220=160；160/300 ≈ 0.53
    expect(m.jawWidthRatio).toBeCloseTo(0.53, 2)
  })

  it('点数不足抛错（调用方降级）', () => {
    expect(() => computeFaceMetrics([])).toThrow(/点数不足/)
    expect(() => computeFaceMetrics(Array.from({ length: 100 }, () => ({ x: 0, y: 0 })))).toThrow()
  })

  it('外推系数可溯源（上庭 = 顶点到眉心 × 系数）', () => {
    const m = computeFaceMetrics(base)
    expect(m.upperThird.px).toBeCloseTo((100 - 20) * FOREHEAD_EXTRAPOLATION, 1)
  })

  it('带 z 深度的 landmarks 不干扰指标计算（3D 升级回归保护）', () => {
    const withZ: Point[] = base.map(p => ({ ...p, z: 0.5 }))
    const m1 = computeFaceMetrics(base)
    const m2 = computeFaceMetrics(withZ)
    expect(m2.thirdsRatio).toBe(m1.thirdsRatio)
    expect(m2.eyeWidth).toBe(m1.eyeWidth)
    expect(m2.jawWidthRatio).toBe(m1.jawWidthRatio)
  })
})
