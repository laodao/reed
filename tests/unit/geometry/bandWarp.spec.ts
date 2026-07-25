/**
 * bandWarp 单元测试
 * @see src/renderer/src/components/portrait/geometry/bandWarp.ts
 */
import { describe, expect, it } from 'vitest'
import {
  computeBandLayout,
  transformPointY,
  estimateBackgroundColor,
} from '@/components/portrait/geometry/bandWarp'

// 基准：眉心 y=100，鼻底 y=200，图高 1024
const G = 100
const N = 200
const H = 1024

describe('computeBandLayout', () => {
  it('中庭 -10%：中带压缩 10%，下部分上移，底部留补色区', () => {
    const l = computeBandLayout(G, N, H, { midface: -0.1 })
    // 带A 不动
    expect(l.bands[0]).toEqual({ srcY: 0, srcH: 100, dstY: 0, dstH: 100 })
    // 中带 100 → 90
    expect(l.bands[1].dstH).toBeCloseTo(90, 5)
    // 下部分：源不变、目标上移
    expect(l.bands[2].srcY).toBe(200)
    expect(l.bands[2].dstY).toBeCloseTo(190, 5)
    expect(l.bands[2].dstH).toBeCloseTo(824, 5)
    // 缺口 1024 - (100+90+824) = 10
    expect(l.gap).not.toBeNull()
    expect(l.gap!.dstH).toBeCloseTo(10, 5)
  })

  it('中庭 +10%：中带拉伸，下部分下移，无缺口', () => {
    const l = computeBandLayout(G, N, H, { midface: 0.1 })
    expect(l.bands[1].dstH).toBeCloseTo(110, 5)
    expect(l.bands[2].dstY).toBeCloseTo(210, 5)
    expect(l.gap).toBeNull()
  })

  it('下庭 -20%：下部分缩放，中带不动', () => {
    const l = computeBandLayout(G, N, H, { lowerface: -0.2 })
    expect(l.bands[1].dstH).toBeCloseTo(100, 5)
    expect(l.bands[2].dstH).toBeCloseTo(824 * 0.8, 5)
    expect(l.gap!.dstH).toBeCloseTo(H - (100 + 100 + 824 * 0.8), 4)
  })

  it('faceLength 与分段叠加（总缩放）', () => {
    const l = computeBandLayout(G, N, H, { faceLength: -0.1, midface: -0.05 })
    // 中带缩放 = 1 - 0.1 - 0.05 = 0.85
    expect(l.bands[1].dstH).toBeCloseTo(85, 5)
    // 下部分缩放 = 1 - 0.1 - 0 = 0.9（lowerface 未给）
    expect(l.bands[2].dstH).toBeCloseTo(824 * 0.9, 5)
  })
})

describe('transformPointY', () => {
  it('各区域关键点按布局变换', () => {
    const p = { midface: -0.1 }
    // 眉心以上：不变
    expect(transformPointY(50, G, N, p)).toBe(50)
    // 中带内：y=150 → 100 + 50*0.9 = 145
    expect(transformPointY(150, G, N, p)).toBeCloseTo(145, 5)
    // 下部分：y=200 → 100 + 90 = 190；y=600 → 190 + 400 = 590
    expect(transformPointY(200, G, N, p)).toBeCloseTo(190, 5)
    expect(transformPointY(600, G, N, p)).toBeCloseTo(590, 5)
  })
})

describe('estimateBackgroundColor', () => {
  it('四角均值', () => {
    const bg = estimateBackgroundColor(
      (x, y) => (x < 400 ? [200, 200, 200] : [220, 220, 220]),
      768,
      1024,
    )
    expect(bg).toEqual([210, 210, 210])
  })
})
