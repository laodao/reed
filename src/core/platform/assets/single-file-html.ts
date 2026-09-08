/**
 * Single-file 网页归档：把页面外链 CSS/图片/字体等资源内联为 data: URL
 * @module core/platform/assets/single-file-html
 * @description 网页收藏核心——产出"自包含单文件 HTML"：双击即可离线打开、原样呈现
 *              原页面布局样式（CSS 文件内联、图片内联、CSS 内 url() 背景/字体递归内联）。
 *
 *              安全/健壮性：
 *              - 抓取外链资源前逐个走 validateOutboundUrl（SSRF/内网白名单）
 *              - script/iframe/object/embed 等动态元素移除（单文件纯静态、防外联/注入）
 *              - 单资源/总数上限，失败跳过并记录 warnings，不阻断归档
 *
 *              资源抓取器可注入（默认实现见 defaultWebResourceFetcher），便于单测与限速定制。
 */
import { parse } from 'node-html-parser'
import { validateOutboundUrl } from '@core/utils/outbound-url'

/** 单次资源抓取结果 */
export type WebResourceFetchResult =
  | { ok: true; text: string | null; dataUrl: string; contentType: string }
  | { ok: false; reason: string }

/** 资源抓取器（css 用 text；image/font 用 dataUrl） */
export type WebResourceFetcher = (url: string) => Promise<WebResourceFetchResult>

export interface InlineHtmlOptions {
  /** 相对资源解析基准（页面最终 URL）；缺省从 <base href> 推断 */
  baseUrl?: string
  /** 资源抓取器；缺省用内置（SSRF 校验 + 限长） */
  fetchResource?: WebResourceFetcher
  /** 内联资源总数上限（防失控抓取） */
  maxResources?: number
  /** 是否移除 script/iframe/object/embed（归档静态化；缺省 true） */
  stripDynamic?: boolean
}

export interface InlineHtmlResult {
  /** 自包含 HTML（script 等已移除、资源已内联） */
  html: string
  /** 成功内联资源数 */
  inlinedCount: number
  /** 移除的动态元素数 */
  strippedCount: number
  /** 抓取失败/跳过提示（不阻断） */
  warnings: string[]
}

const MAX_RESOURCE_BYTES = 10 * 1024 * 1024

/** 内置抓取器：SSRF 校验 + 10MB 限长；文本（css）与二进制（图/字体）统一返回 */
export async function defaultWebResourceFetcher(url: string): Promise<WebResourceFetchResult> {
  const guard = validateOutboundUrl(url)
  if (!guard.ok) return { ok: false, reason: `URL 校验失败：${guard.reason}` }
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status}` }
    const contentType = (resp.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim()
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.byteLength > MAX_RESOURCE_BYTES) return { ok: false, reason: `超过 ${MAX_RESOURCE_BYTES / 1024 / 1024}MB 上限` }
    const isText = contentType.startsWith('text/') || /(css|javascript|json|xml)/.test(contentType)
    return {
      ok: true,
      text: isText ? buf.toString('utf-8') : null,
      dataUrl: `data:${contentType || 'application/octet-stream'};base64,${buf.toString('base64')}`,
      contentType,
    }
  } catch (e) {
    return { ok: false, reason: (e as Error).message || '抓取失败' }
  }
}

function resolveResourceUrl(raw: string | null | undefined, baseUrl: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed || /^(data:|mailto:|tel:|#|javascript:)/i.test(trimmed)) return null
  try {
    const u = new URL(trimmed, baseUrl)
    return /^https?:$/i.test(u.protocol) ? u.toString() : null
  } catch {
    return null
  }
}

/** 把文本（css/js 等）编码为 data URL（base64） */
function textToDataUrl(text: string, mime: string): string {
  return `data:${mime};base64,${Buffer.from(text, 'utf-8').toString('base64')}`
}

/**
 * 内联 CSS 文本中的 url(...) 资源（背景图/字体等；递归内联，成功后替换为 data: URL）。
 * @returns 处理后的 CSS 文本 + 本次递归内联成功的资源数（失败保留原 url）
 */
async function inlineCssUrls(
  css: string,
  baseUrl: string,
  fetcher: WebResourceFetcher,
  budget: { used: () => number; inc: () => boolean },
  warnings: string[],
): Promise<{ css: string; inlined: number }> {
  const URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/g
  let out = ''
  let last = 0
  let inlined = 0
  let m: RegExpExecArray | null
  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(css)) !== null) {
    out += css.slice(last, m.index)
    last = URL_RE.lastIndex
    const raw = m[1] ?? m[2] ?? m[3] ?? ''
    if (!raw || raw.startsWith('data:')) {
      out += m[0]
      continue
    }
    const abs = resolveResourceUrl(raw, baseUrl)
    if (!abs) {
      out += m[0]
      continue
    }
    if (!budget.inc()) {
      warnings.push(`内联资源数量达上限，跳过 ${abs}`)
      out += m[0]
      continue
    }
    const res = await fetcher(abs)
    if (res.ok && res.dataUrl) {
      out += `url("${res.dataUrl}")`
      inlined += 1
    } else {
      warnings.push(`资源内联失败（保留原样）: ${abs} — ${res.ok ? 'empty' : res.reason}`)
      out += m[0]
    }
  }
  out += css.slice(last)
  return { css: out, inlined }
}

/**
 * 把页面 HTML 归档为自包含单文件。
 */
export async function inlineHtmlResources(html: string, options: InlineHtmlOptions = {}): Promise<InlineHtmlResult> {
  const warnings: string[] = []
  const fetcher = options.fetchResource ?? defaultWebResourceFetcher
  const maxResources = options.maxResources ?? 40
  let budgetCount = 0
  const budget = {
    used: () => budgetCount,
    inc: () => {
      if (budgetCount >= maxResources) return false
      budgetCount += 1
      return true
    },
  }

  if (!html || !html.trim()) return { html, inlinedCount: 0, strippedCount: 0, warnings }

  let root
  try {
    root = parse(html)
  } catch {
    warnings.push('HTML 解析失败，原样归档（未内联资源）')
    return { html, inlinedCount: 0, strippedCount: 0, warnings }
  }

  const baseTag = root.querySelector('base[href]')?.getAttribute('href')
  const baseUrl = options.baseUrl ?? baseTag ?? ''
  if (!baseUrl) {
    warnings.push('缺少基准 URL，相对资源未内联（仅绝对 http(s) 资源处理）')
  }

  let inlinedCount = 0
  let strippedCount = 0

  // 1) 移除动态元素：script / iframe / object / embed（单文件静态化）
  if (options.stripDynamic !== false) {
    for (const sel of ['script', 'iframe', 'object', 'embed']) {
      for (const el of root.querySelectorAll(sel)) {
        el.remove()
        strippedCount += 1
      }
    }
  }

  // 2) 外链样式表 link[rel~=stylesheet]：抓取 → css 内 url() 递归内联 → href 改 data URL
  for (const link of root.querySelectorAll('link[rel~="stylesheet"][href], link[href][type="text/css"]')) {
    const href = link.getAttribute('href')
    const abs = resolveResourceUrl(href, baseUrl)
    if (!abs) continue
    if (!budget.inc()) {
      warnings.push(`内联资源数量达上限，跳过样式表 ${abs}`)
      continue
    }
    const res = await fetcher(abs)
    if (!res.ok || res.text == null) {
      warnings.push(`样式表抓取失败（保留外链）: ${abs} — ${res.ok ? '非文本响应' : res.reason}`)
      continue
    }
    const { css: finalCss, inlined: cssInlined } = await inlineCssUrls(res.text, abs, fetcher, budget, warnings)
    link.setAttribute('href', textToDataUrl(finalCss, 'text/css'))
    inlinedCount += 1 + cssInlined
  }

  // 3) 图片 img[src]：外链（含相对解析后）→ 内联为 data URL
  for (const img of root.querySelectorAll('img[src]')) {
    const abs = resolveResourceUrl(img.getAttribute('src'), baseUrl)
    if (!abs) continue
    if (!budget.inc()) {
      warnings.push(`内联资源数量达上限，跳过图片 ${abs}`)
      continue
    }
    const res = await fetcher(abs)
    if (res.ok && res.dataUrl) {
      img.setAttribute('src', res.dataUrl)
      inlinedCount += 1
    } else {
      warnings.push(`图片内联失败（保留原样）: ${abs} — ${res.ok ? 'empty' : res.reason}`)
    }
  }

  return { html: root.toString() ?? html, inlinedCount, strippedCount, warnings }
}
