/**
 * vertexWarp 单元测试
 * @see src/renderer/src/components/portrait/geometry/vertexWarp.ts
 *
 * 用合成 478 点验证顶点位移场：纵向分段线性、横向权重衰减、边界连续。
 */
import { describe, expect, it } from 'vitest'
import {
  computeVertexDisplacements,
  transformLandmarksByDisplacement,
} from '@/components/portrait/geometry/vertexWarp'
import type { Point } from '@/components/portrait/geometry/faceMetrics'
import {
  LM_GLABELLA,
  LM_SUBNASALE,
  LM_CHIN_BOTTOM,
  LM_JAW_ANGLE_RIGHT,
  LM_JAW_ANGLE_LEFT,
  LM_RIGHT_EYE_INNER,
  LM_LEFT_EYE_INNER,
} from '@/components/portrait/geometry/landmarkIndices'

/** 合成 478 点：默认放在面中心附近，按索引覆盖关键点 */
function makeLandmarks(over: Record<number, Point>): Point[] {
  return Array.from({ length: 478 }, (_, i) => over[i] ?? { x: 300, y: 250 })
}

const base = makeLandmarks({
  [LM_GLABELLA]: { x: 300, y: 100 },
  [LM_SUBNASALE]: { x: 300, y: 200 },
  [LM_CHIN_BOTTOM]: { x: 300, y: 400 },
  [LM_JAW_ANGLE_RIGHT]: { x: 220, y: 330 },
  [LM_JAW_ANGLE_LEFT]: { x: 380, y: 330 },
  // 眼裂宽 50（外内角距 50），右眼中心 (225,90)，左眼中心 (375,90)
  [/*LM_RIGHT_EYE_OUTER*/ 33]: { x: 200, y: 90 },
  [/*LM_RIGHT_EYE_INNER*/ 133]: { x: 250, y: 90 },
  [/*LM_LEFT_EYE_OUTER*/ 263]: { x: 400, y: 90 },
  [/*LM_LEFT_EYE_INNER*/ 362]: { x: 350, y: 90 },
})

describe('computeVertexDisplacements · 参数全 0', () => {
  it('所有顶点位移为 0', () => {
    const disp = computeVertexDisplacements(base, {})
    expect(disp).toHaveLength(478)
    expect(disp.every(d => d.dx === 0 && d.dy === 0)).toBe(true)
  })
})

describe('computeVertexDisplacements · 下颌宽', () => {
  it('+10%：下颌带内 x>cx 顶点 dx≈(x-cx)*0.1（weight=1）', () => {
    const lms = base.slice()
    lms[50] = { x: 400, y: 380 } // 下颌带内（jawTopY=330, chinY=400）
    const disp = computeVertexDisplacements(lms, { jaw: 0.1 })
    expect(disp[50].dx).toBeCloseTo(10, 1) // (400-300)*0.1
  })

  it('-10%：下颌带内 x>cx 顶点 dx<0（靠近中心）', () => {
    const lms = base.slice()
    lms[50] = { x: 400, y: 380 }
    const disp = computeVertexDisplacements(lms, { jaw: -0.1 })
    expect(disp[50].dx).toBeCloseTo(-10, 1)
  })

  it('下颌角（y=jawTopY）weight=1 变形：dx≈(x-cx)*jaw', () => {
    const disp = computeVertexDisplacements(base, { jaw: 0.1 })
    // LM_JAW_ANGLE_LEFT(380,330), jawTopY=330, weight=1
    expect(disp[LM_JAW_ANGLE_LEFT].dx).toBeCloseTo(8, 1) // (380-300)*0.1
  })

  it('中脸（y 远小于 jawTopY）weight=0 不变形', () => {
    const lms = base.slice()
    lms[51] = { x: 400, y: 150 } // 中脸（fadeStart=288，y=150<288）
    const disp = computeVertexDisplacements(lms, { jaw: 0.1 })
    expect(Math.abs(disp[51].dx)).toBeLessThan(0.5)
  })

  it('向上衰减连续：jawTopY 与其上方 10px 顶点位移差有界', () => {
    const lms = base.slice()
    lms[80] = { x: 400, y: 330 } // jawTopY, weight=1
    lms[81] = { x: 400, y: 320 } // 略上方，weight≈0.857
    const disp = computeVertexDisplacements(lms, { jaw: 0.1 })
    const ddx = Math.abs(disp[80].dx - disp[81].dx)
    expect(ddx).toBeLessThan(2) // 衰减平滑
  })
})

describe('computeVertexDisplacements · 眼距', () => {
  it('+8%：左眼（图右）顶点 dx>0，右眼（图左）顶点 dx<0，下巴 dx≈0', () => {
    const disp = computeVertexDisplacements(base, { eyeSpacing: 0.08 })
    expect(disp[LM_LEFT_EYE_INNER].dx).toBeGreaterThan(0)
    expect(disp[LM_RIGHT_EYE_INNER].dx).toBeLessThan(0)
    // 下巴远离双眼，高斯权重≈0
    expect(Math.abs(disp[LM_CHIN_BOTTOM].dx)).toBeLessThan(0.5)
  })

  it('-6%：方向反转（左眼 dx<0，右眼 dx>0）', () => {
    const disp = computeVertexDisplacements(base, { eyeSpacing: -0.06 })
    expect(disp[LM_LEFT_EYE_INNER].dx).toBeLessThan(0)
    expect(disp[LM_RIGHT_EYE_INNER].dx).toBeGreaterThan(0)
  })
})

describe('computeVertexDisplacements · 纵向', () => {
  it('中庭 -10%：中带顶点 dy=-5（压缩），下带顶点 dy=-10（整体上移）', () => {
    const lms = base.slice()
    lms[60] = { x: 300, y: 150 } // 中带内
    const disp = computeVertexDisplacements(lms, { midface: -0.1 })
    // 中带 y=150 -> 100+(150-100)*0.9=145, dy=-5
    expect(disp[60].dy).toBeCloseTo(-5, 1)
    // chin y=400 -> 100+90+(400-200)*1=390, dy=-10
    expect(disp[LM_CHIN_BOTTOM].dy).toBeCloseTo(-10, 1)
  })

  it('眉心以上顶点 dy=0（不动）', () => {
    const lms = base.slice()
    lms[70] = { x: 300, y: 50 }
    const disp = computeVertexDisplacements(lms, { midface: -0.1, lowerface: -0.1 })
    expect(disp[70].dy).toBe(0)
  })

  it('分段边界位置连续：眉心 dy=0，鼻底 dy=midDstH-midSrcH', () => {
    const disp = computeVertexDisplacements(base, { midface: -0.1 })
    // 眉心 y=100（上带/中带边界）dy=0
    expect(disp[LM_GLABELLA].dy).toBe(0)
    // 鼻底 y=200（中带/下带边界）dy = midDstH - midSrcH = 90 - 100 = -10
    expect(disp[LM_SUBNASALE].dy).toBeCloseTo(-10, 1)
  })
})

describe('computeVertexDisplacements · 边界连续', () => {
  it('相邻顶点（距离 1px）位移差 <0.5px（横向权重平滑）', () => {
    const lms = base.slice()
    lms[80] = { x: 300, y: 380 }
    lms[81] = { x: 301, y: 380 }
    const disp = computeVertexDisplacements(lms, { jaw: 0.1, eyeSpacing: 0.05 })
    const ddx = Math.abs(disp[80].dx - disp[81].dx)
    expect(ddx).toBeLessThan(0.5)
  })
})

describe('transformLandmarksByDisplacement', () => {
  it('下颌带顶点 x 变化，眉心 x 不变', () => {
    const lms = base.slice()
    lms[50] = { x: 400, y: 380 }
    const out = transformLandmarksByDisplacement(lms, { jaw: 0.1 })
    expect(out[50].x).not.toBe(lms[50].x)
    expect(out[LM_GLABELLA].x).toBe(lms[LM_GLABELLA].x)
  })

  it('保留 z 深度', () => {
    const lms = base.slice()
    lms[50] = { x: 400, y: 380, z: -0.1 }
    const out = transformLandmarksByDisplacement(lms, { jaw: 0.1 })
    expect(out[50].z).toBe(-0.1)
  })
})
