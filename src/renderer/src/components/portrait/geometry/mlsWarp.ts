/**
 * MLS (Moving Least Squares) 面容变形核心
 * @module portrait/geometry/mlsWarp
 * @description 用 MLS Similarity 变形替代线性位移计算，产生自然、平滑的非线性变形。
 *   Schaefer et al. 2006 "Image Deformation Using Moving Least Squares"
 *   纯函数实现，不依赖 canvas/DOM，可单测。
 *
 *   控制点驱动：
 *   - 锚点（glabella/subnasale/foreheadTop）：不动
 *   - 纵向（faceLength/lowerface）：chinBottom 垂直位移
 *   - 下颌宽（jaw）：jawAngle + zygoma 水平位移
 *   - 眼距（eyeSpacing）：眼角 + 鼻翼 水平位移
 *
 *   MLS 通过距离权重将控制点位移扩散为平滑的顶点位移场，
 *   Similarity 变换保持局部角度，避免线性缩放的"拉伸"感。
 */
import type { Point } from './faceMetrics'
import type { WarpParams } from './bandWarp'
import type { VertexDisplacement } from './vertexWarp'
import { computeEyeRegions } from './vertexWarp'
import {
  LM_GLABELLA,
  LM_SUBNASALE,
  LM_FOREHEAD_TOP,
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
} from './landmarkIndices'

/** MLS 权重衰减指数（1 = 距离平方反比） */
export const MLS_ALPHA = 1

/** 防止除零的小量 */
export const MLS_EPSILON = 1e-8

/** 控制点定义：索引 + 参数→目标位置映射 */
interface ControlPointDef {
  index: number
  /** 计算目标 x（参数 → dx 增量） */
  computeDx?: (landmarks: Point[], params: WarpParams, eyeWidth: number) => number
  /** 计算目标 y（参数 → dy 增量） */
  computeDy?: (landmarks: Point[], params: WarpParams, eyeWidth: number) => number
}

/**
 * 控制点配置表。
 * 锚点（computeDx/Dy 未定义）：target == source，不动。
 * 变形点：computeDx/Dy 返回增量（加到 source 上得 target）。
 */
const CONTROL_POINT_DEFS: ControlPointDef[] = [
  // ---- 锚点（不动）----
  { index: LM_GLABELLA },
  { index: LM_SUBNASALE },
  { index: LM_FOREHEAD_TOP },

  // ---- 纵向 ----
  {
    index: LM_CHIN_BOTTOM,
    computeDy: (landmarks, params) => {
      const chinY = landmarks[LM_CHIN_BOTTOM].y
      const subY = landmarks[LM_SUBNASALE].y
      const faceLen = params.faceLength ?? 0
      const low = params.lowerface ?? 0
      return (faceLen + low) * (chinY - subY)
    },
    computeDx: (landmarks, params) => {
      // 轻微耦合 jaw：下颌变窄时颏底也稍窄
      const jaw = params.jaw ?? 0
      const cx = landmarks[LM_GLABELLA].x
      const chinX = landmarks[LM_CHIN_BOTTOM].x
      return jaw * (chinX - cx) * 0.3
    },
  },

  // ---- 下颌宽 ----
  {
    index: LM_JAW_ANGLE_RIGHT,
    computeDx: (landmarks, params) => {
      const jaw = params.jaw ?? 0
      const cx = landmarks[LM_GLABELLA].x
      return jaw * (landmarks[LM_JAW_ANGLE_RIGHT].x - cx)
    },
  },
  {
    index: LM_JAW_ANGLE_LEFT,
    computeDx: (landmarks, params) => {
      const jaw = params.jaw ?? 0
      const cx = landmarks[LM_GLABELLA].x
      return jaw * (landmarks[LM_JAW_ANGLE_LEFT].x - cx)
    },
  },
  // 颧骨耦合（下颌窄 → 颧骨也微收）
  {
    index: LM_ZYGOMA_RIGHT,
    computeDx: (landmarks, params) => {
      const jaw = params.jaw ?? 0
      const cx = landmarks[LM_GLABELLA].x
      return 0.3 * jaw * (landmarks[LM_ZYGOMA_RIGHT].x - cx)
    },
  },
  {
    index: LM_ZYGOMA_LEFT,
    computeDx: (landmarks, params) => {
      const jaw = params.jaw ?? 0
      const cx = landmarks[LM_GLABELLA].x
      return 0.3 * jaw * (landmarks[LM_ZYGOMA_LEFT].x - cx)
    },
  },

  // ---- 眼距 ----
  {
    index: LM_RIGHT_EYE_OUTER,
    computeDx: (_l, params, eyeWidth) => -(params.eyeSpacing ?? 0) * eyeWidth,
  },
  {
    index: LM_RIGHT_EYE_INNER,
    computeDx: (_l, params, eyeWidth) => -(params.eyeSpacing ?? 0) * eyeWidth * 0.5,
  },
  {
    index: LM_LEFT_EYE_OUTER,
    computeDx: (_l, params, eyeWidth) => (params.eyeSpacing ?? 0) * eyeWidth,
  },
  {
    index: LM_LEFT_EYE_INNER,
    computeDx: (_l, params, eyeWidth) => (params.eyeSpacing ?? 0) * eyeWidth * 0.5,
  },
  // 鼻翼耦合（眼距变 → 鼻梁微调，更自然）
  {
    index: LM_NOSE_ALAR_RIGHT,
    computeDx: (_l, params, eyeWidth) => -(params.eyeSpacing ?? 0) * eyeWidth * 0.15,
  },
  {
    index: LM_NOSE_ALAR_LEFT,
    computeDx: (_l, params, eyeWidth) => (params.eyeSpacing ?? 0) * eyeWidth * 0.15,
  },
]

/**
 * 从 landmarks 和参数构建 MLS 控制点对 (sources → targets)。
 * @param landmarks 478 关键点（像素坐标）
 * @param params 变形参数
 * @param eyeWidth 眼裂宽（来自 computeEyeRegions）
 * @returns 控制点 source 和 target 数组
 */
export function buildControlPoints(
  landmarks: Point[],
  params: WarpParams,
  eyeWidth: number,
): { sources: Point[]; targets: Point[] } {
  const sources: Point[] = []
  const targets: Point[] = []

  for (const def of CONTROL_POINT_DEFS) {
    const src = landmarks[def.index]
    sources.push({ x: src.x, y: src.y })

    const dx = def.computeDx ? def.computeDx(landmarks, params, eyeWidth) : 0
    const dy = def.computeDy ? def.computeDy(landmarks, params, eyeWidth) : 0
    targets.push({ x: src.x + dx, y: src.y + dy })
  }

  return { sources, targets }
}

/**
 * MLS Similarity 变形：对单个顶点 v 计算变形后位置。
 * 纯函数，可单测。
 *
 * @param vertex 待变形顶点
 * @param sources 控制点源位置
 * @param targets 控制点目标位置
 * @param alpha 权重衰减指数（默认 MLS_ALPHA = 1）
 * @param epsilon 防除零（默认 MLS_EPSILON）
 * @returns 变形后位置
 */
export function mlsSimilarityDeform(
  vertex: Point,
  sources: Point[],
  targets: Point[],
  alpha: number = MLS_ALPHA,
  epsilon: number = MLS_EPSILON,
): Point {
  const k = sources.length
  if (k === 0) return { x: vertex.x, y: vertex.y }

  // 1. 计算权重 w_i = 1 / (|v - p_i|^(2α) + ε)
  const weights: number[] = new Array(k)
  let totalWeight = 0
  for (let i = 0; i < k; i++) {
    const dx = vertex.x - sources[i].x
    const dy = vertex.y - sources[i].y
    const dist2 = dx * dx + dy * dy
    const w = 1 / (Math.pow(dist2, alpha) + epsilon)
    weights[i] = w
    totalWeight += w
  }

  if (totalWeight === 0) return { x: vertex.x, y: vertex.y }

  // 2. 加权质心 p* 和 q*
  let pStarX = 0, pStarY = 0
  let qStarX = 0, qStarY = 0
  for (let i = 0; i < k; i++) {
    const w = weights[i] / totalWeight
    pStarX += w * sources[i].x
    pStarY += w * sources[i].y
    qStarX += w * targets[i].x
    qStarY += w * targets[i].y
  }

  // 3. 居中向量 p̂_i, q̂_i 并计算 μ_s
  let muS = 0
  for (let i = 0; i < k; i++) {
    const w = weights[i] / totalWeight
    const phatX = sources[i].x - pStarX
    const phatY = sources[i].y - pStarY
    muS += w * (phatX * phatX + phatY * phatY)
  }

  // 退化：所有控制点共位 → 返回原坐标
  if (muS < epsilon) return { x: vertex.x, y: vertex.y }

  // 4. 计算最优相似变换参数的分子
  const vHatX = vertex.x - pStarX
  const vHatY = vertex.y - pStarY
  let sumA = 0 // Σ w_i * (q̂_i · p̂_i)
  let sumB = 0 // Σ w_i * (q̂_i × p̂_i)_z = Σ w_i * (q̂_ix * p̂_iy - q̂_iy * p̂_ix)

  for (let i = 0; i < k; i++) {
    const w = weights[i] / totalWeight
    const phatX = sources[i].x - pStarX
    const phatY = sources[i].y - pStarY
    const qhatX = targets[i].x - qStarX
    const qhatY = targets[i].y - qStarY

    sumA += w * (qhatX * phatX + qhatY * phatY)      // dot
    sumB += w * (qhatX * phatY - qhatY * phatX)      // cross_z
  }

  const a = sumA / muS
  const b = sumB / muS

  // 5. 应用相似变换 f(v) = q* + [a, -b; b, a] * (v - p*)
  return {
    x: qStarX + a * vHatX - b * vHatY,
    y: qStarY + b * vHatX + a * vHatY,
  }
}

/**
 * 计算所有 478 顶点的 MLS 位移场。
 * 替代 vertexWarp.computeVertexDisplacements。
 *
 * @param landmarks 478 关键点（像素坐标）
 * @param params 变形参数
 * @returns 每个顶点的 {dx, dy} 位移
 */
export function computeMlsDisplacements(
  landmarks: Point[],
  params: WarpParams,
): VertexDisplacement[] {
  const n = landmarks.length
  const displacements: VertexDisplacement[] = Array.from({ length: n }, () => ({ dx: 0, dy: 0 }))

  // 所有参数为 0 → 快速返回全零位移
  const hasParams = Object.values(params).some(v => typeof v === 'number' && v !== 0)
  if (!hasParams) return displacements

  // 计算眼宽（眼距参数需要）
  const { eyeWidth } = computeEyeRegions(landmarks)

  // 构建控制点
  const { sources, targets } = buildControlPoints(landmarks, params, eyeWidth)

  // 检查是否有实际变形（所有 targets == sources 则跳过）
  let hasDeformation = false
  for (let i = 0; i < sources.length; i++) {
    if (targets[i].x !== sources[i].x || targets[i].y !== sources[i].y) {
      hasDeformation = true
      break
    }
  }
  if (!hasDeformation) return displacements

  // 对每个顶点计算 MLS 变形
  for (let i = 0; i < n; i++) {
    const deformed = mlsSimilarityDeform(landmarks[i], sources, targets)
    displacements[i] = {
      dx: deformed.x - landmarks[i].x,
      dy: deformed.y - landmarks[i].y,
    }
  }

  return displacements
}

/**
 * 关键点按 MLS 变形变换（标注/指标同步用），保留 z。
 * 替代 vertexWarp.transformLandmarksByDisplacement。
 */
export function transformMlsLandmarks(landmarks: Point[], params: WarpParams): Point[] {
  const disp = computeMlsDisplacements(landmarks, params)
  return landmarks.map((p, i) => ({
    x: p.x + disp[i].dx,
    y: p.y + disp[i].dy,
    z: p.z,
  }))
}
