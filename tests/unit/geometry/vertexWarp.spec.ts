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
  LM_FOREHEAD_TOP,
  LM_NOSE_BRIDGE_197,
  LM_UPPER_LIP_MID,
  LM_LOWER_LIP_MID,
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
  // 新增 6 段锚点
  [LM_FOREHEAD_TOP]: { x: 300, y: 50 },        // 上庭顶点
  [LM_NOSE_BRIDGE_197]: { x: 300, y: 130 },     // 鼻梁中上段（眼鼻分界）
  [LM_UPPER_LIP_MID]: { x: 300, y: 215 },       // 上唇中点
  [LM_LOWER_LIP_MID]: { x: 300, y: 230 },       // 下唇中点
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
  it('中庭 -10%：眼部带 dy=0（不缩放），鼻部（y=150）dy=-2，下巴 dy=-7', () => {
    const lms = base.slice()
    lms[60] = { x: 300, y: 150 } // 鼻部带内 [130,200)
    const disp = computeVertexDisplacements(lms, { midface: -0.1 })
    // 眼部带 [100,130) scale=1 → dy=0；鼻部 y=150 → 130+(150-130)*0.9=148, dy=-2
    expect(disp[60].dy).toBeCloseTo(-2, 1)
    // chin y=400 → dstSubnasale(130+70*0.9=193)+(400-200)*1=393, dy=-7
    expect(disp[LM_CHIN_BOTTOM].dy).toBeCloseTo(-7, 1)
  })

  it('眉心以上顶点 dy=0（不动）', () => {
    const lms = base.slice()
    lms[70] = { x: 300, y: 50 }
    const disp = computeVertexDisplacements(lms, { midface: -0.1, lowerface: -0.1 })
    expect(disp[70].dy).toBe(0)
  })

  it('分段边界位置连续：眉心 dy=0（眼部带不缩放），鼻底 dy=-7（仅鼻部缩放）', () => {
    const disp = computeVertexDisplacements(base, { midface: -0.1 })
    // 眉心 y=100，眼部带 scale=1 → dy=0
    expect(disp[LM_GLABELLA].dy).toBe(0)
    // 鼻底 y=200，dstSubnasale = noseBridge(130) + noseSrcH*0.9(63) = 193, dy=-7
    expect(disp[LM_SUBNASALE].dy).toBeCloseTo(-7, 1)
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

describe('computeVertexDisplacements · 6 段纵向', () => {
  // 锚点 y：上庭外推 20 → glabella 100 → noseBridge 130 → subnasale 200
  //            → upperLip 215 → lowerLip 230 → chin 400
  // foreheadTopExtY = 100 - (100-50)*1.6 = 20
  // 段高：[0,20]=20, [20,100]=80, [100,130]=30, [130,200]=70, [200,215]=15, [215,230]=15, [230,400]=170

  it('foreheadH +10%：中庭以上（y=60）dy 应为正值（向下拉伸）', () => {
    const lms = base.slice()
    lms[100] = { x: 300, y: 60 } // y=60 在上庭段 [20,100)
    const disp = computeVertexDisplacements(lms, { foreheadH: 0.1 })
    // y=60, anchor[1]=20: ny = dst1 + (60-20)*1.1, dst1 = 0+20*1=20
    // ny = 20 + 44 = 64, dy = 4
    expect(disp[100].dy).toBeCloseTo(4, 0)
  })

  it('eyeAreaH -10%：眼部（y=115）dy 应为负值（向上压缩）', () => {
    const lms = base.slice()
    lms[110] = { x: 300, y: 115 } // y=115 在眼部段 [100,130)
    const disp = computeVertexDisplacements(lms, { eyeAreaH: -0.1 })
    // 无上庭缩放时 dst2=120: anchor[1]=20, dh[1]=80*1=80, dst2=100
    // ny = 100 + (115-100)*0.9 = 113.5, dy = -1.5
    expect(disp[110].dy).toBeCloseTo(-1.5, 0)
    expect(disp[110].dy).toBeLessThan(0)
  })

  it('noseH +10%：鼻部（y=160）dy 应为正值（向下拉伸）', () => {
    const lms = base.slice()
    lms[160] = { x: 300, y: 160 } // y=160 在鼻部段 [130,200)
    const disp = computeVertexDisplacements(lms, { noseH: 0.1 })
    // dst3=130 (eye无缩放→seg2保持30): dst2=100+30=130
    // ny = 130 + (160-130)*1.1 = 163, dy = 3
    expect(disp[160].dy).toBeCloseTo(3, 0)
  })

  it('chinH +15%：下巴（y=300）dy 应为正值（向下拉伸）', () => {
    const lms = base.slice()
    lms[300] = { x: 300, y: 300 } // y=300 在下巴段 [230,400)
    const disp = computeVertexDisplacements(lms, { chinH: 0.15 })
    // 前 5 段无缩放：dst6 = 0+20+80+30+70+15+15 = 230 (=anchors[6])
    // ny = 230 + (300-230)*1.15 = 310.5, dy = 10.5
    expect(disp[300].dy).toBeCloseTo(10.5, 0)
  })

  it('段边界连续：glabella(y=100) 的值在 foreheadH 和 eyeAreaH 下一致', () => {
    const lms = base.slice()
    // glabella 本身
    const disp = computeVertexDisplacements(lms, { foreheadH: 0.1, eyeAreaH: 0.05 })
    // y=100 是 forehead 段终点 和 eye 段起点
    // forehead 段: ny = 20 + (100-20)*1.1 = 108 → dy=8
    // eye 段: ny = dst2 + (100-100)*1.05, dst2=20+80*1.1=108 → ny=108 → dy=8
    expect(disp[LM_GLABELLA].dy).toBeCloseTo(8, 0)
  })

  it('新参数全 0 且旧参数有值时回退到旧路径（眼部保护生效）', () => {
    const lms = base.slice()
    lms[60] = { x: 300, y: 150 } // 鼻部带内 [130,200)
    const disp = computeVertexDisplacements(lms, { midface: -0.1 })
    // 眼部带 [100,130) scale=1 → dy=0；鼻部 y=150 → dy=-2
    expect(disp[60].dy).toBeCloseTo(-2, 0)
    // chin: dstSubnasale(130+70*0.9=193)+(400-200)*1=393, dy=-7
    expect(disp[LM_CHIN_BOTTOM].dy).toBeCloseTo(-7, 0)
  })

  it('新参数存在时忽略旧参数（上庭拉伸级联下移所有后续段）', () => {
    const lms = base.slice()
    lms[100] = { x: 300, y: 60 } // 上庭段内测试点
    lms[150] = { x: 300, y: 250 } // 下巴段内测试点（y=250 ≥ chin anchor 230）
    // 同时传新 foreheadH 和旧 midface，应该只用新的
    const disp = computeVertexDisplacements(lms, { foreheadH: 0.1, midface: 0.5 })
    // y=60 在上庭段 [20,100)：forehead scale=1.1, dy≈4
    expect(disp[100]?.dy).toBeCloseTo(4, 0)
    // y=250 在下巴段 [230,400)：scale=1，但因上庭拉伸级联，glabella → 108，
    //   累积后 chin anchor 从 230→238，y=250→258, dy=8
    expect(disp[150]?.dy ?? 0).toBeCloseTo(8, 0)
  })
})

describe('computeVertexDisplacements · 6 段横向', () => {
  it('foreheadW +10%：上庭顶点（x=400,y=60）dx>0（向外扩）', () => {
    const lms = base.slice()
    lms[100] = { x: 400, y: 60 }
    const disp = computeVertexDisplacements(lms, { foreheadW: 0.1 })
    // (400-300)*0.1*weight, weight≈1 (y=60 在 [20,100) 内部，远离边界)
    expect(disp[100].dx).toBeGreaterThan(8)
    expect(disp[100].dx).toBeLessThan(11)
  })

  it('noseW -15%：鼻部顶点（x=250,y=160）dx>0（向中线收窄，x<cx）', () => {
    const lms = base.slice()
    lms[160] = { x: 250, y: 160 } // x<cx(300), noseW<0 → dx>0（左点右移收窄）
    const disp = computeVertexDisplacements(lms, { noseW: -0.15 })
    expect(disp[160].dx).toBeGreaterThan(5)
  })

  it('段外顶点不受段宽影响', () => {
    const lms = base.slice()
    lms[350] = { x: 400, y: 350 } // y=350 在下巴段 [230,400)
    const disp = computeVertexDisplacements(lms, { foreheadW: 0.1 })
    // 只设置上庭宽，下巴不受影响
    expect(Math.abs(disp[350].dx)).toBeLessThan(0.5)
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
