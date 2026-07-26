/**
 * bandWarp 单元测试（3D mesh 版入口层）
 * @see src/renderer/src/components/portrait/geometry/bandWarp.ts
 *
 * 入口层纯函数：estimateBackgroundColor / transformLandmarks。
 * warpFaceBands 依赖 canvas DOM，由 CDP 实测覆盖（spec §8）。
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
  const base = makeLandmarks({
    [9]: { x: 300, y: 100 },   // LM_GLABELLA
    [2]: { x: 300, y: 200 },   // LM_SUBNASALE
    [152]: { x: 300, y: 400 }, // LM_CHIN_BOTTOM
    [136]: { x: 220, y: 330 }, // LM_JAW_ANGLE_RIGHT
    [365]: { x: 380, y: 330 }, // LM_JAW_ANGLE_LEFT
    [33]: { x: 200, y: 90 },   // LM_RIGHT_EYE_OUTER
    [133]: { x: 250, y: 90 },  // LM_RIGHT_EYE_INNER
    [263]: { x: 400, y: 90 },  // LM_LEFT_EYE_OUTER
    [362]: { x: 350, y: 90 },  // LM_LEFT_EYE_INNER
  })

  it('参数全 0：返回原坐标（位移全 0）', () => {
    const out = transformLandmarks(base, {})
    expect(out[0].x).toBe(base[0].x)
    expect(out[0].y).toBe(base[0].y)
  })

  it('下颌宽 +10%：下颌带顶点 x 变化，眉心 x 不变', () => {
    const lms = base.slice()
    lms[50] = { x: 400, y: 380 } // 下颌带内
    const out = transformLandmarks(lms, { jaw: 0.1 })
    expect(out[50].x).not.toBe(lms[50].x)
    expect(out[9].x).toBe(lms[9].x) // 眉心 x 不变
  })

  it('保留 z 深度', () => {
    const lms = base.slice()
    lms[50] = { x: 400, y: 380, z: -0.1 }
    const out = transformLandmarks(lms, { jaw: 0.1 })
    expect(out[50].z).toBe(-0.1)
  })
})
