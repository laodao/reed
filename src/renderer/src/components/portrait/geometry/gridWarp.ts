/**
 * 规则网格变形渲染（Canvas 2D 版，照搬 face-sculpt-demo 网格密度）
 * @module portrait/geometry/gridWarp
 * @description 120×150 规则网格（与 face-sculpt-demo 一致），每个 cell 拆 2 三角仿射 warp。
 *   网格全覆盖整图 → 无眼睛空洞、无边界三角。
 *   三角 clip 向外微扩 0.5px 防 Canvas 抗锯齿接缝。
 *   不画原图底——变形后三角形完全覆盖画布（网格全覆盖），避免鬼影。
 */
import type { Point } from './faceMetrics'
import type { FaceMeasure } from './faceMeasure'
import type { FieldParams } from './displacementField'
import { evalField } from './displacementField'
import { computeAffineTransform } from './meshRenderer'

export interface GridWarpOptions {
  scale?: number
}

/** face-sculpt-demo 基准网格：120×150（在 512px 宽 ≈ 4.3px/cell） */
const BASE_GW = 120, BASE_GH = 150, BASE_W = 512

/**
 * 规则网格变形渲染。
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

  // 网格密度：face-sculpt-demo 的 120×150 / 512px 基准，按渲染尺寸等比缩放
  const gw = Math.max(15, Math.round(BASE_GW * renderW / BASE_W))
  const gh = Math.max(15, Math.round(BASE_GH * renderH / (BASE_W * srcH / srcW)))
  const nx = gw + 1, ny = gh + 1

  // ── 计算网格变形后像素坐标 ──
  const srcVertices: Point[] = new Array(nx * ny)
  const dstVertices: Point[] = new Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = i / gw, v = j / gh, k = j * nx + i
      srcVertices[k] = { x: u * srcW, y: v * srcH }
      const [du, dv] = evalField(u, v, F, M)
      dstVertices[k] = { x: du * renderW, y: dv * renderH }
    }
  }

  // ── 渲染 ──
  const out = document.createElement('canvas')
  out.width = renderW; out.height = renderH
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 三角形全覆盖——不画背景避免鬼影
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
      renderCell(ctx, source, srcVertices, dstVertices, a, b, c, d)
    }
  }

  return out
}

/**
 * 渲染一个 cell 的两个三角形，clip 微扩 0.5px 防抗锯齿接缝。
 * 跳过退化三角（面积太小或未变形）。
 */
function renderCell(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  sv: Point[], dv: Point[],
  a: number, b: number, c: number, d: number,
): void {
  renderTri(ctx, source, sv[a], sv[b], sv[d], dv[a], dv[b], dv[d])
  renderTri(ctx, source, sv[a], sv[d], sv[c], dv[a], dv[d], dv[c])
}

/** 向外微扩顶点以消除接缝 */
function expandOutward(center: Point, vert: Point): Point {
  const dx = vert.x - center.x, dy = vert.y - center.y
  const len = Math.hypot(dx, dy) || 1
  const push = 0.6 // 向外扩 0.6px
  return { x: vert.x + (dx / len) * push, y: vert.y + (dy / len) * push }
}

function renderTri(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  sa: Point, sb: Point, sc: Point,
  da: Point, db: Point, dc: Point,
): void {
  const area = (db.x - da.x) * (dc.y - da.y) - (dc.x - da.x) * (db.y - da.y)
  if (Math.abs(area) < 0.5) return

  // 三角形中心（用于外扩方向）
  const cx = (da.x + db.x + dc.x) / 3, cy = (da.y + db.y + dc.y) / 3
  const center: Point = { x: cx, y: cy }
  const ea = expandOutward(center, da)
  const eb = expandOutward(center, db)
  const ec = expandOutward(center, dc)

  const [a, b, c, d, e, f] = computeAffineTransform([sa, sb, sc], [ea, eb, ec])
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(ea.x, ea.y); ctx.lineTo(eb.x, eb.y); ctx.lineTo(ec.x, ec.y)
  ctx.closePath()
  ctx.clip()
  ctx.setTransform(a, b, c, d, e, f)
  ctx.drawImage(source, 0, 0)
  ctx.restore()
}
