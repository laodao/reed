/**
 * 妆容系统——在原图空间按关键点区域上妆（照搬 face-sculpt-demo makeup.js）
 * @module portrait/geometry/makeupRenderer
 * @description 妆容在"原图空间"合成到画布上 → 作为纹理交给网格变形。
 *   因为变形只移动网格顶点、UV 不变，所以妆容会随捏脸一起形变、始终贴合五官。
 *   分区定位全部用 MediaPipe 关键点多边形，无需额外分割模型。
 */

// ── MediaPipe FaceMesh 轮廓索引 ──

/** 外唇轮廓（20 点） */
const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]

/** 右眼上睑（图左，9 点） */
const EYE_UPPER_R = [33, 246, 161, 160, 159, 158, 157, 173, 133]
/** 左眼上睑（图右，9 点） */
const EYE_UPPER_L = [263, 466, 388, 387, 386, 385, 384, 398, 362]
/** 右眼下睑（9 点） */
const EYE_LOWER_R = [33, 7, 163, 144, 145, 153, 154, 155, 133]
/** 左眼下睑（9 点） */
const EYE_LOWER_L = [263, 249, 390, 373, 374, 380, 381, 382, 362]

/** 右眉（10 点） */
const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
/** 左眉（10 点） */
const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]

/** 脸椭圆（36 点）——用于皮肤区域 clip */
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
  379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

// ── 精调锚点 ──
const P = {
  cheekR: 50, cheekL: 280,        // 腮红中心
  eyeInnerR: 133, eyeInnerL: 362, // 用于估计眼宽
  noseTip: 1, alaR: 129, alaL: 358, noseTop: 168,
  cheekboneR: 116, cheekboneL: 345, chin: 152, cupid: 0,
  glabella: 9, foreheadTop: 10,
  irisL: 468, irisR: 473,
}

// ── 预制色号库 ──

export const PRESETS = {
  lip: [
    ['正红', '#c62828'], ['车厘子', '#8e1f2b'], ['枫叶红', '#b23a2e'], ['浆果红', '#9e2846'],
    ['豆沙', '#b06b63'], ['玫瑰豆沙', '#b25a63'], ['珊瑚橘', '#e5624d'], ['蜜桃橘', '#e57356'],
    ['南瓜色', '#c65a34'], ['砖红', '#a64d3a'], ['姨妈色', '#6f2b3a'], ['莓果紫', '#8e3b5c'],
    ['玫红', '#d13a72'], ['西柚粉', '#e26d7a'], ['樱花粉', '#e78a9a'], ['裸粉', '#cf8f86'],
    ['奶茶裸', '#bb857a'], ['复古玫', '#a95763'],
  ],
  blush: [
    ['蜜桃', '#f09a86'], ['珊瑚', '#ef7f6b'], ['玫粉', '#e87c95'], ['西柚', '#ee8574'],
    ['南瓜', '#e07a4e'], ['裸杏', '#e3a184'], ['樱花粉', '#f0a2b0'], ['莓果', '#c85f77'],
    ['奶橘', '#eea078'], ['玫瑰', '#d76f7e'], ['砖红腮', '#c76a52'], ['冷粉', '#e389a0'],
  ],
  brow: [
    ['自然黑', '#2b2320'], ['深棕', '#4a3728'], ['灰棕', '#5b5049'], ['浅棕', '#6f5340'],
    ['红棕', '#5e3a2c'], ['亚麻', '#8a6d52'],
  ],
  liner: [
    ['黑', '#1c1a1a'], ['棕黑', '#332822'], ['深棕', '#4a3324'], ['灰', '#4a464a'], ['藏青', '#2a3346'],
  ],
  foundation: [
    ['提亮', '#fdece0'], ['白皙', '#f7ded0'], ['自然', '#f2d2bd'], ['暖黄调', '#eecfa8'],
    ['冷白皮', '#f6e4dc'], ['小麦', '#d8b092'],
  ],
  contour: [
    ['自然（暖）', '#9c6a4a', '#fff3e2'],
    ['冷调（灰）', '#8a7261', '#f3f2ef'],
    ['深轮廓', '#7d4f36', '#fff1de'],
  ],
} as const

// ── 类型 ──

export type Point = { x: number; y: number; z?: number }

export interface MakeupState {
  foundation?: { tone: string | null; alpha: number; smooth: number }
  contour?: { shade: readonly [string, string, string] | null; alpha: number; parts: Record<string, boolean> }
  blush?: { color: string | null; alpha: number; pos: string }
  liner?: { color: string | null; alpha: number; style: string }
  brow?: { color: string | null; alpha: number }
  lip?: { color: string | null; alpha: number }
}

export const BLUSH_POS = [
  ['苹果肌', 'apple'], ['斜扫颧骨', 'sweep'], ['眼下卧蚕', 'undereye'], ['侧颊', 'side'],
] as const

export const LINER_STYLES = [
  ['自然', 'natural'], ['上扬', 'wing'], ['浓黑', 'bold'],
] as const

export const CONTOUR_PARTS = [
  ['鼻侧影', 'noseSide'], ['颧下影', 'cheekHollow'], ['下颌影', 'jaw'],
  ['高光·鼻梁', 'hlBridge'], ['高光·下巴', 'hlChin'], ['高光·额头', 'hlForehead'],
] as const

export const CONTOUR_DEFAULT: Record<string, boolean> = {
  noseSide: true, cheekHollow: true, jaw: false,
  hlBridge: true, hlChin: true, hlForehead: false,
}

export function defaultMakeup(): MakeupState {
  return {
    foundation: { tone: null, alpha: 1, smooth: 0 },
    contour: { shade: null, alpha: 0, parts: { ...CONTOUR_DEFAULT } },
    blush: { color: null, alpha: 0, pos: 'apple' },
    liner: { color: null, alpha: 0, style: 'natural' },
    brow: { color: null, alpha: 0 },
    lip: { color: null, alpha: 0 },
  }
}

// ── 画布工具 ──

function pathFromIndices(ctx: CanvasRenderingContext2D, lm: Point[], indices: number[], W: number, H: number): void {
  ctx.beginPath()
  indices.forEach((i, k) => {
    const p = lm[i]
    const x = p.x * W, y = p.y * H
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
  })
  ctx.closePath()
}

function eyeWidthPx(lm: Point[], W: number): number {
  // 关键：Math.max 下限必须包在 * W 之后。归一化 landmarks 差值通常 < 1，
  // 若写成 max(2, |差值|) * W，则 max(2, 0.16)=2，再 *W 恒等于 2W（与真实眼宽无关），
  // 导致眼线线宽≈2W*0.07（粗黑条）、腮红半径≈2W*0.95（覆盖全画布）。
  return Math.max(2, Math.abs(lm[P.eyeInnerR].x - lm[P.eyeInnerL].x) * W)
}

/** 皮肤区域：脸轮廓，额头顶部向上延伸（MediaPipe 顶点 10 在发际线以下） */
function skinPath(ctx: CanvasRenderingContext2D, lm: Point[], W: number, H: number): void {
  const y10 = lm[10].y, browY = lm[9].y
  const foreH = Math.max(0.001, browY - y10)
  const extend = foreH * 0.9
  ctx.beginPath()
  FACE_OVAL.forEach((i, k) => {
    const p = lm[i]
    const w = Math.min(1, Math.max(0, (browY - p.y) / foreH))
    const x = p.x * W, y = (p.y - extend * w) * H
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
  })
  ctx.closePath()
}

function reset(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'none'
}

// ── 各妆容层 ──

function foundation(ctx: CanvasRenderingContext2D, img: CanvasImageSource, lm: Point[], W: number, H: number, s: MakeupState['foundation']): void {
  if (!s || (!s.tone && !s.smooth)) return
  ctx.save()
  skinPath(ctx, lm, W, H); ctx.clip()
  if (s.smooth > 0) {
    ctx.globalAlpha = 0.55 * s.smooth
    ctx.filter = `blur(${2 + 5 * s.smooth}px)`
    ctx.drawImage(img, 0, 0, W, H)
    ctx.filter = 'none'
  }
  if (s.tone) {
    ctx.globalAlpha = 0.5 * (s.alpha ?? 1)
    ctx.globalCompositeOperation = 'soft-light'
    ctx.fillStyle = s.tone; ctx.fillRect(0, 0, W, H)
  }
  ctx.restore(); reset(ctx)
}

function contour(ctx: CanvasRenderingContext2D, lm: Point[], W: number, H: number, s: MakeupState['contour']): void {
  if (!s || !s.alpha || !s.shade) return
  const [, dark, light] = s.shade
  const parts = s.parts || CONTOUR_DEFAULT
  const eg = eyeWidthPx(lm, W)
  const L = (i: number) => lm[i]

  ctx.save()
  ctx.filter = `blur(${eg * 0.12}px)`; ctx.lineCap = 'round'; ctx.lineJoin = 'round'

  const stroke = (pts: Point[], w: number, color: string, op: number, mode: GlobalCompositeOperation) => {
    ctx.globalCompositeOperation = mode; ctx.globalAlpha = op * (s.alpha ?? 1)
    ctx.strokeStyle = color; ctx.lineWidth = w
    ctx.beginPath()
    pts.forEach((p, k) => k ? ctx.lineTo(p.x * W, p.y * H) : ctx.moveTo(p.x * W, p.y * H))
    ctx.stroke()
  }

  if (parts.noseSide) {
    stroke([L(P.noseTop), L(P.alaR)], eg * 0.16, dark, 0.35, 'multiply')
    stroke([L(P.noseTop), L(P.alaL)], eg * 0.16, dark, 0.35, 'multiply')
  }
  if (parts.cheekHollow) {
    stroke([L(P.cheekboneR), L(P.cheekR)], eg * 0.28, dark, 0.28, 'multiply')
    stroke([L(P.cheekboneL), L(P.cheekL)], eg * 0.28, dark, 0.28, 'multiply')
  }
  if (parts.jaw) {
    stroke([{ x: L(234).x, y: L(234).y }, L(P.chin)], eg * 0.3, dark, 0.25, 'multiply')
    stroke([{ x: L(454).x, y: L(454).y }, L(P.chin)], eg * 0.3, dark, 0.25, 'multiply')
  }
  if (parts.hlBridge) stroke([L(P.noseTop), L(P.noseTip)], eg * 0.14, light, 0.5, 'soft-light')
  if (parts.hlChin) stroke([L(P.chin), { x: L(P.chin).x, y: L(P.chin).y - 0.02 }], eg * 0.3, light, 0.4, 'soft-light')
  if (parts.hlForehead) stroke([{ x: L(10).x, y: L(9).y }, { x: L(10).x, y: L(10).y }], eg * 0.4, light, 0.35, 'soft-light')

  ctx.restore(); reset(ctx)
}

function blushSpots(lm: Point[], pos: string): { x: number; y: number; r: number }[] {
  const eg = Math.abs(lm[133].x - lm[362].x)
  if (pos === 'sweep') return [P.cheekboneR, P.cheekboneL].map(i => ({ x: lm[i].x, y: lm[i].y, r: 1.15 }))
  if (pos === 'undereye') return [P.irisL, P.irisR].map(i => ({ x: lm[i].x, y: lm[i].y + eg * 0.45, r: 0.7 }))
  if (pos === 'side') return [P.cheekboneR, P.cheekboneL].map(i => ({ x: lm[i].x + (lm[i].x - lm[1].x) * 0.18, y: lm[i].y + eg * 0.1, r: 0.85 }))
  return [P.cheekR, P.cheekL].map(i => ({ x: lm[i].x, y: lm[i].y, r: 0.95 }))
}

function blush(ctx: CanvasRenderingContext2D, lm: Point[], W: number, H: number, s: MakeupState['blush']): void {
  if (!s || !s.alpha || !s.color) return
  const base = eyeWidthPx(lm, W)
  const spots = blushSpots(lm, s.pos || 'apple')
  ctx.save()
  pathFromIndices(ctx, lm, FACE_OVAL, W, H); ctx.clip()
  ctx.globalCompositeOperation = 'soft-light'
  ctx.globalAlpha = s.alpha
  for (const sp of spots) {
    const cx = sp.x * W, cy = sp.y * H, r = base * sp.r
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, s.color); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill()
  }
  ctx.restore(); reset(ctx)
}

function eyeliner(ctx: CanvasRenderingContext2D, lm: Point[], W: number, H: number, s: MakeupState['liner']): void {
  if (!s || !s.alpha || !s.color) return
  const style = s.style || 'natural'
  const ew = eyeWidthPx(lm, W)
  const thick = style === 'bold' ? 1.7 : 1.0
  ctx.save()
  ctx.filter = 'blur(0.5px)'
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = s.alpha
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'

  const drawLash = (idxs: number[], dirY: number, baseW: number, slopeW: number, startT: number): Point[] => {
    const p = idxs.map(i => ({ x: lm[i].x * W, y: lm[i].y * H }))
    for (let k = 0; k < p.length - 1; k++) {
      const t = 1 - k / (p.length - 1)
      if (t < startT) continue
      const w = Math.max(0.7, (ew * baseW + ew * slopeW * t) * thick)
      const off = w * 0.5 * dirY
      ctx.lineWidth = w
      ctx.beginPath(); ctx.moveTo(p[k].x, p[k].y + off); ctx.lineTo(p[k + 1].x, p[k + 1].y + off); ctx.stroke()
    }
    return p
  }

  for (const up of [EYE_UPPER_R, EYE_UPPER_L]) {
    const p = drawLash(up, -1, 0.015, 0.055, 0)
    if (style === 'wing') {
      const outer = p[0], inner = p[p.length - 1]
      const dir = Math.sign(outer.x - inner.x) || -1
      const tip = { x: outer.x + dir * ew * 0.17, y: outer.y - ew * 0.11 }
      const mid = { x: outer.x + dir * ew * 0.04, y: outer.y - ew * 0.01 }
      ctx.beginPath(); ctx.moveTo(outer.x, outer.y - ew * 0.01); ctx.lineTo(tip.x, tip.y); ctx.lineTo(mid.x, mid.y); ctx.closePath(); ctx.fill()
    }
  }
  const startLo = style === 'bold' ? 0.15 : 0.4
  for (const lo of [EYE_LOWER_R, EYE_LOWER_L]) drawLash(lo, +1, 0.008, 0.03, startLo)
  ctx.restore(); reset(ctx)
}

function brows(ctx: CanvasRenderingContext2D, lm: Point[], W: number, H: number, s: MakeupState['brow']): void {
  if (!s || !s.alpha || !s.color) return
  ctx.save()
  ctx.filter = 'blur(1px)'
  ctx.globalCompositeOperation = 'color'
  ctx.globalAlpha = s.alpha
  ctx.fillStyle = s.color
  for (const idx of [BROW_R, BROW_L]) { pathFromIndices(ctx, lm, idx, W, H); ctx.fill() }
  ctx.restore(); reset(ctx)
}

function lipstick(ctx: CanvasRenderingContext2D, lm: Point[], W: number, H: number, s: MakeupState['lip']): void {
  if (!s || !s.alpha || !s.color) return
  ctx.save()
  ctx.filter = 'blur(1.6px)'
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = s.alpha
  ctx.fillStyle = s.color
  pathFromIndices(ctx, lm, LIPS_OUTER, W, H); ctx.fill()
  ctx.restore(); reset(ctx)
}

// ── 合成入口 ──

/**
 * 在原图空间合成妆容。
 * @param ctx 目标画布 context（已 drawImage 原图）
 * @param img 原图（用于磨皮模糊回叠）
 * @param lm 归一化 landmarks（0-1 坐标）
 * @param W 画布宽
 * @param H 画布高
 * @param state 妆容参数
 */
export function renderMakeup(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  lm: Point[],
  W: number,
  H: number,
  state: MakeupState,
): void {
  reset(ctx)
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(img, 0, 0, W, H)
  if (!lm || !state) return
  // 按正确顺序叠加：底妆→修容→腮红→眼线→眉→口红
  try { foundation(ctx, img, lm, W, H, state.foundation) } catch (e) { console.warn('[妆] foundation', e) }
  try { contour(ctx, lm, W, H, state.contour) } catch (e) { console.warn('[妆] contour', e) }
  try { blush(ctx, lm, W, H, state.blush) } catch (e) { console.warn('[妆] blush', e) }
  try { eyeliner(ctx, lm, W, H, state.liner) } catch (e) { console.warn('[妆] eyeliner', e) }
  try { brows(ctx, lm, W, H, state.brow) } catch (e) { console.warn('[妆] brows', e) }
  try { lipstick(ctx, lm, W, H, state.lip) } catch (e) { console.warn('[妆] lip', e) }
  reset(ctx)
}
