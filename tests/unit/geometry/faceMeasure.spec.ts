/**
 * faceMeasure 单元测试
 * @see src/renderer/src/components/portrait/geometry/faceMeasure.ts
 */
import { describe, expect, it } from 'vitest'
import { measureFace } from '@/components/portrait/geometry/faceMeasure'
import type { Point } from '@/components/portrait/geometry/faceMetrics'

function makeLM(over: Record<number, Point>): Point[] {
  return Array.from({ length: 478 }, (_, i) => over[i] ?? { x: 0.50, y: 0.50 })
}

const base = makeLM({
  [10]:  { x: 0.50, y: 0.10 },  // FOREHEAD_TOP
  [9]:   { x: 0.50, y: 0.22 },  // GLABELLA
  [145]: { x: 0.42, y: 0.33 },  // EYE_LOWER_L
  [374]: { x: 0.58, y: 0.33 },  // EYE_LOWER_R
  [2]:   { x: 0.50, y: 0.42 },  // SUBNASALE
  [0]:   { x: 0.50, y: 0.46 },  // UPPER_LIP_MID
  [14]:  { x: 0.50, y: 0.50 },  // LOWER_LIP_MID
  [152]: { x: 0.50, y: 0.85 },  // CHIN_BOTTOM
  // 脸宽
  [234]: { x: 0.28, y: 0.50 },  // FACE_LEFT
  [454]: { x: 0.72, y: 0.50 },  // FACE_RIGHT
  // 虹膜
  [468]: { x: 0.40, y: 0.26 },  // left iris
  [473]: { x: 0.60, y: 0.26 },  // right iris
  // 鼻梁/鼻尖/鼻翼
  [168]: { x: 0.50, y: 0.24 },  // NOSE_BRIDGE_TOP
  [1]:   { x: 0.50, y: 0.40 },  // NOSE_TIP（近似旧索引）
  [4]:   { x: 0.50, y: 0.40 },  // NOSE_TIP（pronasale）
  [129]: { x: 0.44, y: 0.42 },  // ALA_LEFT
  [358]: { x: 0.56, y: 0.42 },  // ALA_RIGHT
  // 唇部
  [13]:  { x: 0.50, y: 0.48 },  // LIP_INNER_UP
  [61]:  { x: 0.42, y: 0.48 },  // MOUTH_LEFT
  [291]: { x: 0.58, y: 0.48 },  // MOUTH_RIGHT
  // 眼角/颧骨
  [33]:  { x: 0.38, y: 0.27 },  // EYE_OUTER_R
  [263]: { x: 0.62, y: 0.27 },  // EYE_OUTER_L
  [116]: { x: 0.24, y: 0.58 },  // CHEEKBONE_R
  [345]: { x: 0.76, y: 0.58 },  // CHEEKBONE_L
})

describe('measureFace', () => {
  it('中轴线 midX = 左右 face 中点', () => {
    const M = measureFace(base)
    expect(M.midX).toBeCloseTo(0.50, 2)
  })

  it('半脸宽 halfW', () => {
    const M = measureFace(base)
    expect(M.halfW).toBeCloseTo(0.22, 2)
  })

  it('纵向 7 条分界线单调递增', () => {
    const M = measureFace(base)
    const ys = [M.yTop, M.yBrow, M.yEye, M.yNose, M.yLip, M.yMouth, M.yChin]
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1])
    }
  })

  it('眼距 = 左右虹膜 x 差', () => {
    const M = measureFace(base)
    expect(M.eyeGap).toBeCloseTo(0.20, 2)
  })

  it('鼻半宽 = 左右鼻翼 x 差 / 2', () => {
    const M = measureFace(base)
    expect(M.noseHalfW).toBeCloseTo(0.06, 2)
  })

  it('嘴半宽 = 左右嘴角 x 差 / 2', () => {
    const M = measureFace(base)
    expect(M.mouthHalfW).toBeCloseTo(0.08, 2)
  })

  it('虹膜中心 (eyes) 为左右虹膜坐标', () => {
    const M = measureFace(base)
    expect(M.eyes[0].x).toBeCloseTo(0.40)
    expect(M.eyes[1].x).toBeCloseTo(0.60)
  })

  it('颧骨中心在正确位置', () => {
    const M = measureFace(base)
    expect(M.cheekY).toBeCloseTo(0.58, 1)
  })
})
