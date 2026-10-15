/**
 * bandWarp 单元测试（规则网格位移场版入口层）
 * @see src/renderer/src/components/portrait/geometry/bandWarp.ts
 *
 * 入口层纯函数：estimateBackgroundColor / transformLandmarks。
 * warpFaceBands 依赖 canvas DOM，由 CDP 实测覆盖。
 */
import { describe, expect, it } from 'vitest'
import {
  estimateBackgroundColor,
  transformLandmarks,
} from '@/components/portrait/geometry/bandWarp'
import type { Point } from '@/components/portrait/geometry/faceMetrics'

describe('estimateBackgroundColor', () => {
  it('四角均值', () => {
    const bg = estimateBackgroundColor(
      (x) => (x < 400 ? [200, 200, 200] : [220, 220, 220]),
      768,
      1024,
    )
    expect(bg).toEqual([210, 210, 210])
  })
})

describe('transformLandmarks', () => {
  function makeLandmarks(over: Record<number, Point>): Point[] {
    return Array.from({ length: 478 }, (_, i) => over[i] ?? { x: 300, y: 250 })
  }

  // 完整 landmark set（归一化坐标 0-1，measureFace 需要所有关键索引）
  const base = makeLandmarks({
    // 纵向分界线
    [9]:   { x: 0.50, y: 0.20 },  // LM_GLABELLA
    [2]:   { x: 0.50, y: 0.40 },  // LM_SUBNASALE
    [152]: { x: 0.50, y: 0.80 },  // LM_CHIN_BOTTOM
    [10]:  { x: 0.50, y: 0.10 },  // LM_FOREHEAD_TOP
    [0]:   { x: 0.50, y: 0.43 },  // LM_UPPER_LIP_MID
    [14]:  { x: 0.50, y: 0.46 },  // LM_LOWER_LIP_MID
    // 脸宽
    [234]: { x: 0.30, y: 0.50 },  // LM_FACE_LEFT
    [454]: { x: 0.70, y: 0.50 },  // LM_FACE_RIGHT
    // 虹膜
    [468]: { x: 0.40, y: 0.25 },  // left iris
    [473]: { x: 0.60, y: 0.25 },  // right iris
    // 眼下缘
    [145]: { x: 0.42, y: 0.31 },  // EYE_LOWER_L
    [374]: { x: 0.58, y: 0.31 },  // EYE_LOWER_R
    // 鼻梁/鼻尖/鼻翼
    [168]: { x: 0.50, y: 0.22 },  // NOSE_BRIDGE_TOP
    [1]:   { x: 0.50, y: 0.38 },  // NOSE_TIP（近似旧索引）
    [4]:   { x: 0.50, y: 0.38 },  // NOSE_TIP（pronasale）
    [129]: { x: 0.44, y: 0.40 },  // ALA_LEFT
    [358]: { x: 0.56, y: 0.40 },  // ALA_RIGHT
    // 唇部
    [13]:  { x: 0.50, y: 0.44 },  // LIP_INNER_UP
    [61]:  { x: 0.42, y: 0.45 },  // MOUTH_LEFT
    [291]: { x: 0.58, y: 0.45 },  // MOUTH_RIGHT
    // 眼角/颧骨
    [33]:  { x: 0.38, y: 0.26 },  // EYE_OUTER_R
    [263]: { x: 0.62, y: 0.26 },  // EYE_OUTER_L
    [116]: { x: 0.25, y: 0.55 },  // CHEEKBONE_R
    [345]: { x: 0.75, y: 0.55 },  // CHEEKBONE_L
    // 下颌角
    [136]: { x: 0.35, y: 0.65 },  // JAW_ANGLE_R
    [365]: { x: 0.65, y: 0.65 },  // JAW_ANGLE_L
  })

  it('参数全 0：返回原坐标（位移全 0）', () => {
    const out = transformLandmarks(base, {})
    expect(out[0].x).toBe(base[0].x)
    expect(out[0].y).toBe(base[0].y)
  })

  it('下颌宽 +10%：下颌带顶点 x 变化，眉心 x 不变（jaw 1=中性 >1=放宽）', () => {
    const lms = base.slice()
    lms[50] = { x: 0.65, y: 0.72 } // 下颌带内
    const out = transformLandmarks(lms, { jaw: 1.1 })
    // 下颌放宽：x>midX 的点 dx>0
    expect(out[50].x).toBeGreaterThan(lms[50].x)
    expect(out[9].x).toBe(lms[9].x) // 眉心 x 不变
  })

  it('保留 z 深度', () => {
    const lms = base.slice()
    lms[50] = { x: 0.65, y: 0.72, z: -0.1 }
    const out = transformLandmarks(lms, { jaw: 1.1 })
    expect(out[50].z).toBe(-0.1)
  })
})
