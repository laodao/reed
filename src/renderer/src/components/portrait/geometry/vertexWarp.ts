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
  LM_FOREHEAD_TOP,
  LM_NOSE_BRIDGE_197,
  LM_UPPER_LIP_MID,
  LM_LOWER_LIP_MID,
  FOREHEAD_EXTRAPOLATION,
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

  // ---- 纵向（6 段分段线性缩放 + 位置连续；旧 3 段向后兼容）----
  //   优先使用新 6 段参数；当所有新参数为零时，回退到旧 faceLength/midface/lowerface。
  const hasNewVertical = (params.foreheadH ?? 0) !== 0 || (params.eyeAreaH ?? 0) !== 0
    || (params.noseH ?? 0) !== 0 || (params.philtrumH ?? 0) !== 0
    || (params.lipH ?? 0) !== 0 || (params.chinH ?? 0) !== 0
  const hasOldVertical = !hasNewVertical && (
    (params.midface ?? 0) !== 0 || (params.lowerface ?? 0) !== 0 || (params.faceLength ?? 0) !== 0
  )

  if (hasNewVertical) {
    const foreheadTop = landmarks[LM_FOREHEAD_TOP]
    const noseBridge = landmarks[LM_NOSE_BRIDGE_197]
    const upperLip = landmarks[LM_UPPER_LIP_MID]
    const lowerLip = landmarks[LM_LOWER_LIP_MID]

    const foreheadTopExtY = glabellaY - (glabellaY - foreheadTop.y) * FOREHEAD_EXTRAPOLATION
    const noseBridgeY = noseBridge.y
    const upperLipY = upperLip.y
    const lowerLipY = lowerLip.y

    // 7 段锚点（按 y 升序，首段覆盖 [0, foreheadTopExt) 比例 1；末段覆盖 [chinY,+∞) 刚性移位）
    const anchors = [0, foreheadTopExtY, glabellaY, noseBridgeY, subnasaleY, upperLipY, lowerLipY, chinY]
    const scales = [
      1,
      1 + (params.foreheadH ?? 0),
      1 + (params.eyeAreaH ?? 0),
      1 + (params.noseH ?? 0),
      1 + (params.philtrumH ?? 0),
      1 + (params.lipH ?? 0),
      1 + (params.chinH ?? 0),
    ]

    // 累积目标锚点（从 y=0 起；末段后图像下部刚性平移 dt）
    const srcH = scales.map((_, i) => anchors[i + 1] - anchors[i]) // 每段源高（末段不含∞）
    const dstH = srcH.map((h, i) => h * scales[i])
    const dstAnchor = [0]
    for (let i = 0; i < dstH.length; i++) {
      dstAnchor.push(dstAnchor[i] + dstH[i])
    }
    // dstAnchor[i] 对应 anchors[i] 在输出中的 y；dstAnchor[7] 是变形后 chinY

    for (let i = 0; i < n; i++) {
      const y = landmarks[i].y
      let ny = y
      if (y < anchors[1]) {
        ny = y // 上庭以上不变
      } else if (y < anchors[2]) {
        // 上庭
        ny = dstAnchor[1] + (y - anchors[1]) * scales[1]
      } else if (y < anchors[3]) {
        // 眼部
        ny = dstAnchor[2] + (y - anchors[2]) * scales[2]
      } else if (y < anchors[4]) {
        // 鼻部
        ny = dstAnchor[3] + (y - anchors[3]) * scales[3]
      } else if (y < anchors[5]) {
        // 人中
        ny = dstAnchor[4] + (y - anchors[4]) * scales[4]
      } else if (y < anchors[6]) {
        // 嘴唇
        ny = dstAnchor[5] + (y - anchors[5]) * scales[5]
      } else if (y < anchors[7]) {
        // 下巴
        ny = dstAnchor[6] + (y - anchors[6]) * scales[6]
      } else {
        // 下巴以下刚性平移
        ny = y + (dstAnchor[7] - anchors[7])
      }
      disp[i].dy = ny - y
    }
  } else if (hasOldVertical) {
    // 旧 3 段纵向（向后兼容），眼部保护带 [glabella, noseBridge197] scale=1
    const midScale = 1 + (params.faceLength ?? 0) + (params.midface ?? 0)
    const lowScale = 1 + (params.faceLength ?? 0) + (params.lowerface ?? 0)

    // 眼部保护带：眼睛不参与纵向缩放，保持原始大小
    const noseBridgeY = landmarks[LM_NOSE_BRIDGE_197].y
    const eyeSrcH = noseBridgeY - glabellaY      // 眼部带高度（不缩放）
    const noseSrcH = subnasaleY - noseBridgeY     // 鼻部高度（midScale）
    const noseDstH = noseSrcH * midScale          // 鼻部缩放后高度
    const lowSrcH = chinY - subnasaleY            // 下庭高度（lowScale）
    const lowDstH = lowSrcH * lowScale

    // 累积锚点（glabella 以上不动）
    const dstGlabella = glabellaY
    const dstNoseBridge = dstGlabella + eyeSrcH   // eye 带 scale=1
    const dstSubnasale = dstNoseBridge + noseDstH
    const dstChin = dstSubnasale + lowDstH

    for (let i = 0; i < n; i++) {
      const y = landmarks[i].y
      let ny = y
      if (y < glabellaY) {
        ny = y
      } else if (y < noseBridgeY) {
        // 眼部保护带——不缩放
        ny = y
      } else if (y < subnasaleY) {
        // 鼻部缩放
        ny = dstNoseBridge + (y - noseBridgeY) * midScale
      } else if (y < chinY) {
        // 下庭缩放
        ny = dstSubnasale + (y - subnasaleY) * lowScale
      } else {
        // chin 以下刚性平移
        ny = y + (dstChin - chinY)
      }
      disp[i].dy = ny - y
    }
  }

  // ---- 6 段横向宽度（每段独立，以 cx 为中心 smoothstep 缩放）----
  const hasNewWidth = (params.foreheadW ?? 0) !== 0 || (params.eyeAreaW ?? 0) !== 0
    || (params.noseW ?? 0) !== 0 || (params.philtrumW ?? 0) !== 0
    || (params.lipW ?? 0) !== 0 || (params.chinW ?? 0) !== 0
  if (hasNewWidth) {
    // 复用 6 段锚点（与纵向一致）
    const foreheadTop = landmarks[LM_FOREHEAD_TOP]
    const foreheadTopExtY = glabellaY - (glabellaY - foreheadTop.y) * FOREHEAD_EXTRAPOLATION
    const noseBridgeY = landmarks[LM_NOSE_BRIDGE_197].y
    const upperLipY = landmarks[LM_UPPER_LIP_MID].y
    const lowerLipY = landmarks[LM_LOWER_LIP_MID].y
    const segAnchors = [foreheadTopExtY, glabellaY, noseBridgeY, subnasaleY, upperLipY, lowerLipY, chinY]
    const segWidths = [
      params.foreheadW ?? 0,
      params.eyeAreaW ?? 0,
      params.noseW ?? 0,
      params.philtrumW ?? 0,
      params.lipW ?? 0,
      params.chinW ?? 0,
    ]

    for (let i = 0; i < n; i++) {
      const p = landmarks[i]
      // 确定顶点属于哪一段（y 上的）并计算 smoothstep 权重
      let w = 0, factor = 0
      for (let s = 0; s < segWidths.length; s++) {
        if (segWidths[s] === 0) continue
        const lo = s === 0 ? segAnchors[0] : segAnchors[s]
        const hi = segWidths.length === 1 ? segAnchors[segAnchors.length - 1] : segAnchors[s + 1] || segAnchors[segAnchors.length - 1]
        // 在段内为 1，段外为 0；段边界 smoothstep 过渡
        const fadeH = Math.max(2, (hi - lo) * 0.08) // 8% 的过渡区
        if (p.y < lo - fadeH || p.y > hi + fadeH) continue
        let sw: number
        if (p.y < lo) sw = 1 - smoothstep((lo - p.y) / fadeH)
        else if (p.y < lo + fadeH) sw = smoothstep((p.y - lo) / fadeH)
        else if (p.y < hi - fadeH) sw = 1
        else if (p.y < hi) sw = 1 - smoothstep((p.y - (hi - fadeH)) / fadeH)
        else sw = 0
        w = Math.max(w, sw)
        factor = segWidths[s]
      }
      if (w > 0 && factor !== 0) {
        disp[i].dx += (p.x - cx) * factor * w
      }
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
