/**
 * 网站 favicon 抓取与缓存服务
 * @module core/platform/services/favicon.service
 * @description
 * 新闻来源等场景需要把「网站的 icon」展示为来源图标。本服务在服务端
 * （Electron 主进程 / Web 服务器）抓取并**缓存到本地**：
 *  1. 按域名从磁盘缓存读取（dataPath/favicons/<domain>.bin，data: URL 文本）
 *  2. 未命中则依次尝试（**站点自身优先**，避免依赖境外服务）：
 *     - https://<domain>/favicon.ico（站点根目录默认图标）
 *     - 解析站点 HTML 的 <link rel="icon"> 声明的图标
 *     - https://icons.duckduckgo.com/ip3/<domain>.ico（境外兜底 1）
 *     - https://www.google.com/s2/favicons?domain=<domain>（境外兜底 2）
 *  3. 成功后写入磁盘缓存 + 内存缓存；失败写入带时间戳的 NOT_FOUND 标记，
 *     超过 24 小时自动过期重试
 *
 * 返回 data: URL，渲染进程 img-src 允许 data:，无需放开 CSP。
 * 抓取带并发上限（最多 16 个同时）、单次超时 6s，避免首次打开设置页
 * 时对站点造成压力或长时间阻塞。
 */

import * as path from 'path'
import * as fs from 'fs'
import { getPathProvider } from '@core/interfaces/path.interface'
import { isPrivateHostname, validateOutboundUrl } from '@core/utils/outbound-url'
import { assetParams } from '@shared/utils/asset-params'

export interface FaviconResult {
  /** 规范化域名（hostname） */
  domain: string
  /** favicon 的 data: URL；抓取失败时为 undefined */
  dataUrl?: string
}

const CACHE_DIR_NAME = 'favicons'
/**
 * 站点图标抓取参数（超时/扫描字节/未命中缓存/并发）走「参数设置 → 素材与图片 → 站点图标」。
 * 并发在模块级 Semaphore 里使用（进程级单例），设置页标注为"改动需重启客户端"。
 * 下面两个常量是并发信号的**初始值**（= 改造前写死的 16；持有者未注入时用它）。
 */
const DEFAULT_MAX_CONCURRENT_FETCH = 16
/** 标准浏览器 UA：降低被站点反爬拦截的概率（自定义 UA 会触发 403） */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** 简单并发信号量 */
class Semaphore {
  private queue: Array<() => void> = []
  private active = 0
  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.active++
  }

  release(): void {
    this.active--
    const next = this.queue.shift()
    if (next) next()
  }
}

const fetchSemaphore = new Semaphore(
  assetParams().favicon.maxConcurrency || DEFAULT_MAX_CONCURRENT_FETCH,
)

export class FaviconService {
  private static instance: FaviconService | null = null

  /** 内存缓存：domain → dataUrl（'' 表示已确认无图标，避免重复请求） */
  private readonly memoryCache = new Map<string, string>()

  /** 在途请求去重：domain → Promise<dataUrl | null> */
  private readonly pending = new Map<string, Promise<string | null>>()

  static getInstance(): FaviconService {
    if (!FaviconService.instance) {
      FaviconService.instance = new FaviconService()
    }
    return FaviconService.instance
  }

  /**
   * 获取指定站点 URL 的 favicon（data: URL）。
   * 多来源并发请求同域名时只抓取一次。
   */
  async getFavicon(url: string): Promise<FaviconResult> {
    const domain = extractDomain(url)
    if (!domain) return { domain: '' }

    const cached = this.memoryCache.get(domain)
    if (cached !== undefined) {
      return { domain, dataUrl: cached || undefined }
    }

    let inflight = this.pending.get(domain)
    if (!inflight) {
      inflight = this.fetchAndCache(domain).finally(() => {
        this.pending.delete(domain)
      })
      this.pending.set(domain, inflight)
    }

    const dataUrl = await inflight
    return { domain, dataUrl: dataUrl || undefined }
  }

  /** 清空内存缓存（测试/诊断用） */
  clearMemoryCache(): void {
    this.memoryCache.clear()
  }

  private async fetchAndCache(domain: string): Promise<string | null> {
    // 1) 磁盘缓存
    const disk = await this.readDiskCache(domain)
    if (disk !== null) {
      this.memoryCache.set(domain, disk)
      return disk || null
    }

    // 2) 在线抓取（受并发上限约束）
    const dataUrl = await fetchSemaphore.acquire().then(async () => {
      try {
        return await this.fetchFavicon(domain)
      } finally {
        fetchSemaphore.release()
      }
    })

    if (dataUrl) {
      this.memoryCache.set(domain, dataUrl)
    } else {
      this.memoryCache.set(domain, '')
    }
    await this.writeDiskCache(domain, dataUrl).catch((e) => {
      console.warn('[FaviconService] 写入缓存失败:', domain, e)
    })
    return dataUrl
  }

  private async fetchFavicon(domain: string): Promise<string | null> {
    // 防 SSRF：拒绝内网/环回/保留地址 host。domain 源自用户可控 URL（favicon:get），
    // 多租户 Web 端若不拦截，可被借道扫描内网/云元数据并回读。
    if (isPrivateHostname(domain)) return null

    // 候选 1：站点根目录 favicon.ico（国内/国际站点普遍存在，最快）
    const ico = await this.fetchImage(`https://${domain}/favicon.ico`)
    if (ico) return ico

    // 候选 2：解析站点 HTML 的 <link rel="icon">（只读前 128KB）
    const htmlIconUrl = await this.resolveHtmlIconUrl(domain)
    if (htmlIconUrl) {
      const htmlIcon = await this.fetchImage(htmlIconUrl)
      if (htmlIcon) return htmlIcon
    }

    // 候选 3/4：境外 favicon 服务兜底（DuckDuckGo → Google）
    const ddg = await this.fetchImage(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`)
    if (ddg) return ddg
    return this.fetchImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`)
  }

  /** 抓取一个图片 URL → data: URL；失败返回 null */
  private async fetchImage(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(assetParams().favicon.timeoutMs),
        redirect: 'follow',
        headers: { 'User-Agent': BROWSER_UA },
      })
      if (!res.ok) return null
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0) return null
      const mime = detectImageMime(buf, res.headers.get('content-type'))
      if (!mime) return null
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch (e) {
      console.warn('[FaviconService] 抓取失败:', url, e instanceof Error ? e.message : e)
      return null
    }
  }

  /** 解析站点 HTML 头部声明的 <link rel="icon"> 图标 URL（相对路径转绝对） */
  private async resolveHtmlIconUrl(domain: string): Promise<string | null> {
    try {
      const html = await this.fetchHtmlHead(`https://${domain}/`, assetParams().favicon.htmlScanBytes)
      if (!html) return null
      const href = extractLinkIconHref(html)
      if (!href) return null
      try {
        const abs = new URL(href, `https://${domain}/`).toString()
        // HTML link href 本身可为任意绝对 URL（例如指向内网/环回地址），
        // 再封装一次出向校验：非 http(s) 或私网地址一律跳过，防 HTML 注入式 SSRF。
        const guard = validateOutboundUrl(abs)
        if (!guard.ok) return null
        return abs
      } catch {
        return null
      }
    } catch {
      return null
    }
  }

  /** 只读页面前 maxBytes 字节后中断，避免下载整个站点首页 */
  private async fetchHtmlHead(url: string, maxBytes: number): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), assetParams().favicon.timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': BROWSER_UA },
      })
      if (!res.ok || !res.body) return ''
      const reader = res.body.getReader()
      const chunks: Buffer[] = []
      let total = 0
      try {
        while (total < maxBytes) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = Buffer.from(value)
          chunks.push(chunk)
          total += chunk.length
        }
      } finally {
        controller.abort() // 停止继续传输
        try { await reader.cancel() } catch { /* 忽略 */ }
      }
      return Buffer.concat(chunks).toString('utf8')
    } catch {
      return ''
    } finally {
      clearTimeout(timer)
    }
  }

  private cacheDir(): string {
    return path.join(getPathProvider().getDataPath(), CACHE_DIR_NAME)
  }

  private cacheFilePath(domain: string): string {
    return path.join(this.cacheDir(), `${sanitizeFileName(domain)}.bin`)
  }

  /** 读磁盘缓存：返回 data: URL；未命中返回 null；命中未过期 NOT_FOUND 返回 '' */
  private async readDiskCache(domain: string): Promise<string | null> {
    try {
      const text = await fs.promises.readFile(this.cacheFilePath(domain), 'utf8')
      if (text.startsWith('data:')) return text
      if (text.startsWith('NOT_FOUND')) {
        const ts = Number(text.split(':')[1] || 0)
        // 未过期：视为已确认无图标；已过期：当作未缓存，允许重试
        if (ts && Date.now() - ts < assetParams().favicon.notFoundTtlMs) return ''
        return null
      }
      return null
    } catch {
      return null
    }
  }

  private async writeDiskCache(domain: string, dataUrl: string | null): Promise<void> {
    await fs.promises.mkdir(this.cacheDir(), { recursive: true })
    await fs.promises.writeFile(
      this.cacheFilePath(domain),
      dataUrl ?? `NOT_FOUND:${Date.now()}`,
      'utf8',
    )
  }
}

export function getFaviconService(): FaviconService {
  return FaviconService.getInstance()
}

/** 从站点 URL 提取 hostname（小写，去端口）；非法 URL 返回 '' */
export function extractDomain(url: string): string {
  try {
    const u = new URL(url)
    if (!u.hostname) return ''
    return u.hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** 从 HTML 片段提取 <link rel="icon"> 的 href（含 shortcut icon / apple-touch-icon 排除） */
export function extractLinkIconHref(html: string): string | null {
  if (!html) return null
  // 匹配 <link ... rel="icon" ... href="..." />（属性顺序任意）
  const linkRe = /<link\b[^>]*>/gi
  for (const match of html.matchAll(linkRe)) {
    const tag = match[0]
    const relMatch = tag.match(/\brel\s*=\s*["']([^"']*)["']/i)
    if (!relMatch) continue
    const rels = relMatch[1].toLowerCase().split(/\s+/)
    // 只认 icon / shortcut icon；apple-touch-icon 也接受（高分屏）
    const isIcon = rels.includes('icon') || rels.includes('shortcut') || rels.includes('apple-touch-icon')
    if (!isIcon) continue
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)
    if (!hrefMatch) continue
    const href = hrefMatch[1].trim()
    if (href && !href.startsWith('data:')) return href
  }
  return null
}

/** 文件名安全化（域名 → 可作文件名的片段） */
function sanitizeFileName(domain: string): string {
  return domain.replace(/[^a-z0-9._-]/gi, '_')
}

/** 通过魔数识别图片 MIME；识别失败时回退 Content-Type 头 */
export function detectImageMime(buf: Buffer, contentType?: string | null): string | null {
  if (!buf || buf.length < 8) return null

  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'
  // ICO（00 00 01 00）
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'image/x-icon'
  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp'
  // WEBP（RIFF....WEBP）
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp'
  // SVG（文本开头）
  const head = buf.subarray(0, 256).toString('utf8').trimStart()
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!DOCTYPE svg')) {
    return 'image/svg+xml'
  }

  // 回退：Content-Type 声明是图片才采用
  if (contentType && /^image\/(png|jpeg|gif|webp|x-icon|svg\+xml|ico)$/i.test(contentType)) {
    return contentType.toLowerCase()
  }
  return null
}
