/**
 * 面容变形（整图 mesh 变形版）
 * @module portrait/geometry/bandWarp
 * @description 478 关键点局部位移场 + 图像边界 mesh + 逐三角仿射纹理渲染：
 *   warpFaceBands = computeVertexDisplacements（468 脸点局部位移）
 *                 + renderWarpedMesh（468 脸点 + 40 边界点，924 三角整图变形）
 *   边界点 source==target（位移=0）-> 变形场从脸中心衰减到图像边缘为恒等 ->
 *   脸缩窄后脸侧像素连续内移覆盖让出区，无裂缝、无空隙、无双下巴、无边界硬边
 *   （照搬 ComfyUI_FaceProcessor boundary triangles 设计）。
 *   WarpParams 类型为本模块导出，vertexWarp / meshRenderer / paramPrompt 共用。
 */
import type { Point } from './faceMetrics'
import { computeVertexDisplacements, transformLandmarksByDisplacement } from './vertexWarp'
import { renderWarpedMesh } from './meshRenderer'

/** 变形参数（比例，-1 ~ 1；如 -0.06 = 缩短 6%） */
export interface WarpParams {
  // ---- 旧版 3 段参数（向后兼容，当 6 段参数全为 0 时生效） ----
  midface?: number      // 中庭
  lowerface?: number    // 下庭
  faceLength?: number   // 脸长（眉心以下整体）
  jaw?: number          // 下颌宽（横向）
  eyeSpacing?: number   // 眼距（横向）

  // ---- 新版 6 段纵向高度 ----
  foreheadH?: number    // 上庭高度 -0.15 ~ 0.15
  eyeAreaH?: number     // 眼部带高度 -0.10 ~ 0.10
  noseH?: number        // 鼻部高度 -0.10 ~ 0.10
  philtrumH?: number    // 人中高度 -0.15 ~ 0.15
  lipH?: number         // 嘴唇高度 -0.15 ~ 0.15
  chinH?: number        // 下巴高度 -0.15 ~ 0.15

  // ---- 新版 6 段横向宽度 ----
  foreheadW?: number    // 上庭宽度 -0.10 ~ 0.10
  eyeAreaW?: number     // 眼部带宽度 -0.08 ~ 0.08
  noseW?: number        // 鼻部宽度 -0.15 ~ 0.15
  philtrumW?: number    // 人中宽度 -0.10 ~ 0.10
  lipW?: number         // 嘴唇宽度 -0.15 ~ 0.15
  chinW?: number        // 下巴宽度 -0.15 ~ 0.15
}

export interface WarpOptions {
  /** 降采样因子（0.25 = 1/4 分辨率）；预览用低值加速，保存用 1 全量 */
  scale?: number
}

/** 采样颜色（可注入，便于单测） */
export type PixelGetter = (x: number, y: number) => [number, number, number]

/**
 * 估计背景色：四角均值（可注入取色器）。
 * 整图变形后通常不需要（让出区被变形覆盖），保留供降级/兼容场景使用。
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

/**
 * 执行整图 mesh 变形，返回新 canvas。
 * @param source 源图（img 或 canvas）
 * @param landmarks 关键点（像素坐标，含可选 z；前 468 点参与 mesh）
 * @param params 变形参数
 * @param opts.scale 降采样（预览 0.25，保存 1，默认 1）
 */
export function warpFaceBands(
  source: HTMLImageElement | HTMLCanvasElement,
  landmarks: Point[],
  params: WarpParams,
  opts?: WarpOptions,
): HTMLCanvasElement {
  // 468 脸点局部位移场（分段线性纵向 + 径向高斯横向，无整体缩放感）
  const displacements = computeVertexDisplacements(landmarks, params)

  // 整图变形渲染（脸三角 + 边界三角，边界点恒等）
  return renderWarpedMesh(source, landmarks, displacements, {
    scale: opts?.scale ?? 1,
  })
}

/**
 * 关键点按变形参数变换（标注/指标同步）。保留 z。
 */
export function transformLandmarks(landmarks: Point[], params: WarpParams): Point[] {
  return transformLandmarksByDisplacement(landmarks, params)
}
