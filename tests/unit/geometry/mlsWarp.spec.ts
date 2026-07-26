/**
 * mlsWarp 单元测试
 * @see src/renderer/src/components/portrait/geometry/mlsWarp.ts
 *
 * 测试 MLS Similarity 变形核心算法 + 控制点构建 + 积分测试。
 * 所有测试函数为纯函数，不依赖 DOM/canvas。
 */
import { describe, expect, it } from 'vitest'
import {
  buildControlPoints,
  mlsSimilarityDeform,
  computeMlsDisplacements,
  transformMlsLandmarks,
  MLS_ALPHA,
  MLS_EPSILON,
} from '@/components/portrait/geometry/mlsWarp'
import type { Point } from '@/components/portrait/geometry/faceMetrics'
import {
  LM_GLABELLA,
  LM_SUBNASALE,
  LM_CHIN_BOTTOM,
  LM_JAW_ANGLE_RIGHT,
  LM_JAW_ANGLE_LEFT,
  LM_ZYGOMA_RIGHT,
  LM_ZYGOMA_LEFT,
  LM_RIGHT_EYE_OUTER,
  LM_RIGHT_EYE_INNER,
  LM_LEFT_EYE_OUTER,
  LM_LEFT_EYE_INNER,
  LM_NOSE_ALAR_RIGHT,
  LM_NOSE_ALAR_LEFT,
} from '@/components/portrait/geometry/landmarkIndices'

// ---- 辅助函数 ----

/** 构造 478 点的 landmarks 数组，默认点位于 (300, 250) */
function makeLandmarks(over: Record<number, Point>): Point[] {
  return Array.from({ length: 478 }, (_, i) => over[i] ?? { x: 300, y: 250 })
}

/** 标准测试人脸：眉心(100) 鼻底(200) 颏底(400)，眼在 y≈90 */
const base = makeLandmarks({
  [LM_GLABELLA]: { x: 300, y: 100 },
  [LM_SUBNASALE]: { x: 300, y: 200 },
  [LM_CHIN_BOTTOM]: { x: 300, y: 400 },
  [LM_JAW_ANGLE_RIGHT]: { x: 220, y: 330 },
  [LM_JAW_ANGLE_LEFT]: { x: 380, y: 330 },
  [LM_ZYGOMA_RIGHT]: { x: 240, y: 250 },
  [LM_ZYGOMA_LEFT]: { x: 360, y: 250 },
  [LM_RIGHT_EYE_OUTER]: { x: 200, y: 90 },
  [LM_RIGHT_EYE_INNER]: { x: 250, y: 90 },
  [LM_LEFT_EYE_OUTER]: { x: 400, y: 90 },
  [LM_LEFT_EYE_INNER]: { x: 350, y: 90 },
  [LM_NOSE_ALAR_RIGHT]: { x: 260, y: 200 },
  [LM_NOSE_ALAR_LEFT]: { x: 340, y: 200 },
})

// ---- Group 1: mlsSimilarityDeform 核心算法 ----

describe('mlsSimilarityDeform', () => {
  // 简单的两个控制点：p0=(0,0)→q0=(0,0) 锚点, p1=(100,0)→q1=(100,0) 锚点
  const idSources: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]
  const idTargets: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]

  it('all-zero 参数返回原坐标（identity）', () => {
    const v: Point = { x: 50, y: 50 }
    const result = mlsSimilarityDeform(v, idSources, idTargets)
    expect(result.x).toBeCloseTo(50, 1)
    expect(result.y).toBeCloseTo(50, 1)
  })

  it('纯平移：所有顶点统一位移', () => {
    const sources: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    const targets: Point[] = [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ]
    // 顶点在控制点中间，应该也平移 (10, 10)
    const v: Point = { x: 50, y: 50 }
    const result = mlsSimilarityDeform(v, sources, targets)
    expect(result.x).toBeCloseTo(60, 1)
    expect(result.y).toBeCloseTo(60, 1)
  })

  it('顶点靠近控制点：位移接近该控制点位移', () => {
    const sources: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    const targets: Point[] = [
      { x: 0, y: 0 },
      { x: 120, y: 0 },  // 只有 p1 向右移 20
    ]
    // 顶点非常靠近 p1（不完全重合，避免浮点退化）
    const v: Point = { x: 100.01, y: 0.01 }
    const result = mlsSimilarityDeform(v, sources, targets)
    // 结果应接近 p1 的目标位置（MLS 单控制点主导时近似该点位移）
    expect(result.x).toBeCloseTo(120, -1) // tolerance 10
    expect(result.y).toBeCloseTo(0, -1)
  })

  it('两个控制点同向平移 → 顶点跟随平移', () => {
    // 1 个控制点无法定义相似变换（需要 ≥2 个 → 用两个做纯平移）
    const sources: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ]
    const targets: Point[] = [
      { x: 5, y: 5 },
      { x: 5, y: 105 },
    ]
    const v: Point = { x: 10, y: 0 }
    const result = mlsSimilarityDeform(v, sources, targets)
    // 纯平移 (5, 5)：所有顶点统一位移
    expect(result.x).toBeCloseTo(15, 0)
    expect(result.y).toBeCloseTo(5, 0)
  })

  it('退化情况：所有 source 相同 → 返回原坐标（mu_s=0）', () => {
    const sources: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]
    const targets: Point[] = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ]
    const v: Point = { x: 50, y: 50 }
    const result = mlsSimilarityDeform(v, sources, targets)
    // 退化 → 返回原坐标
    expect(result.x).toBeCloseTo(50, 0)
    expect(result.y).toBeCloseTo(50, 0)
  })

  it('远离控制点的顶点几乎不动', () => {
    // 控制点在原点附近，顶点在很远的地方
    const sources: Point[] = [{ x: 0, y: 0 }]
    const targets: Point[] = [{ x: 10, y: 0 }]
    const v: Point = { x: 10000, y: 0 }
    const result = mlsSimilarityDeform(v, sources, targets)
    // 远距离顶点应该接近原始位置
    expect(result.x).toBeCloseTo(10000, -1) // tolerance 10
    expect(result.y).toBeCloseTo(0, 0)
  })
})

// ---- Group 2: buildControlPoints 控制点构建 ----

describe('buildControlPoints', () => {
  // 标准人脸的 eyeWidth（眼裂宽 ≈ 50px）
  const eyeWidth = 50

  it('params=0 → 14 组 source==target', () => {
    const { sources, targets } = buildControlPoints(base, {}, eyeWidth)
    expect(sources.length).toBe(14)
    expect(targets.length).toBe(14)
    for (let i = 0; i < sources.length; i++) {
      expect(targets[i].x).toBe(sources[i].x)
      expect(targets[i].y).toBe(sources[i].y)
    }
  })

  it('jaw=0.1 → 下颌角点 x 向外移动，锚点不动', () => {
    const { sources, targets } = buildControlPoints(base, { jaw: 0.1 }, eyeWidth)
    // 4 个下颌相关控制点（2 个下颌角 + 2 个颧骨）的 target x 应有变化
    // 找到下颌角右的 source（base 中 LM_JAW_ANGLE_RIGHT = index 136, x=220)
    const jawRIdx = sources.findIndex(s => s.x === 220 && s.y === 330)
    expect(jawRIdx).not.toBe(-1)
    // jaw=0.1, cx=300, jawRx=220 → dx = 0.1*(220-300) = -8（向右移动）
    expect(targets[jawRIdx].x).toBeCloseTo(220 + 0.1 * (220 - 300), 0)

    // 锚点（glabella）应该不动
    const glabellaIdx = sources.findIndex(s => s.x === 300 && s.y === 100)
    expect(glabellaIdx).not.toBe(-1)
    expect(targets[glabellaIdx].x).toBe(300)
    expect(targets[glabellaIdx].y).toBe(100)
  })

  it('faceLength=-0.06 → 颏底 dy<0（向上移动），锚点不动', () => {
    const { sources, targets } = buildControlPoints(base, { faceLength: -0.06 }, eyeWidth)
    // chin bottom: base[152] = (300, 400)
    const chinIdx = sources.findIndex(s => s.x === 300 && s.y === 400)
    expect(chinIdx).not.toBe(-1)
    // dy = faceLength * (chinY - subnasaleY) = -0.06 * (400-200) = -12
    expect(targets[chinIdx].y).toBeCloseTo(400 - 12, 0)

    // subnasale 锚点不动
    const subIdx = sources.findIndex(s => s.x === 300 && s.y === 200)
    expect(subIdx).not.toBe(-1)
    expect(targets[subIdx].y).toBe(200)
  })

  it('eyeSpacing=0.08 → 眼点 x 变化，颏底不动', () => {
    const { sources, targets } = buildControlPoints(base, { eyeSpacing: 0.08 }, eyeWidth)
    // 左眼外角 (400, 90)：dx = eyeSpacing*eyeWidth = 0.08*50 = 4
    const leftOuterIdx = sources.findIndex(s => s.x === 400 && s.y === 90)
    expect(leftOuterIdx).not.toBe(-1)
    expect(targets[leftOuterIdx].x).toBeCloseTo(404, 0)

    // 颏底不动
    const chinIdx = sources.findIndex(s => s.x === 300 && s.y === 400)
    expect(targets[chinIdx].x).toBe(300)
    expect(targets[chinIdx].y).toBe(400)
  })

  it('lowerface=-0.05：颏底移动受 lowerface 影响', () => {
    const { sources, targets } = buildControlPoints(base, { lowerface: -0.05 }, eyeWidth)
    const chinIdx = sources.findIndex(s => s.x === 300 && s.y === 400)
    // dy = lowerface * (chinY - subnasaleY) = -0.05 * 200 = -10
    expect(targets[chinIdx].y).toBeCloseTo(390, 0)
  })
})

// ---- Group 3: computeMlsDisplacements 积分测试 ----

describe('computeMlsDisplacements', () => {
  it('all-zero params → 全零位移', () => {
    const disp = computeMlsDisplacements(base, {})
    expect(disp.length).toBe(478)
    for (let i = 0; i < disp.length; i++) {
      expect(disp[i].dx).toBe(0)
      expect(disp[i].dy).toBe(0)
    }
  })

  it('jaw=0.1 → 位移场非零且平滑', () => {
    const disp = computeMlsDisplacements(base, { jaw: 0.1 })
    // 下颌角应有水平位移（jaw angle right at x=220, cx=300, jaw=0.1 → dx ≈ (220-300)*0.1 = -8）
    const jawRDisp = disp[LM_JAW_ANGLE_RIGHT]
    expect(Math.abs(jawRDisp.dx)).toBeGreaterThan(1)

    // 锚点应该接近零位移
    const glabellaDisp = disp[LM_GLABELLA]
    expect(Math.abs(glabellaDisp.dx)).toBeLessThan(1)
    expect(Math.abs(glabellaDisp.dy)).toBeLessThan(1)
  })

  it('faceLength=-0.1 → 颏底 dy < 0（向上移动）', () => {
    const disp = computeMlsDisplacements(base, { faceLength: -0.1 })
    // 颏底应该向上移动
    expect(disp[LM_CHIN_BOTTOM].dy).toBeLessThan(0)
    // 眉心应该接近不动
    expect(Math.abs(disp[LM_GLABELLA].dy)).toBeLessThan(1)
  })

  it('位移场连续性：相邻顶点位移差有界', () => {
    const disp = computeMlsDisplacements(base, { jaw: 0.1, faceLength: -0.08 })
    // 检查 FaceOval 区域（轮廓顶点）相邻顶点的位移差
    // 用一组语义上相邻的索引做抽查
    const adjacentPairs: [number, number][] = [
      [10, 151],  // 额头相邻
      [152, 148], // 下巴相邻
      [136, 135], // 下颌角相邻
    ]
    for (const [a, b] of adjacentPairs) {
      const dxDiff = Math.abs(disp[a].dx - disp[b].dx)
      const dyDiff = Math.abs(disp[a].dy - disp[b].dy)
      // 相邻顶点位移差应该小于较大值（平滑过渡）
      expect(dxDiff).toBeLessThan(20)
      expect(dyDiff).toBeLessThan(20)
    }
  })

  it('eyeSpacing → 双眼对称反向移动', () => {
    const disp = computeMlsDisplacements(base, { eyeSpacing: 0.08 })
    // 右眼外角（33）应该向左移动（dx < 0），左眼外角（263）向右移动（dx > 0）
    expect(disp[LM_RIGHT_EYE_OUTER].dx).toBeLessThan(0)
    expect(disp[LM_LEFT_EYE_OUTER].dx).toBeGreaterThan(0)
    // 对称性：左右眼 |dx| 应接近
    expect(Math.abs(disp[LM_RIGHT_EYE_OUTER].dx + disp[LM_LEFT_EYE_OUTER].dx)).toBeLessThan(5)
  })
})

// ---- Group 4: transformMlsLandmarks ----

describe('transformMlsLandmarks', () => {
  it('保留 z 值', () => {
    const lms = base.slice()
    lms[LM_CHIN_BOTTOM] = { x: 300, y: 400, z: -0.1 }
    const out = transformMlsLandmarks(lms, { jaw: 0.1 })
    expect(out[LM_CHIN_BOTTOM].z).toBe(-0.1)
  })

  it('all-zero params → 返回原坐标', () => {
    const out = transformMlsLandmarks(base, {})
    expect(out[0].x).toBe(base[0].x)
    expect(out[0].y).toBe(base[0].y)
  })

  it('返回数组长度不变', () => {
    const out = transformMlsLandmarks(base, { faceLength: -0.08 })
    expect(out.length).toBe(478)
  })
})

import { computeVertexDisplacements as linearDispFn } from '@/components/portrait/geometry/vertexWarp'

// ---- Group 5: MLS 比线性位移产生更自然的变形（回归对比） ----

describe('MLS vs 线性位移对比', () => {
  it('相同参数下 MLS 位移场不同于线性位移场（非纯缩放）', () => {
    const mlsDisp = computeMlsDisplacements(base, { jaw: 0.1, faceLength: -0.08 })
    const linDisp = linearDispFn(base, { jaw: 0.1, faceLength: -0.08 })

    // 验证 MLS 不是简单的恒等映射（至少有一些顶点位移不同）
    let diffCount = 0
    for (let i = 0; i < 478; i++) {
      const dxDiff = Math.abs(mlsDisp[i].dx - linDisp[i].dx)
      const dyDiff = Math.abs(mlsDisp[i].dy - linDisp[i].dy)
      if (dxDiff > 0.5 || dyDiff > 0.5) diffCount++
    }
    // 至少有一些顶点的位移不同（MLS 不是简单线性）
    expect(diffCount).toBeGreaterThan(10)
  })
})
