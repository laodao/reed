/**
 * meshRenderer 单元测试（computeAffineTransform 纯函数）
 * @see src/renderer/src/components/portrait/geometry/meshRenderer.ts
 *
 * renderWarpedMesh 依赖 canvas DOM，由 CDP 实测覆盖（spec §8）。
 */
import { describe, expect, it } from 'vitest'
import { computeAffineTransform } from '@/components/portrait/geometry/meshRenderer'
import type { Point } from '@/components/portrait/geometry/faceMetrics'

describe('computeAffineTransform', () => {
  it('单位变换：src==dst 时 a=d=1, b=c=e=f=0', () => {
    const s: [Point, Point, Point] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    const m = computeAffineTransform(s, s)
    expect(m[0]).toBeCloseTo(1) // a
    expect(m[3]).toBeCloseTo(1) // d
    expect(m[1]).toBeCloseTo(0) // b
    expect(m[2]).toBeCloseTo(0) // c
    expect(m[4]).toBeCloseTo(0) // e
    expect(m[5]).toBeCloseTo(0) // f
  })

  it('纯平移：dst = src + (5,5)', () => {
    const s: [Point, Point, Point] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    const d: [Point, Point, Point] = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 5, y: 15 }]
    const m = computeAffineTransform(s, d)
    expect(m[0]).toBeCloseTo(1) // a
    expect(m[3]).toBeCloseTo(1) // d
    expect(m[4]).toBeCloseTo(5) // e
    expect(m[5]).toBeCloseTo(5) // f
  })

  it('纯缩放 2x：a=d=2', () => {
    const s: [Point, Point, Point] = [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 1, y: 3 }]
    const d: [Point, Point, Point] = [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 2, y: 6 }]
    const m = computeAffineTransform(s, d)
    expect(m[0]).toBeCloseTo(2) // a
    expect(m[3]).toBeCloseTo(2) // d
    expect(m[4]).toBeCloseTo(0) // e
    expect(m[5]).toBeCloseTo(0) // f
  })

  it('非平凡仿射：a=2, c=3, e=0（x 方向缩放+剪切）', () => {
    // src (1,0),(0,1),(-1,0) -> dst (2,0),(0,3),(-2,0)
    // x' = a*x + c*y + e: (1,0)->2 => a+e=2; (0,1)->0 => c+e=0; (-1,0)->-2 => -a+e=-2
    // 解: a=2, e=0, c=0? 但 dst (0,1)->(0,3) 是 y 方向。重算：
    // 实际 dst: (1,0)->(2,0), (0,1)->(0,3), (-1,0)->(-2,0)
    // x 方程: a*1+c*0+e=2; a*0+c*1+e=0; a*(-1)+c*0+e=-2 => a=2,e=0,c=0
    // y 方程: b*1+d*0+f=0; b*0+d*1+f=3; b*(-1)+d*0+f=0 => b=0,f=0,d=3
    const s: [Point, Point, Point] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
    const d: [Point, Point, Point] = [{ x: 2, y: 0 }, { x: 0, y: 3 }, { x: -2, y: 0 }]
    const m = computeAffineTransform(s, d)
    expect(m[0]).toBeCloseTo(2) // a
    expect(m[3]).toBeCloseTo(3) // d
    expect(m[4]).toBeCloseTo(0) // e
  })

  it('共线退化返回单位变换不崩溃', () => {
    const s: [Point, Point, Point] = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]
    const m = computeAffineTransform(s, s)
    expect(m).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('逆变换可逆：src->dst 后 dst->src 回到单位', () => {
    const s: [Point, Point, Point] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    const d: [Point, Point, Point] = [{ x: 5, y: 5 }, { x: 25, y: 8 }, { x: 3, y: 22 }]
    const m = computeAffineTransform(s, d)
    // 用 m 变换 src 第一点应得 dst 第一点：x'=a*sx+c*sy+e, y'=b*sx+d*sy+f
    const x0 = m[0] * s[0].x + m[2] * s[0].y + m[4]
    const y0 = m[1] * s[0].x + m[3] * s[0].y + m[5]
    expect(x0).toBeCloseTo(d[0].x, 6)
    expect(y0).toBeCloseTo(d[0].y, 6)
    // 第三点
    const x2 = m[0] * s[2].x + m[2] * s[2].y + m[4]
    const y2 = m[1] * s[2].x + m[3] * s[2].y + m[5]
    expect(x2).toBeCloseTo(d[2].x, 6)
    expect(y2).toBeCloseTo(d[2].y, 6)
  })
})
