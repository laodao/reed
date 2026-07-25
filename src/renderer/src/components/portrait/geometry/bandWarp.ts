/**
 * 纵向分段变形算法（纯函数部分）
 * @module portrait/geometry/bandWarp
 * @description 「压缩中带 + 下部分平移 + 底部背景色补齐」的分段变形。
 *              避免下脸拉伸失真（spec 2026-07-25 §F3 review 修正）。
 *              几何计算为纯函数可单测；canvas 合成层薄封装。
 */
import { LM_GLABELLA, LM_SUBNASALE } from './landmarkIndices'
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

  // 横向参数（下颌/眼距）暂在一期并入：先在离屏 canvas 做横向局部处理（简化：
  // 一期先实现纵向三段变形；横向参数由 computeBandLayout 不变、合成层后续扩展）。
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

  // 逐带合成
  for (const band of layout.bands) {
    ctx.drawImage(
      source,
      0, band.srcY, srcW, band.srcH,
      0, band.dstY, srcW, band.dstH,
    )
  }

  return out
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
