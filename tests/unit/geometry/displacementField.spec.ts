/**
 * displacementField 单元测试
 * @see src/renderer/src/components/portrait/geometry/displacementField.ts
 */
import { describe, expect, it } from 'vitest'
import {
  clamp, smoothstep, piecewise,
  buildFieldParams, evalField, localGauss2D,
} from '@/components/portrait/geometry/displacementField'
import { measureFace } from '@/components/portrait/geometry/faceMeasure'
import type { Point } from '@/components/portrait/geometry/faceMetrics'
import type { FieldParams } from '@/components/portrait/geometry/displacementField'
import type { FaceMeasure } from '@/components/portrait/geometry/faceMeasure'

// ── 共享的测试用 M ──
function makeLM(over: Record<number, Point>): Point[] {
  return Array.from({ length: 478 }, (_, i) => over[i] ?? { x: 0.50, y: 0.50 })
}
const baseLM = makeLM({
  [10]:  { x: 0.50, y: 0.10 }, [9]: { x: 0.50, y: 0.22 },
  [145]: { x: 0.42, y: 0.33 }, [374]: { x: 0.58, y: 0.33 },
  [2]:   { x: 0.50, y: 0.42 }, [0]: { x: 0.50, y: 0.46 },
  [14]:  { x: 0.50, y: 0.50 }, [152]: { x: 0.50, y: 0.85 },
  [234]: { x: 0.28, y: 0.50 }, [454]: { x: 0.72, y: 0.50 },
  [468]: { x: 0.40, y: 0.26 }, [473]: { x: 0.60, y: 0.26 },
  [168]: { x: 0.50, y: 0.24 }, [1]: { x: 0.50, y: 0.40 }, [4]: { x: 0.50, y: 0.40 },
  [129]: { x: 0.44, y: 0.42 }, [358]: { x: 0.56, y: 0.42 },
  [13]:  { x: 0.50, y: 0.48 }, [61]: { x: 0.42, y: 0.48 },
  [291]: { x: 0.58, y: 0.48 },
  [17]:  { x: 0.50, y: 0.52 }, // 下唇外缘中点（嘴部/下巴分界，yMouth）
  [33]:  { x: 0.38, y: 0.27 }, [263]: { x: 0.62, y: 0.27 },
  [116]: { x: 0.24, y: 0.58 }, [345]: { x: 0.76, y: 0.58 },
})
const testM = measureFace(baseLM)

// ── 工具函数 ──
describe('clamp', () => {
  it('区间内不变', () => expect(clamp(0.5, 0, 1)).toBe(0.5))
  it('小于下限', () => expect(clamp(-0.1, 0, 1)).toBe(0))
  it('大于上限', () => expect(clamp(1.5, 0, 1)).toBe(1))
})

describe('smoothstep', () => {
  it('a 点返回值 0', () => expect(smoothstep(0, 1, 0)).toBe(0))
  it('b 点返回值 1', () => expect(smoothstep(0, 1, 1)).toBe(1))
  it('中点返回值约 0.5', () => expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 1))
})

describe('piecewise', () => {
  const xs = [0, 0.2, 0.5, 1]
  const ys = [0, 0.3, 0.6, 1]
  it('端点映射', () => {
    expect(piecewise(0, xs, ys)).toBe(0)
    expect(piecewise(1, xs, ys)).toBe(1)
  })
  it('中间点线性插值', () => {
    expect(piecewise(0.1, xs, ys)).toBeCloseTo(0.15)
    expect(piecewise(0.35, xs, ys)).toBeCloseTo(0.45)
  })
  it('首尾外推回端点', () => {
    expect(piecewise(-0.1, xs, ys)).toBe(0)
    expect(piecewise(1.5, xs, ys)).toBe(1)
  })
})

// ── buildFieldParams ──
describe('buildFieldParams', () => {
  it('默认参数（全 1/0）时 ysOut == ysIn（不变形）', () => {
    const F = buildFieldParams(testM, {})
    expect(F.ysOut).toEqual(F.ysIn)
  })

  it('foreH=1.2 时 yBrow 位置下移', () => {
    const F = buildFieldParams(testM, { foreH: 1.2 })
    // yBrow idx=2 in ysOut, should be larger
    expect(F.ysOut[2]).toBeGreaterThan(F.ysIn[2])
  })

  it('ysOut 严格单调', () => {
    const F = buildFieldParams(testM, { foreH: 1.3, noseH: 0.7 })
    for (let i = 1; i < F.ysOut.length; i++) {
      expect(F.ysOut[i]).toBeGreaterThan(F.ysOut[i - 1])
    }
  })
})

// ── evalField ──
describe('evalField', () => {
  it('默认参数（全 1/0）时，(x,y) 不变', () => {
    const F = buildFieldParams(testM, {})
    const [nx, ny] = evalField(0.5, 0.3, F, testM)
    expect(nx).toBeCloseTo(0.5, 3)
    expect(ny).toBeCloseTo(0.3, 3)
  })

  it('faceW < 1 时面部两侧向中线收窄', () => {
    const F = buildFieldParams(testM, { faceW: 0.9 })
    const [lx] = evalField(0.30, 0.4, F, testM)  // 左侧
    const [rx] = evalField(0.70, 0.4, F, testM)  // 右侧
    expect(lx).toBeGreaterThan(0.30) // 左点向右移
    expect(rx).toBeLessThan(0.70)    // 右点向左移
  })

  it('jaw > 1 时下颌两侧向外放宽', () => {
    const F = buildFieldParams(testM, { jaw: 1.1 })
    const [lx] = evalField(0.35, 0.65, F, testM) // 下颌区域
    const [rx] = evalField(0.65, 0.65, F, testM)
    // midX=0.5, lx<0.5→dp<0→向左扩大; rx>0.5→dp>0→向右扩大
    expect(lx).toBeLessThan(0.35)
    expect(rx).toBeGreaterThan(0.65)
  })

  it('eye 眼距正值为外扩', () => {
    const F = buildFieldParams(testM, { eye: 0.1 })
    // 左虹膜(0.40,0.26) 左移（远离中线），右虹膜(0.60,0.26) 右移
    const [tlx] = evalField(0.40, 0.26, F, testM)
    const [trx] = evalField(0.60, 0.26, F, testM)
    expect(tlx).toBeLessThan(0.40)
    expect(trx).toBeGreaterThan(0.60)
  })

  it('纵向 6 带参数调整时 y 在指定段内变化，首尾不变', () => {
    const F = buildFieldParams(testM, { noseH: 1.2 })
    // y=0.30 在鼻部带 [yEye(0.33)? wait...
    // Actually yEye=0.33, yNose=0.42. y=0.30 is in eye zone [22,33]
    // Let me check: yEye=0.33 is the boundary. y=0.36 is in nose zone [33,42]
    const [, ny1] = evalField(0.5, 0.36, F, testM)
    expect(ny1).toBeGreaterThan(0.36) // 鼻部拉伸
    const [, ny2] = evalField(0.5, 0.0, F, testM)
    expect(ny2).toBeCloseTo(0, 3) // 首部不变
    const [, ny3] = evalField(0.5, 1.0, F, testM)
    expect(ny3).toBeCloseTo(1, 3) // 尾部不变
  })
})

// ── localGauss2D 紧支撑 ──
describe('localGauss2D', () => {
  it('中心点权重为 1', () => {
    expect(localGauss2D(0.5, 0.5, 0.5, 0.5, 0.05)).toBe(1)
  })
  it('2.4σ 半径外精确为 0（普通高斯尾部无限，这里是局部性的关键）', () => {
    const sigma = 0.05
    const R = sigma * 2.4
    expect(localGauss2D(0.5 + R * 1.01, 0.5, 0.5, 0.5, sigma)).toBe(0)
    expect(localGauss2D(0.5, 0.5 - R * 2, 0.5, 0.5, sigma)).toBe(0)
  })
  it('1.5σ 内仍有显著权重（核心区域正常作用）', () => {
    expect(localGauss2D(0.55, 0.5, 0.5, 0.5, 0.05)).toBeGreaterThan(0.2)
  })
})

// ── 局部性：五官精调尽量不影响其它区域 ──
describe('evalField 局部性（减少跨区域联动）', () => {
  /** 断言一组归一化坐标在给定参数下基本不动（|位移| < 1e-4） */
  function expectUnmoved(F: FieldParams, M: FaceMeasure, points: Array<[number, number]>) {
    for (const [x, y] of points) {
      const [nx, ny] = evalField(x, y, F, M)
      expect(Math.abs(nx - x)).toBeLessThan(1e-4)
      expect(Math.abs(ny - y)).toBeLessThan(1e-4)
    }
  }

  // 测试人脸（baseLM）的各区域代表点（归一化）
  const glabella = [0.50, 0.22] as [number, number]   // 眉心
  const noseBridge = [0.50, 0.24] as [number, number] // 鼻梁顶
  const noseTip = [0.50, 0.40] as [number, number]    // 鼻尖
  const philtrum = [0.50, 0.44] as [number, number]   // 人中
  const upperLip = [0.50, 0.46] as [number, number]   // 上唇顶
  const mouthCornerL = [0.42, 0.48] as [number, number] // 左嘴角
  const chin = [0.50, 0.60] as [number, number]       // 下巴
  const chinLow = [0.50, 0.54] as [number, number]    // 下唇外缘下方（下巴顶部）
  const noseAlar = [0.44, 0.42] as [number, number]   // 左鼻翼

  it('眼睛大小（eyeSize=1.4 最大档）：眉心/鼻梁/鼻尖/嘴/下巴全不动', () => {
    const F = buildFieldParams(testM, { eyeSize: 1.4 })
    expectUnmoved(F, testM, [glabella, noseBridge, noseTip, upperLip, mouthCornerL, chin, philtrum, noseAlar])
    // 眼睛区域本身仍有效果（眼外角被外推）
    const [ox, oy] = evalField(0.38, 0.27, F, testM)
    expect(ox).not.toBeCloseTo(0.38, 4)
    expect(oy).not.toBeCloseTo(0.27, 4)
  })

  it('眼角上扬（eyeTilt=0.25）：眉心/鼻梁/鼻尖/嘴/下巴全不动', () => {
    const F = buildFieldParams(testM, { eyeTilt: 0.25 })
    expectUnmoved(F, testM, [glabella, noseBridge, noseTip, upperLip, mouthCornerL, chin])
    // 眼外角仍上移
    const [, oy] = evalField(0.38, 0.27, F, testM)
    expect(oy).toBeLessThan(0.27)
  })

  it('眼睛拉长（eyeLen=1.2）：眉心/鼻梁/鼻尖/嘴/下巴全不动', () => {
    const F = buildFieldParams(testM, { eyeLen: 1.2 })
    expectUnmoved(F, testM, [glabella, noseBridge, noseTip, upperLip, mouthCornerL, chin])
  })

  it('鼻尖上翘（noseTipLift=0.02）：上唇/嘴角/鼻翼/人中全不动（原先会带飞嘴巴）', () => {
    const F = buildFieldParams(testM, { noseTipLift: 0.02 })
    expectUnmoved(F, testM, [upperLip, mouthCornerL, noseAlar, philtrum])
    // 鼻尖本身仍上翘
    const [, ny] = evalField(0.50, 0.40, F, testM)
    expect(ny).toBeLessThan(0.40)
  })

  it('鼻尖大小（noseTipSize=1.2）：上唇/嘴角/鼻翼不动', () => {
    const F = buildFieldParams(testM, { noseTipSize: 1.2 })
    expectUnmoved(F, testM, [upperLip, mouthCornerL, noseAlar])
    // 鼻尖下方仍扩张
    const [, ny] = evalField(0.50, 0.42, F, testM)
    expect(ny).toBeGreaterThan(0.42)
  })

  it('嘴唇厚薄（lip=1.6）：下巴/人中全不动，且上唇峰/下唇底对称移动（上唇峰不被钉死）', () => {
    const F = buildFieldParams(testM, { lip: 1.6 })
    expectUnmoved(F, testM, [chin, chinLow, philtrum])
    // 上唇峰（上唇顶）与下唇外缘对称移动，幅度相等
    const [, uy] = evalField(0.50, 0.46, F, testM)
    const [, ly2] = evalField(0.50, 0.52, F, testM)
    expect(uy).toBeLessThan(0.46)
    expect(ly2).toBeGreaterThan(0.52)
    expect(Math.abs(uy - 0.46)).toBeCloseTo(Math.abs(ly2 - 0.52), 3)
    // 唇缝基本不动
    const [, sy] = evalField(0.50, 0.49, F, testM)
    expect(Math.abs(sy - 0.49)).toBeLessThan(1e-4)
  })

  it('唇峰高低（cupidH=0.015）：上唇顶带整体上移（M 形弧度），鼻尖/人中/唇缝/下唇/嘴角全不动', () => {
    const F = buildFieldParams(testM, { cupidH: 0.015 })
    expectUnmoved(F, testM, [noseTip, philtrum, [0.44, 0.46], [0.50, 0.49]])
    // 唇峰（上唇顶中点）仍上移
    const [, ny] = evalField(0.50, 0.46, F, testM)
    expect(ny).toBeLessThan(0.46)
  })

  it('嘴角上扬（mouthCorner=0.02）：下巴/鼻尖/人中不动（原先会波及下巴）', () => {
    const F = buildFieldParams(testM, { mouthCorner: 0.02 })
    expectUnmoved(F, testM, [chin, chinLow, noseTip, philtrum])
    // 嘴角本身仍上移
    const [, my] = evalField(0.42, 0.48, F, testM)
    expect(my).toBeLessThan(0.48)
  })

  it('颧骨高低（cheekUp=0.02）：眼睛/鼻子/嘴全不动', () => {
    const F = buildFieldParams(testM, { cheekUp: 0.02 })
    expectUnmoved(F, testM, [[0.40, 0.26], noseTip, upperLip, mouthCornerL])
    // 颧骨点本身仍上移
    const [, cy] = evalField(0.24, 0.58, F, testM)
    expect(cy).toBeLessThan(0.58)
  })

  it('颧骨突起（cheekProject=0.25）：眼睛/鼻子/嘴/面中不动，且左右颧骨向外推（原先方向错乱）', () => {
    const F = buildFieldParams(testM, { cheekProject: 0.25 })
    expectUnmoved(F, testM, [[0.40, 0.26], noseTip, upperLip, mouthCornerL, [0.50, 0.58]])
    // 左颧骨向左（x 减小）、右颧骨向右（x 增大）
    const [lx] = evalField(0.24, 0.58, F, testM)
    expect(lx).toBeLessThan(0.24)
    const [rx] = evalField(0.76, 0.58, F, testM)
    expect(rx).toBeGreaterThan(0.76)
  })

  it('颧骨宽（cheekW=1.2）：眼睛/鼻子/嘴不动', () => {
    const F = buildFieldParams(testM, { cheekW: 1.2 })
    expectUnmoved(F, testM, [[0.40, 0.26], noseTip, upperLip, mouthCornerL])
  })
})
