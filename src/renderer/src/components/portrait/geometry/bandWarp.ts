/**
 * 纵向分段变形算法（纯函数部分）
 * @module portrait/geometry/bandWarp
 * @description 「压缩中带 + 下部分平移 + 底部背景色补齐」的分段变形。
 *              避免下脸拉伸失真（spec 2026-07-25 §F3 review 修正）。
 *              几何计算为纯函数可单测；canvas 合成层薄封装。
 */
import { LM_GLABELLA, LM_SUBNASALE, LM_CHIN_BOTTOM, LM_JAW_ANGLE_RIGHT, LM_JAW_ANGLE_LEFT, LM_RIGHT_EYE_OUTER, LM_RIGHT_EYE_INNER, LM_LEFT_EYE_OUTER, LM_LEFT_EYE_INNER } from './landmarkIndices'
import type { Point } from './faceMetrics'

/** 变形参数（比例，-1 ~ 1；如 -0.06 = 缩短 6%） */
export interface WarpParams {
  midface?: number      // 中庭
  lowerface?: number    // 下庭
  faceLength?: number   // 脸长（眉心以下整体）
  jaw?: number          // 下颌宽（横向）
  eyeSpacing?: number   // 眼距（横向）
}

/** 一条水平带：源区域 → 目标区域 */
export interface Band {
  srcY: number
  srcH: number
  dstY: number
  dstH: number
}

export interface BandLayout {
  bands: Band[]
  /** 底部补色区（可能为 null = 无缺口） */
  gap: { dstY: number; dstH: number } | null
  /** 内容总长（变形后） */
  contentHeight: number
}

/**
 * 计算纵向分段布局（几何核心，纯函数）。
 * 以眉心/鼻底/颏底为分界：
 * - midface：压缩/拉伸 眉心-鼻底 带，鼻底以下整体平移
 * - lowerface：压缩/拉伸 鼻底-颏底 带，颏底以下整体平移
 * - faceLength：眉心以下整体缩放（优先于单独两段；本期与两段互斥合并为总缩放）
 */
export function computeBandLayout(
  glabellaY: number,
  subnasaleY: number,
  imageHeight: number,
  params: WarpParams,
): BandLayout {
  const midScale = 1 + (params.faceLength ?? 0) + (params.midface ?? 0)
  const lowScale = 1 + (params.faceLength ?? 0) + (params.lowerface ?? 0)
  const midDstH = Math.max(1, (subnasaleY - glabellaY) * midScale)
  const lowDstH = Math.max(1, (imageHeight - subnasaleY) * lowScale)

  const bands: Band[] = [
    // 眉心以上：不动
    { srcY: 0, srcH: glabellaY, dstY: 0, dstH: glabellaY },
    // 中带：缩放
    { srcY: glabellaY, srcH: subnasaleY - glabellaY, dstY: glabellaY, dstH: midDstH },
    // 下部分：缩放 + 平移
    {
      srcY: subnasaleY,
      srcH: imageHeight - subnasaleY,
      dstY: glabellaY + midDstH,
      dstH: lowDstH,
    },
  ]

  const contentHeight = glabellaY + midDstH + lowDstH
  const gap = contentHeight < imageHeight
    ? { dstY: contentHeight, dstH: imageHeight - contentHeight }
    : null

  return { bands, gap, contentHeight }
}

/**
 * 关键点 y 坐标按布局变换（用于变形后标注同步）。
 */
export function transformPointY(
  y: number,
  glabellaY: number,
  subnasaleY: number,
  params: WarpParams,
): number {
  const midScale = 1 + (params.faceLength ?? 0) + (params.midface ?? 0)
  const lowScale = 1 + (params.faceLength ?? 0) + (params.lowerface ?? 0)
  if (y < glabellaY) return y
  if (y < subnasaleY) {
    return glabellaY + (y - glabellaY) * midScale
  }
  const midDstH = (subnasaleY - glabellaY) * midScale
  return glabellaY + midDstH + (y - subnasaleY) * lowScale
}

/** 下颌带水平缩放几何（纯函数）：围绕面中心 cx 缩放，返回目标矩形 */
export function jawBandDst(
  cx: number,
  imageWidth: number,
  jaw: number,
): { dstX: number; dstW: number } {
  const scale = 1 + jaw
  const dstW = imageWidth * scale
  return { dstX: cx - dstW / 2, dstW }
}

/** 眼距位移量（纯函数）：eyeSpacing 比例 × 眼裂宽 */
export function eyeShiftDx(eyeSpacing: number, eyeWidth: number): number {
  return eyeSpacing * eyeWidth
}

/**
 * 眼部区域（含边距）用于位移。
 */
export interface EyeRegion {
  x: number
  y: number
  w: number
  h: number
}

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

/**
 * 横向变形合成（在纵向变形结果之上）：
 * - 下颌：下颌带围绕面中心水平缩放，让出区域用背景色填充
 * - 眼距：双眼区域水平位移，让出区域用邻域肤色均值填充
 */
export function applyHorizontalWarp(
  warped: HTMLCanvasElement,
  landmarks: Point[],
  params: WarpParams,
  bgColor: [number, number, number],
): HTMLCanvasElement {
  const jaw = params.jaw ?? 0
  const eyeSpacing = params.eyeSpacing ?? 0
  if (jaw === 0 && eyeSpacing === 0) return warped

  const W = warped.width
  const H = warped.height
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const ctx = out.getContext('2d')!

  // 底图：先铺背景色（下颌压缩让出的两侧区域），再整体画回
  ctx.fillStyle = `rgb(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]})`
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(warped, 0, 0)

  // ---- 下颌宽 ----
  if (jaw !== 0) {
    const jawTopY = (landmarks[LM_JAW_ANGLE_RIGHT].y + landmarks[LM_JAW_ANGLE_LEFT].y) / 2
    const chinY = landmarks[LM_CHIN_BOTTOM].y
    const cx = landmarks[LM_GLABELLA].x
    const { dstX, dstW } = jawBandDst(cx, W, jaw)
    const bandH = chinY - jawTopY
    if (bandH > 0) {
      // 先恢复该带背景色，再画缩放后的下颌带
      ctx.fillRect(0, jawTopY, W, bandH)
      ctx.drawImage(warped, 0, jawTopY, W, bandH, dstX, jawTopY, dstW, bandH)
    }
  }

  // ---- 眼距 ----
  if (eyeSpacing !== 0) {
    const { right, left, eyeWidth } = computeEyeRegions(landmarks)
    const dx = eyeShiftDx(eyeSpacing, eyeWidth)

    // 邻域肤色均值（取眼区上缘一条带的均值作为填补色）
    const skin = sampleSkinTone(warped, right, left)
    ctx.fillStyle = skin

    // 右脸（图左）眼睛向 -dx 移，左脸（图右）向 +dx 移
    ctx.fillRect(right.x, right.y, right.w, right.h)
    ctx.fillRect(left.x, left.y, left.w, left.h)
    ctx.drawImage(warped, right.x, right.y, right.w, right.h, right.x - dx, right.y, right.w, right.h)
    ctx.drawImage(warped, left.x, left.y, left.w, left.h, left.x + dx, left.y, left.w, left.h)
  }

  return out
}

/** 邻域肤色估计：两眼区上缘像素均值 */
function sampleSkinTone(
  canvas: HTMLCanvasElement,
  right: EyeRegion,
  left: EyeRegion,
): string {
  const ctx = canvas.getContext('2d')!
  let r = 0, g = 0, b = 0, n = 0
  const sample = (x: number, y: number) => {
    const d = ctx.getImageData(Math.max(0, Math.min(canvas.width - 1, Math.round(x))), Math.max(0, Math.min(canvas.height - 1, Math.round(y))), 1, 1).data
    r += d[0]; g += d[1]; b += d[2]; n++
  }
  for (let i = 0; i <= 6; i++) {
    sample(right.x + (right.w * i) / 6, right.y - 2)
    sample(left.x + (left.w * i) / 6, left.y - 2)
    sample(right.x + (right.w * i) / 6, right.y + right.h + 2)
    sample(left.x + (left.w * i) / 6, left.y + left.h + 2)
  }
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`
}

/** 采样颜色（可注入，便于单测） */
export type PixelGetter = (x: number, y: number) => [number, number, number]

/**
 * 估计背景色：四角 8×8 块均值（可注入取色器）。
 */
export function estimateBackgroundColor(
  getPixel: PixelGetter,
  width: number,
  height: number,
): [number, number, number] {
  const corners: [number, number][] = [
    [4, 4],
    [width - 5, 4],
    [4, height - 5],
    [width - 5, height - 5],
  ]
  let r = 0, g = 0, b = 0
  for (const [x, y] of corners) {
    const [pr, pg, pb] = getPixel(x, y)
    r += pr
    g += pg
    b += pb
  }
  const n = corners.length
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

// ==================== canvas 合成层 ====================

/**
 * 执行分段变形，返回新 canvas。
 * @param source 源图（img 或 canvas）
 * @param landmarks 关键点（像素坐标）
 * @param params 变形参数
 * @param bgColor 底部补色（缺省调 estimateBackgroundColor）
 */
export function warpFaceBands(
  source: HTMLImageElement | HTMLCanvasElement,
  landmarks: Point[],
  params: WarpParams,
  bgColor?: [number, number, number],
): HTMLCanvasElement {
  const srcW = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const srcH = source instanceof HTMLImageElement ? source.naturalHeight : source.height

  const glabellaY = landmarks[LM_GLABELLA].y
  const subnasaleY = landmarks[LM_SUBNASALE].y

  const layout = computeBandLayout(glabellaY, subnasaleY, srcH, params)

  // 背景色
  let bg = bgColor
  if (!bg) {
    const probe = document.createElement('canvas')
    probe.width = srcW
    probe.height = srcH
    const pctx = probe.getContext('2d')!
    pctx.drawImage(source, 0, 0)
    bg = estimateBackgroundColor((x, y) => {
      const d = pctx.getImageData(x, y, 1, 1).data
      return [d[0], d[1], d[2]]
    }, srcW, srcH)
  }

  const out = document.createElement('canvas')
  out.width = srcW
  out.height = srcH
  const ctx = out.getContext('2d')!

  // 先铺背景色（gap 区自然同色）
  ctx.fillStyle = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`
  ctx.fillRect(0, 0, srcW, srcH)

  // 逐带合成（纵向）
  for (const band of layout.bands) {
    ctx.drawImage(
      source,
      0, band.srcY, srcW, band.srcH,
      0, band.dstY, srcW, band.dstH,
    )
  }

  // 横向（下颌宽 / 眼距）
  return applyHorizontalWarp(out, landmarks, params, bg)
}

/**
 * 关键点整体按参数变换（标注同步）。
 */
export function transformLandmarks(landmarks: Point[], params: WarpParams): Point[] {
  const glabellaY = landmarks[LM_GLABELLA].y
  const subnasaleY = landmarks[LM_SUBNASALE].y
  return landmarks.map(p => ({
    x: p.x,
    y: transformPointY(p.y, glabellaY, subnasaleY, params),
  }))
}
