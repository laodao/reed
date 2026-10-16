/**
 * 逐三角仿射纹理渲染器（整图变形版）
 * @module portrait/geometry/meshRenderer
 * @description 把变形后的 mesh 用原图纹理逐三角仿射映射渲染回 2D canvas。
 *
 *   顶点 = 468 脸点（位移来自 displacements）+ 40 图像边界点（boundary triangles，
 *   source==target 位移=0，恒等锚点）。三角 = 852 脸三角 + 72 边界三角，共 924 三角
 *   覆盖整张图。边界点恒等 -> 变形场从脸中心衰减到图像边缘为 0 -> 整图连续变形，
 *   无让出区、无边界硬边、无双下巴（照搬 ComfyUI_FaceProcessor boundary triangles 设计）。
 *
 *   每个三角形：源 UV（原图坐标）-> 目标 2D（顶点 + 位移，缩放后），
 *   计算 2D 仿射矩阵，ctx.setTransform + ctx.clip(目标三角) + ctx.drawImage(原图)。
 *   顶点位移连续 -> 三角形共享顶点一致 -> 无内部裂缝。
 *
 *   降采样（opts.scale）加速预览。computeAffineTransform 为纯函数可单测。
 */
import { FACEMESH_TRIANGLES } from './faceMeshTopology'
import { createBoundaryMesh, BASE_VERTEX_COUNT } from './boundaryMesh'
import type { Point } from './faceMetrics'
import type { VertexDisplacement } from './vertexWarp'

export interface RenderOptions {
  /** 降采样因子（0.25 = 1/4 分辨率），默认 1（全量）。预览降采样加速，保存全量。 */
  scale?: number
}

/** 2D 仿射变换 6 参数 [a,b,c,d,e,f]，对应 ctx.setTransform：x'=a*x+c*y+e, y'=b*x+d*y+f */
export type AffineMatrix = [number, number, number, number, number, number]

/**
 * 计算源三角形 -> 目标三角形的 2D 仿射变换矩阵。
 * 三点共线（退化）返回单位变换，避免 NaN。
 */
export function computeAffineTransform(
  src: [Point, Point, Point],
  dst: [Point, Point, Point],
): AffineMatrix {
  const [s0, s1, s2] = src
  const [d0, d1, d2] = dst
  const a00 = s0.x, a01 = s0.y, a02 = 1
  const a10 = s1.x, a11 = s1.y, a12 = 1
  const a20 = s2.x, a21 = s2.y, a22 = 1
  const det = a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20)
  if (Math.abs(det) < 1e-10) return [1, 0, 0, 1, 0, 0]
  const invDet = 1 / det
  const b00 = (a11 * a22 - a12 * a21) * invDet
  const b01 = (a02 * a21 - a01 * a22) * invDet
  const b02 = (a01 * a12 - a02 * a11) * invDet
  const b10 = (a12 * a20 - a10 * a22) * invDet
  const b11 = (a00 * a22 - a02 * a20) * invDet
  const b12 = (a02 * a10 - a00 * a12) * invDet
  const b20 = (a10 * a21 - a11 * a20) * invDet
  const b21 = (a01 * a20 - a00 * a21) * invDet
  const b22 = (a00 * a11 - a01 * a10) * invDet
  const a = b00 * d0.x + b01 * d1.x + b02 * d2.x
  const c = b10 * d0.x + b11 * d1.x + b12 * d2.x
  const e = b20 * d0.x + b21 * d1.x + b22 * d2.x
  const b = b00 * d0.y + b01 * d1.y + b02 * d2.y
  const d = b10 * d0.y + b11 * d1.y + b12 * d2.y
  const f = b20 * d0.y + b21 * d1.y + b22 * d2.y
  return [a, b, c, d, e, f]
}

/**
 * 渲染变形 mesh 到 canvas（整图变形，单 canvas）。
 *
 * 顶点 = 468 脸点（位移来自 displacements）+ 40 边界点（位移=0，恒等锚点）。
 * 三角 = 852 脸三角 + 72 边界三角，覆盖整张图：脸变形从脸中心衰减到图像边缘为恒等，
 * 脸缩窄后脸侧像素连续内移覆盖让出区，无空隙、无双下巴、无边界硬边。
 *
 * @param source 源图（img 或 canvas）
 * @param landmarks 脸部关键点（像素坐标，前 468 点参与 mesh）
 * @param displacements 顶点位移场（与 landmarks 等长，仅前 468 点用于 mesh）
 * @param opts.scale 降采样（预览 0.25，保存 1，默认 1）
 */
export function renderWarpedMesh(
  source: HTMLImageElement | HTMLCanvasElement,
  landmarks: Point[],
  displacements: VertexDisplacement[],
  opts?: RenderOptions,
): HTMLCanvasElement {
  const srcW = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const srcH = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const scale = opts?.scale ?? 1

  const renderW = Math.max(1, Math.round(srcW * scale))
  const renderH = Math.max(1, Math.round(srcH * scale))

  // 边界 mesh（原图尺寸，边界点 source==target 位移=0）
  const boundary = createBoundaryMesh(srcW, srcH)

  // 合并顶点：前 468 脸点 + 40 边界点 = 508 顶点
  // 脸点 source = landmarks[i]，target = landmarks[i] + disp[i]
  // 边界点 source = target = boundary.points[k]（恒等）
  const faceVerts = landmarks.slice(0, BASE_VERTEX_COUNT)
  const faceDisp = displacements.slice(0, BASE_VERTEX_COUNT)
  const allSource: Point[] = [
    ...faceVerts,
    ...boundary.points,
  ]
  const allTarget: Point[] = [
    ...faceVerts.map((p, i) => ({
      x: p.x + (faceDisp[i]?.dx ?? 0),
      y: p.y + (faceDisp[i]?.dy ?? 0),
    })),
    ...boundary.points, // 边界点 target = source
  ]

  // 合并三角 + 渲染顺序：边界三角先画，脸三角后画。
  //   脸三角（MediaPipe 468 剖分）无缝覆盖整个面部，含眼睛/嘴巴等特征。
  //   边界三角源三角形覆盖额头/头发/下颌/背景等过渡区，当脸椭圆点位移时，
  //   其目标三角形会下侵/上侵到面部区域。若边界三角后画，会用过渡区纹理
  //   覆盖脸三角已画好的眼睛 -> 眼睛消失 bug。故边界先画、脸后画，确保
  //   面部特征始终由脸三角绘制，边界三角只负责脸外过渡区。
  const allTriangles: [number, number, number][] = [
    ...boundary.triangles,
    ...FACEMESH_TRIANGLES,
  ]

  // 单 canvas：原图做底 + 逐三角仿射 drawImage（整图变形）。
  //   原图底层处理 Face Mesh 固有开口（眼睛/嘴巴）——这些区域无三角覆盖，
  //   回退到原图内容，避免空白/透明。
  const out = document.createElement('canvas')
  out.width = renderW
  out.height = renderH
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 原图做底：填充三角覆盖不到的区域（眼裂、口腔等 Face Mesh 固有开口）
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, renderW, renderH)

  for (const [ai, bi, ci] of allTriangles) {
    if (ai >= allSource.length || bi >= allSource.length || ci >= allSource.length) continue
    const sa = allSource[ai], sb = allSource[bi], sc = allSource[ci]
    const ta = allTarget[ai], tb = allTarget[bi], tc = allTarget[ci]
    const sTri: [Point, Point, Point] = [sa, sb, sc]
    const dTri: [Point, Point, Point] = [
      { x: ta.x * scale, y: ta.y * scale },
      { x: tb.x * scale, y: tb.y * scale },
      { x: tc.x * scale, y: tc.y * scale },
    ]
    const [a, b, c, d, e, f] = computeAffineTransform(sTri, dTri)
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(dTri[0].x, dTri[0].y)
    ctx.lineTo(dTri[1].x, dTri[1].y)
    ctx.lineTo(dTri[2].x, dTri[2].y)
    ctx.closePath()
    ctx.clip()
    ctx.setTransform(a, b, c, d, e, f)
    ctx.drawImage(source, 0, 0)
    ctx.restore()
  }

  // scale<1 时放大回原尺寸（预览降采样后恢复原图分辨率）
  if (scale < 1) {
    const fullCanvas = document.createElement('canvas')
    fullCanvas.width = srcW
    fullCanvas.height = srcH
    const fctx = fullCanvas.getContext('2d')!
    fctx.imageSmoothingEnabled = true
    fctx.imageSmoothingQuality = 'high'
    fctx.drawImage(out, 0, 0, renderW, renderH, 0, 0, srcW, srcH)
    return fullCanvas
  }
  return out
}
