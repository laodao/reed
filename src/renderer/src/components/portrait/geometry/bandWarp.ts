/**
 * 面容变形入口（规则网格位移场版）
 * @module portrait/geometry/bandWarp
 * @description 照搬 face-sculpt-demo 架构：
 *   warpFaceBands = measureFace（从关键点提取语义参数 M）
 *                + buildFieldParams（用户参数 + M → 位移场参数 F）
 *                + renderGridWarp（规则网格逐单元仿射纹理渲染）
 *   规则网格全覆盖整张图 → 无眼睛/嘴巴开口空洞，无边界三角。
 *   横向 smoothstep 衰减消除缩脸空隙（1.0×→1.9×半脸宽归零）。
 *   WarpParams 类型为本模块导出，displacementField / faceMeasure / gridWarp / paramPrompt 共用。
 */
import type { Point } from './faceMetrics'
import { measureFace } from './faceMeasure'
import { buildFieldParams, evalField } from './displacementField'
import type { FaceMeasure } from './faceMeasure'
import type { FieldParams } from './displacementField'
import { renderGridWarp } from './gridWarp'
import { renderMakeup, defaultMakeup } from './makeupRenderer'
import type { MakeupState } from './makeupRenderer'

/** 变形参数（23 个参数，4 组，照搬 face-sculpt-demo SLIDER_DEFS） */
export interface WarpParams {
  // ── 整体 ──
  faceW?: number          // 脸部整体宽度 0.80–1.20, 默认 1
  jaw?: number            // 下颌宽度 0.70–1.15, 默认 1
  eye?: number            // 眼距 -0.15–0.15, 默认 0

  // ── 纵向 6 带高度 ──
  foreH?: number          // 上庭 0.70–1.30, 默认 1
  eyeH?: number           // 眼部 0.70–1.30, 默认 1
  noseH?: number          // 鼻部 0.70–1.30, 默认 1
  philH?: number          // 人中 0.60–1.40, 默认 1
  mouthH?: number         // 嘴部 0.70–1.30, 默认 1
  chinH?: number          // 下巴 0.70–1.30, 默认 1

  // ── 横向 6 带宽度 ──
  bridgeW?: number        // 鼻梁宽 0.70–1.30, 默认 1
  alaW?: number           // 鼻翼宽 0.70–1.30, 默认 1
  philW?: number          // 人中宽 0.70–1.30, 默认 1
  mouthW?: number         // 嘴宽 0.75–1.30, 默认 1
  chinW?: number          // 下巴宽 0.70–1.30, 默认 1
  cheekW?: number         // 颧骨宽 0.85–1.20, 默认 1

  // ── 五官精调 ──
  eyeSize?: number        // 眼睛大小 0.70–1.40, 默认 1
  eyeTilt?: number        // 眼角上扬 -0.25–0.25, 默认 0
  eyeLen?: number         // 眼睛拉长 0.85–1.20, 默认 1
  noseTipLift?: number    // 鼻尖上翘 -0.01–0.01, 默认 0
  noseTipSize?: number    // 鼻尖大小 0.80–1.20, 默认 1
  lip?: number            // 嘴唇厚薄 0.60–1.60, 默认 1
  cupidH?: number         // 唇峰高低 -0.015–0.015, 默认 0
  mouthCorner?: number    // 嘴角上扬 -0.02–0.02, 默认 0
  cheekUp?: number        // 颧骨高低 -0.02–0.02, 默认 0
  cheekProject?: number   // 颧骨突起 -0.15–0.25, 默认 0
}

export interface WarpOptions {
  /** 降采样因子（0.25 = 1/4 分辨率）；预览用低值加速，保存用 1 全量 */
  scale?: number
  /** 妆容参数（在原图空间上妆后变形） */
  makeup?: MakeupState
}

/** 采样颜色（可注入，便于单测） */
export type PixelGetter = (x: number, y: number) => [number, number, number]

/**
 * 估计背景色：四角均值（可注入取色器）。
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
    r += pr; g += pg; b += pb
  }
  const n = corners.length
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

/**
 * 执行规则网格变形，返回新 canvas。
 * @param source 源图（img 或 canvas）
 * @param landmarks 关键点（归一化坐标 0-1，含可选 z）
 * @param params 变形参数
 * @param opts.scale 降采样（预览 0.25，保存 1，默认 1）
 */
export function warpFaceBands(
  source: HTMLImageElement | HTMLCanvasElement,
  landmarks: Point[],
  params: WarpParams,
  opts?: WarpOptions,
): HTMLCanvasElement {
  // 0. 将像素坐标关键点归一化到 0-1（measureFace/evalField 使用归一化坐标）
  const srcW = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const srcH = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const normLM = landmarks.map(p => ({ x: p.x / srcW, y: p.y / srcH, z: p.z }))
  // 1. 面部测量
  const M = measureFace(normLM)
  // 2. 构建位移场参数
  const F = buildFieldParams(M, params)

  // 3. 妆容前置：在原图空间合成妆容 → 作为变形纹理源
  let warpSource: HTMLImageElement | HTMLCanvasElement = source
  if (opts?.makeup) {
    const makeupCanvas = document.createElement('canvas')
    makeupCanvas.width = srcW; makeupCanvas.height = srcH
    const mctx = makeupCanvas.getContext('2d')!
    renderMakeup(mctx, source, normLM, srcW, srcH, opts.makeup)
    warpSource = makeupCanvas
  }

  // 4. 规则网格变形渲染
  return renderGridWarp(warpSource, M, F, {
    scale: opts?.scale ?? 1,
  })
}

/**
 * 关键点按变形参数变换（标注/指标同步）。保留 z。
 * 通过 evalField 计算每个关键点的变形后位置。
 */
export function transformLandmarks(landmarks: Point[], params: WarpParams): Point[] {
  const M = measureFace(landmarks)
  const F = buildFieldParams(M, params)
  return landmarks.map((p) => {
    const [nx, ny] = evalField(p.x, p.y, F, M)
    return { x: nx, y: ny, z: p.z }
  })
}
