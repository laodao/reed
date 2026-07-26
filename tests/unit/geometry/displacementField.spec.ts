/**
 * displacementField 单元测试
 * @see src/renderer/src/components/portrait/geometry/displacementField.ts
 */
import { describe, expect, it } from 'vitest'
import {
  clamp, smoothstep, piecewise,
  buildFieldParams, evalField,
} from '@/components/portrait/geometry/displacementField'
import { measureFace } from '@/components/portrait/geometry/faceMeasure'
import type { Point } from '@/components/portrait/geometry/faceMetrics'

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
  [168]: { x: 0.50, y: 0.24 }, [1]: { x: 0.50, y: 0.40 },
  [129]: { x: 0.44, y: 0.42 }, [358]: { x: 0.56, y: 0.42 },
  [13]:  { x: 0.50, y: 0.48 }, [61]: { x: 0.42, y: 0.48 },
  [291]: { x: 0.58, y: 0.48 },
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
