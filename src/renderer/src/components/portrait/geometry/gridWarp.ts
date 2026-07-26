/**
 * 规则网格变形渲染（Canvas 2D 版）
 * @module portrait/geometry/gridWarp
 * @description 照搬 face-sculpt-demo 的规则网格架构，逐单元仿射纹理渲染到 Canvas 2D。
 *   网格顶点通过 evalField 计算变形后位置，每个 cell 拆 2 三角仿射 warp。
 *   网格全覆盖整图（含面部外部）→ 无眼睛/嘴巴空洞、无边界三角。
 *   横向 smoothstep 衰减填缝。
 */
import type { Point } from './faceMetrics'
import type { FaceMeasure } from './faceMeasure'
import type { FieldParams } from './displacementField'
import { evalField } from './displacementField'
import { computeAffineTransform } from './meshRenderer'

export interface GridWarpOptions {
  /** 降采样因子（0.25 = 1/4 分辨率）；预览用低值加速，保存用 1 全量 */
  scale?: number
  /** 网格列数（默认按 ~16px/cell 自适应） */
  gridW?: number
  /** 网格行数 */
  gridH?: number
}

/**
 * 规则网格变形渲染。
 * @param source 源图（img 或 canvas）
 * @param M 面部测量（归一化坐标）
 * @param F 位移场参数
 * @param opts 选项
 */
export function renderGridWarp(
  source: HTMLImageElement | HTMLCanvasElement,
  M: FaceMeasure,
  F: FieldParams,
  opts?: GridWarpOptions,
): HTMLCanvasElement {
  const srcW = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const srcH = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const scale = opts?.scale ?? 1

  const renderW = Math.max(1, Math.round(srcW * scale))
  const renderH = Math.max(1, Math.round(srcH * scale))

  // 自适应网格密度：目标 ~16px/cell
  const gw = opts?.gridW ?? Math.max(10, Math.round(renderW / 16))
  const gh = opts?.gridH ?? Math.max(10, Math.round(renderH / 16))
  const nx = gw + 1, ny = gh + 1

  // ── 计算每个网格顶点的变形后像素坐标 ──
  // 源顶点（归一化 0-1）
  const srcVertices: Point[] = new Array(nx * ny)
  const dstVertices: Point[] = new Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = i / gw, v = j / gh
      const k = j * nx + i
      // 源位置（像素坐标）
      srcVertices[k] = { x: u * srcW, y: v * srcH }
      // 变形后的归一化坐标 → 像素坐标
      const [du, dv] = evalField(u, v, F, M)
      dstVertices[k] = { x: du * renderW, y: dv * renderH }
    }
  }

  // ── 逐 cell 仿射渲染 ──
  const out = document.createElement('canvas')
  out.width = renderW
  out.height = renderH
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 原图做底（cell 间可能有微小空隙）
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, renderW, renderH)

  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const a = j * nx + i
      const b = a + 1
      const c = a + nx
      const d = c + 1

      // 上半三角 (a, b, d)
      renderTriangle(ctx, source, srcVertices[a], srcVertices[b], srcVertices[d],
        dstVertices[a], dstVertices[b], dstVertices[d])

      // 下半三角 (a, d, c)
      renderTriangle(ctx, source, srcVertices[a], srcVertices[d], srcVertices[c],
        dstVertices[a], dstVertices[d], dstVertices[c])
    }
  }

  return out
}

/** 渲染单个仿射 warped 三角形 */
function renderTriangle(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  sa: Point, sb: Point, sc: Point,
  da: Point, db: Point, dc: Point,
): void {
  // 跳过退化三角形
  const area = (db.x - da.x) * (dc.y - da.y) - (dc.x - da.x) * (db.y - da.y)
  if (Math.abs(area) < 0.5) return

  const [a, b, c, d, e, f] = computeAffineTransform([sa, sb, sc], [da, db, dc])
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(da.x, da.y)
  ctx.lineTo(db.x, db.y)
  ctx.lineTo(dc.x, dc.y)
  ctx.closePath()
  ctx.clip()
  ctx.setTransform(a, b, c, d, e, f)
  ctx.drawImage(source, 0, 0)
  ctx.restore()
}
