/**
 * 幻灯片 SVG 生成（播客视频画面：PPT 风格）
 * @module core/packs/podcast-video/slides/slide-svg
 * @description 纯函数模块：幻灯片结构（标题/要点）→ SVG 文本。渲染成 PNG 由
 *              sharp-worker 子进程执行（libvips 不得进 Electron 主进程）。
 *
 *              版式约定：中文按 1em、ASCII 按 ~0.52em 估宽做 CJK 感知换行；
 *              内容超高时整组字号等比收缩（下限 0.5），保证不溢出画布。
 *              文字渲染依赖系统字体栈（Windows 微软雅黑 / macOS 苹方 / Linux Noto CJK）。
 */

/** 幻灯片结构约定（LLM 输出契约，字段全部宽松容错） */
export interface SlideInput {
  /** cover=封面 | content=内容页 | ending=结尾页（缺省 content） */
  kind?: string
  title?: string
  bullets?: unknown
  /** 口播讲解词（不渲染到画面，仅契约透传） */
  narration?: string
}

export { SLIDE_THEMES, getSlideTheme, SLIDE_THEME_OPTIONS } from '@shared/types/slide-themes'
import type { SlideTheme } from '@shared/types/slide-themes'
export type { SlideTheme } from '@shared/types/slide-themes'

/** 幻灯片字体栈（跨平台中文回退） */
export const SLIDE_FONT_STACK = 'Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Source Han Sans CN, WenQuanYi Micro Hei, sans-serif'

/** XML 文本转义（元素内容；属性统一单引号且值不含引号） */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * CJK 感知贪心换行：中日韩全宽字符记 1 单位、其余记 0.52 单位，
 * 超出 maxUnits 即换行。显式 \n 视为强制换行。
 */
export function wrapByUnits(text: string, maxUnits: number): string[] {
  const clean = String(text ?? '').replace(/\r/g, '')
  if (maxUnits < 2) maxUnits = 2
  const lines: string[] = []
  for (const para of clean.split('\n')) {
    if (para === '') { lines.push(''); continue }
    let cur = ''
    let curW = 0
    for (const ch of para) {
      const w = isFullWidth(ch) ? 1 : 0.52
      if (curW + w > maxUnits && cur) {
        lines.push(cur)
        cur = ch
        curW = w
      } else {
        cur += ch
        curW += w
      }
    }
    if (cur || lines.length === 0) lines.push(cur)
  }
  return lines
}

function isFullWidth(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x2e80 && code <= 0x9fff) || // CJK 部首/汉字
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意
    (code >= 0xff00 && code <= 0xffef) || // 全角符号
    (code >= 0x3000 && code <= 0x303f) || // CJK 标点
    (code >= 0x2018 && code <= 0x201d)    // 弯引号/破折号
  )
}

/** 估算单行文本宽度（em 单位） */
export function textUnits(text: string): number {
  let w = 0
  for (const ch of String(text ?? '')) w += isFullWidth(ch) ? 1 : 0.52
  return w
}

/** 超长截断（末尾追加省略号，保持 ≤ maxUnits） */
function truncate(text: string, maxUnits: number): string {
  if (textUnits(text) <= maxUnits) return text
  let out = ''
  let w = 0
  for (const ch of String(text)) {
    const cw = isFullWidth(ch) ? 1 : 0.52
    if (w + cw > maxUnits - 1) break
    out += ch
    w += cw
  }
  return out + '…'
}

export interface BuildSlideSvgOptions {
  slide: SlideInput
  /** 当前页序（1-based） */
  index: number
  total: number
  width: number
  height: number
  theme: SlideTheme
  /** 整期标题（封面辅助行 + 内容页页脚） */
  deckTitle?: string
}

/**
 * 单页幻灯片 SVG：
 * - cover：居中大标题 + 导语行（bullets 复用为副标题）
 * - content/ending：左上标题 + 强调条 + 要点列表（左竖条装饰 + 页脚）
 */
export function buildSlideSvg(opts: BuildSlideSvgOptions): string {
  const { slide, index, total, width: W, height: H, theme } = opts
  // 字号缩放基准（1080p 设计稿）：按短边缩放——竖屏(1080×1920)与横屏(1920×1080)同一观感
  const k = Math.min(W, H) / 1080
  const deckTitle = String(opts.deckTitle ?? '').trim()
  const kind = String(slide.kind ?? 'content').trim() || 'content'
  const title = truncate(String(slide.title ?? '').replace(/\s+/g, ' ').trim(), 24) || `第 ${index} 页`
  const bullets = (Array.isArray(slide.bullets) ? slide.bullets : [])
    .map(b => String(b ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const page = `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}`

  const body =
    kind === 'cover'
      ? coverBody(title, bullets, deckTitle, W, H, k, theme)
      : contentBody(title, bullets, W, H, k, theme)

  const footer = kind === 'cover' ? '' : footerBlock(deckTitle, page, W, H, k, theme)
  const deco = kind === 'cover' ? '' : `<rect x="0" y="0" width="${r(12 * k)}" height="${H}" fill="${theme.accent}"/>`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${theme.bg}"/>`,
    deco,
    body,
    footer,
    `</svg>`,
  ].join('\n')
}

/** 数值取整（SVG 坐标） */
function r(n: number): number {
  return Math.round(n * 100) / 100
}

/** 封面版式：垂直居中的 kicker + 大标题 + 强调线 + 导语 */
function coverBody(
  title: string,
  bullets: string[],
  deckTitle: string,
  W: number,
  H: number,
  k: number,
  theme: SlideTheme,
): string {
  const kicker = deckTitle || 'PODCAST'
  const kickerSize = r(34 * k)
  const titleSize = r(Math.min(116 * k, (W * 0.86) / Math.max(textUnits(title), 1)))
  const subSize = r(40 * k)
  const titleLines = wrapByUnits(title, Math.floor((W * 0.86) / Math.max(titleSize, 1)))
    .slice(0, 2)
  const titleBlockH = titleLines.length * titleSize * 1.28
  const subLines = bullets.slice(0, 3).map(b => truncate(b, Math.floor((W * 0.7) / Math.max(subSize, 1))))
  const subBlockH = subLines.length * subSize * 1.7
  // 整体垂直居中：kicker + 间隔 + 标题块 + 强调线 + 间隔 + 导语块
  const totalH = kickerSize + 60 * k + titleBlockH + 64 * k + 8 * k + (subLines.length ? 70 * k + subBlockH : 0)
  let y = (H - totalH) / 2 + kickerSize
  const parts: string[] = []
  parts.push(textEl(W / 2, r(y), kicker, kickerSize, theme.accent, '500', 6 * k, 'middle'))
  y += 60 * k
  for (const ln of titleLines) {
    y += titleSize * 1.28
    parts.push(textEl(W / 2, r(y), escapeXml(ln), titleSize, theme.title, '700', 0, 'middle'))
  }
  y += 64 * k
  const barW = r(140 * k)
  parts.push(`<rect x="${r(W / 2 - barW / 2)}" y="${r(y)}" width="${barW}" height="${r(8 * k)}" rx="${r(4 * k)}" fill="${theme.accent}"/>`)
  if (subLines.length) {
    y += 70 * k
    for (const ln of subLines) {
      y += subSize * 1.7
      parts.push(textEl(W / 2, r(y), escapeXml(ln), subSize, theme.text, '400', 0, 'middle'))
    }
  }
  return `<g font-family="${SLIDE_FONT_STACK}">${parts.join('\n')}</g>`
}

/** 内容版式：左上标题 + 强调条 + 要点列表（超高自动收缩字号） */
function contentBody(
  title: string,
  bullets: string[],
  W: number,
  H: number,
  k: number,
  theme: SlideTheme,
): string {
  const padX = W * 0.09
  const contentW = W - padX * 2
  const titleSize = Math.min(84 * k, contentW / Math.max(textUnits(title), 1) / 1.35)
  const titleLines = wrapByUnits(title, Math.floor(contentW / Math.max(titleSize, 1))).slice(0, 2)
  const barH = Math.max(4, 7 * k)
  const titleTop = H * 0.14
  const titleBottom = titleTop + titleLines.length * titleSize * 1.32 + 34 * k + barH

  const footerReserve = H * 0.085
  const areaTop = titleBottom + H * 0.05
  const available = H - areaTop - footerReserve

  // 自适应收缩：先按基准字号算需求高，超出可用高则整体缩（下限 0.5）
  const baseSize = 44 * k
  const markerIndent = baseSize * 1.15
  const layout = (size: number) => {
    const lineHeight = size * 1.5
    const gap = size * 0.95
    const rows = bullets.map(b => ({
      lines: wrapByUnits(b, Math.floor((contentW - markerIndent) / Math.max(size, 1))),
    }))
    const needed = rows.reduce((s, rr) => s + rr.lines.length * lineHeight, 0) + Math.max(0, bullets.length - 1) * gap
    return { rows, lineHeight, gap, needed }
  }
  let size = baseSize
  let m = layout(size)
  if (bullets.length > 0 && m.needed > available) {
    size = Math.max(baseSize * 0.5, (baseSize * available) / m.needed)
    m = layout(size)
  }
  const { rows, lineHeight, gap } = m
  const markerSize = size * 0.3

  const parts: string[] = []
  let y = titleTop
  for (const ln of titleLines) {
    y += titleSize * 1.32
    parts.push(textEl(padX, r(y), escapeXml(ln), r(titleSize), theme.title, '700'))
  }
  y += 34 * k
  parts.push(`<rect x="${r(padX + 4)}" y="${r(y)}" width="${r(120 * k)}" height="${r(barH)}" rx="${r(barH / 2)}" fill="${theme.accent}"/>`)

  let by = areaTop
  bullets.forEach((_, i) => {
    const { lines } = rows[i]
    const blockTop = by
    lines.forEach((ln, j) => {
      const baseline = blockTop + j * lineHeight + size * 0.8
      parts.push(textEl(padX + markerIndent, r(baseline), escapeXml(ln), r(size), theme.text, j === 0 ? '500' : '400'))
    })
    // 方块标记与首行视觉居中对齐（基线上方约 0.32em 处为字面中心）
    const markerCenter = blockTop + size * 0.8 - size * 0.32
    parts.push(
      `<rect x="${r(padX)}" y="${r(markerCenter - markerSize / 2)}" width="${r(markerSize)}" height="${r(markerSize)}" rx="${r(markerSize * 0.28)}" fill="${theme.accent}"/>`,
    )
    by += lines.length * lineHeight + gap
  })
  return `<g font-family="${SLIDE_FONT_STACK}">${parts.join('\n')}</g>`
}

/** 页脚：整期标题（左）+ 页码（右） */
function footerBlock(
  deckTitle: string,
  page: string,
  W: number,
  H: number,
  k: number,
  theme: SlideTheme,
): string {
  const size = r(26 * k)
  const y = r(H - H * 0.045)
  const left = deckTitle ? truncate(deckTitle, 22) : ''
  return `<g font-family="${SLIDE_FONT_STACK}">${
    left ? textEl(W * 0.09, y, escapeXml(left), size, theme.sub, '400') : ''
  }${textEl(W * 0.91, y, page, size, theme.sub, '400', 0, 'end')}</g>`
}

/** SVG text 元素（x/y 为基线坐标） */
function textEl(
  x: number,
  y: number,
  content: string,
  size: number,
  fill: string,
  weight: string | number,
  letterSpacing = 0,
  anchor: 'start' | 'middle' | 'end' = 'start',
): string {
  const ls = letterSpacing > 0 ? ` letter-spacing="${r(letterSpacing)}"` : ''
  return `<text x="${r(x)}" y="${r(y)}" font-size="${r(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls}>${content}</text>`
}
