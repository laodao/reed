/**
 * 3D 顶点位移场（纯函数核心）
 * @module portrait/geometry/vertexWarp
 * @description 由 WarpParams 计算 478 顶点的 {dx,dy} 位移：
 *   - 纵向（中庭/下庭/脸长）：分段线性缩放，位置连续（无裂缝）
 *   - 下颌宽：下颌带 y smoothstep 权重，围绕面中心 cx 沿 x 缩放
 *   - 眼距：径向高斯权重，左眼（图右）+dx / 右眼（图左）-dx
 *   顶点位移连续 -> 逐三角纹理渲染无裂缝（spec 2026-07-25-face-geometry-studio §F3 3D 重构）。
 *   几何为纯函数可单测；不依赖 canvas。
 */
import {
  LM_GLABELLA,
  LM_SUBNASALE,
  LM_CHIN_BOTTOM,
  LM_JAW_ANGLE_RIGHT,
  LM_JAW_ANGLE_LEFT,
  LM_RIGHT_EYE_OUTER,
  LM_RIGHT_EYE_INNER,
  LM_LEFT_EYE_OUTER,
  LM_LEFT_EYE_INNER,
} from './landmarkIndices'
import type { Point } from './faceMetrics'
import type { WarpParams } from './bandWarp'

export interface VertexDisplacement {
  dx: number
  dy: number
}

/** 眼部区域（含边距） */
export interface EyeRegion {
  x: number
  y: number
  w: number
  h: number
}

/** 计算双眼区域（含边距）与眼裂宽 */
export function computeEyeRegions(landmarks: Point[]): { right: EyeRegion; left: EyeRegion; eyeWidth: number } {
  const rOut = landmarks[LM_RIGHT_EYE_OUTER]
  const rIn = landmarks[LM_RIGHT_EYE_INNER]
  const lOut = landmarks[LM_LEFT_EYE_OUTER]
  const lIn = landmarks[LM_LEFT_EYE_INNER]
  const eyeWidth = (Math.hypot(rOut.x - rIn.x, rOut.y - rIn.y) + Math.hypot(lOut.x - lIn.x, lOut.y - lIn.y)) / 2
  const padX = eyeWidth * 0.25
  const padY = eyeWidth * 0.7

  const rightCx = (rOut.x + rIn.x) / 2
  const rightCy = (rOut.y + rIn.y) / 2
  const leftCx = (lOut.x + lIn.x) / 2
  const leftCy = (lOut.y + lIn.y) / 2

  const w = Math.max(Math.abs(rOut.x - rIn.x), eyeWidth) + padX * 2
  const h = padY * 2
  return {
    right: { x: rightCx - w / 2, y: rightCy - padY, w, h },
    left: { x: leftCx - w / 2, y: leftCy - padY, w, h },
    eyeWidth,
  }
}

/** smoothstep 平滑阶跃：t∈[0,1] -> [0,1]，边界导数为 0（保证连续衰减） */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

/**
 * 计算 478 顶点位移场（像素）。
 *
 * 纵向（midface/lowerface/faceLength）：分段线性缩放，分段边界位置连续
 *   （中带 dy = (y-glabellaY)*(midScale-1)；下带 dy = midDstH-midSrcH + (y-subnasaleY)*(lowScale-1)）。
 * 横向（jaw/eyeSpacing）：权重衰减，影响域外位移 → 0（边界连续）。
 *
 * @param landmarks 像素坐标关键点（含可选 z，本函数仅用 x/y）
 * @param params 变形参数
 * @returns 每个顶点的 {dx, dy} 位移（像素）
 */
export function computeVertexDisplacements(
  landmarks: Point[],
  params: WarpParams,
): VertexDisplacement[] {
  const n = landmarks.length
  const disp: VertexDisplacement[] = Array.from({ length: n }, () => ({ dx: 0, dy: 0 }))

  const glabella = landmarks[LM_GLABELLA]
  const subnasale = landmarks[LM_SUBNASALE]
  const chin = landmarks[LM_CHIN_BOTTOM]
  const jawAngleR = landmarks[LM_JAW_ANGLE_RIGHT]
  const jawAngleL = landmarks[LM_JAW_ANGLE_LEFT]
  const cx = glabella.x
  const glabellaY = glabella.y
  const subnasaleY = subnasale.y
  const chinY = chin.y

  // ---- 纵向（分段线性缩放，位置连续）----
  const midScale = 1 + (params.faceLength ?? 0) + (params.midface ?? 0)
  const lowScale = 1 + (params.faceLength ?? 0) + (params.lowerface ?? 0)
  const hasVertical = (params.midface ?? 0) !== 0 || (params.lowerface ?? 0) !== 0 || (params.faceLength ?? 0) !== 0
  if (hasVertical) {
    const midSrcH = subnasaleY - glabellaY
    const midDstH = midSrcH * midScale
    for (let i = 0; i < n; i++) {
      const y = landmarks[i].y
      let ny = y
      if (y < glabellaY) {
        ny = y
      } else if (y < subnasaleY) {
        ny = glabellaY + (y - glabellaY) * midScale
      } else {
        ny = glabellaY + midDstH + (y - subnasaleY) * lowScale
      }
      disp[i].dy = ny - y
    }
  }

  // ---- 下颌宽（下颌带内 weight=1，向上 smoothstep 衰减到 0，围绕 cx 沿 x 缩放）----
  // 下颌带内（含下颌角）全变形；向上衰减到中脸不动（边界连续）。
  // 让出区（jaw<0 两侧露出）由渲染层 bgFillBands 填背景色处理。
  const jaw = params.jaw ?? 0
  if (jaw !== 0) {
    const jawTopY = (jawAngleR.y + jawAngleL.y) / 2
    const bandH = chinY - jawTopY
    if (bandH > 0) {
      const fadeH = bandH * 0.6 // 向上衰减区
      const fadeStart = jawTopY - fadeH
      for (let i = 0; i < n; i++) {
        const p = landmarks[i]
        let w: number
        if (p.y <= fadeStart) {
          w = 0 // 中脸不动
        } else if (p.y <= jawTopY) {
          w = smoothstep((p.y - fadeStart) / fadeH) // 向上衰减 0->1
        } else {
          w = 1 // 下颌带内全变形
        }
        disp[i].dx += (p.x - cx) * jaw * w
      }
    }
  }

  // ---- 眼距（径向高斯权重，左眼 +dx / 右眼 -dx）----
  // 眼区中心权重 1，向外高斯衰减到 0（与未变形区连续）
  const eyeSpacing = params.eyeSpacing ?? 0
  if (eyeSpacing !== 0) {
    const { right, left, eyeWidth } = computeEyeRegions(landmarks)
    const dxAmount = eyeSpacing * eyeWidth
    const sigma = eyeWidth * 1.2
    const twoSigma2 = 2 * sigma * sigma
    const rightCx = right.x + right.w / 2
    const rightCy = right.y + right.h / 2
    const leftCx = left.x + left.w / 2
    const leftCy = left.y + left.h / 2
    for (let i = 0; i < n; i++) {
      const p = landmarks[i]
      const dr2 = (p.x - rightCx) ** 2 + (p.y - rightCy) ** 2
      const dl2 = (p.x - leftCx) ** 2 + (p.y - leftCy) ** 2
      const wr = Math.exp(-dr2 / twoSigma2)
      const wl = Math.exp(-dl2 / twoSigma2)
      // 右眼（图左）向 -dx，左眼（图右）向 +dx
      disp[i].dx += -dxAmount * wr + dxAmount * wl
    }
  }

  return disp
}

/** 关键点按位移场变换（标注/指标同步用），保留 z */
export function transformLandmarksByDisplacement(landmarks: Point[], params: WarpParams): Point[] {
  const disp = computeVertexDisplacements(landmarks, params)
  return landmarks.map((p, i) => ({
    x: p.x + disp[i].dx,
    y: p.y + disp[i].dy,
    z: p.z,
  }))
}
