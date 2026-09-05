/**
 * favicon 服务测试
 * @module tests/unit/core/platform/services/favicon.service
 * @description 验证域名提取、link icon 解析、图片 MIME 识别、
 *              抓取顺序（站点优先 → HTML 解析 → Google 兜底）与磁盘缓存/TTL（mock fetch）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { FaviconService, extractDomain, extractLinkIconHref, detectImageMime } from '@core/platform/services/favicon.service'
import { registerPathProvider, type IPathProvider } from '@core/interfaces/path.interface'

// 1×1 PNG
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

let tempDir: string

function registerMockPathProvider(dir: string): void {
  const provider: IPathProvider = {
    getUserDataPath: () => dir,
    getAppDataPath: () => dir,
    getTempPath: () => dir,
    getDataPath: () => dir,
    getSubDirectories: () => ({ database: 'db', images: 'img', voice: 'v', translations: 't', knowledgeBase: 'kb', video: 'vid', portrait: 'p', diary: 'd', longwriting: 'lw', stv: 'stv' }),
    getSubDirectoryPath: (name) => path.join(dir, name),
    toAssetUrl: (p) => p,
  }
  registerPathProvider(() => provider)
}

/** 构造带 body 的 fetch 响应 */
function okResponse(body: unknown, headers: Record<string, string> = {}): any {
  return {
    ok: true,
    headers: { get: (k: string) => headers[k] ?? null },
    arrayBuffer: async () => PNG_BYTES.buffer,
    body: null,
  }
}

describe('favicon.service', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'favicon-test-'))
    registerMockPathProvider(tempDir)
    FaviconService.getInstance().clearMemoryCache()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('extractDomain', () => {
    it('提取 hostname 并小写', () => {
      expect(extractDomain('https://www.TechnologyReview.com/topic/ai')).toBe('www.technologyreview.com')
      expect(extractDomain('https://qbitai.com/')).toBe('qbitai.com')
    })

    it('非法 URL 返回空串', () => {
      expect(extractDomain('not a url')).toBe('')
      expect(extractDomain('')).toBe('')
    })
  })

  describe('extractLinkIconHref', () => {
    it('识别任意属性顺序的 link rel=icon', () => {
      const html = '<html><head><link rel="icon" type="image/png" href="/static/favicon.png"></head></html>'
      expect(extractLinkIconHref(html)).toBe('/static/favicon.png')
    })

    it('识别 rel 在 href 之后 / shortcut icon', () => {
      const html = '<link href="https://cdn.x.com/ico.ico" rel="shortcut icon" />'
      expect(extractLinkIconHref(html)).toBe('https://cdn.x.com/ico.ico')
    })

    it('忽略非 icon 的 link，忽略 data: href', () => {
      const html = '<link rel="stylesheet" href="/a.css"><link rel="icon" href="data:image/png;base64,AAAA">'
      expect(extractLinkIconHref(html)).toBeNull()
    })
  })

  describe('detectImageMime', () => {
    it('识别 PNG / ICO / JPEG / SVG / WEBP 魔数', () => {
      expect(detectImageMime(PNG_BYTES)).toBe('image/png')
      expect(detectImageMime(Buffer.from([0x00, 0x00, 0x01, 0x00, 1, 2, 3, 4]))).toBe('image/x-icon')
      expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe('image/jpeg')
      expect(detectImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe('image/svg+xml')
      expect(detectImageMime(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp')
    })

    it('无法识别且无图片 Content-Type 时返回 null', () => {
      expect(detectImageMime(Buffer.from('hello world 1234'))).toBeNull()
      expect(detectImageMime(Buffer.from('hello world 1234'), 'text/html')).toBeNull()
      expect(detectImageMime(Buffer.from('hello world 1234'), 'image/png')).toBe('image/png')
    })
  })

  describe('getFavicon', () => {
    it('优先抓取站点 /favicon.ico 并缓存（二次读取不再请求网络）', async () => {
      fetchMock.mockResolvedValue(okResponse(null, { 'content-type': 'image/png' }))

      const svc = FaviconService.getInstance()
      const r1 = await svc.getFavicon('https://example.com/')
      expect(r1.domain).toBe('example.com')
      expect(r1.dataUrl).toContain('data:image/png;base64,')
      // 第一个候选是站点自己的 favicon.ico
      expect(String(fetchMock.mock.calls[0][0])).toBe('https://example.com/favicon.ico')

      const cachedFile = path.join(tempDir, 'favicons', 'example.com.bin')
      expect(fs.existsSync(cachedFile)).toBe(true)

      // 二次调用：不再发起网络请求
      fetchMock.mockClear()
      const r2 = await svc.getFavicon('https://example.com/page')
      expect(r2.dataUrl).toBe(r1.dataUrl)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('/favicon.ico 404 → 解析 HTML link icon → Google s2 兜底', async () => {
      fetchMock
        // 1) /favicon.ico 404
        .mockResolvedValueOnce({ ok: false, status: 404, body: null })
        // 2) 首页 HTML（含 link icon）
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: { getReader: () => makeReader('<html><head><link rel="icon" href="/img/favicon.png"></head></html>') },
        })
        // 3) 图标本身
        .mockResolvedValueOnce(okResponse(null, { 'content-type': 'image/png' }))

      const r = await FaviconService.getInstance().getFavicon('https://news.example.org/')
      expect(r.dataUrl).toContain('data:image/png;base64,')
      expect(String(fetchMock.mock.calls[1][0])).toBe('https://news.example.org/')
      expect(String(fetchMock.mock.calls[2][0])).toBe('https://news.example.org/img/favicon.png')
    })

    it('/favicon.ico 与 HTML 都失败 → DuckDuckGo 兜底 → Google s2 最后', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 404, body: null })
        .mockResolvedValueOnce({ ok: false, status: 403, body: null })
        .mockResolvedValueOnce({ ok: false, status: 404, body: null })
        .mockResolvedValueOnce(okResponse(null, { 'content-type': 'image/png' }))

      const r = await FaviconService.getInstance().getFavicon('https://sub.example.net/')
      expect(r.dataUrl).toContain('data:image/png;base64,')
      expect(String(fetchMock.mock.calls[2][0])).toContain('icons.duckduckgo.com')
      expect(String(fetchMock.mock.calls[3][0])).toContain('google.com/s2/favicons')
    })

    it('全部候选失败 → 返回无 dataUrl 并写入带时间戳的 NOT_FOUND（未过期不重试）', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, body: null })

      const r = await FaviconService.getInstance().getFavicon('https://nope.example.net/')
      expect(r.dataUrl).toBeUndefined()
      const cachedText = fs.readFileSync(path.join(tempDir, 'favicons', 'nope.example.net.bin'), 'utf8')
      expect(cachedText.startsWith('NOT_FOUND:')).toBe(true)

      fetchMock.mockClear()
      const r2 = await FaviconService.getInstance().getFavicon('https://nope.example.net/x')
      expect(r2.dataUrl).toBeUndefined()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('NOT_FOUND 超过 24h 过期后自动重试', async () => {
      // 预置一个过期的 NOT_FOUND 缓存
      const dir = path.join(tempDir, 'favicons')
      fs.mkdirSync(dir, { recursive: true })
      const expired = Date.now() - 25 * 60 * 60 * 1000
      fs.writeFileSync(path.join(dir, 'retry.example.bin'), `NOT_FOUND:${expired}`, 'utf8')

      fetchMock.mockResolvedValue(okResponse(null, { 'content-type': 'image/png' }))
      const r = await FaviconService.getInstance().getFavicon('https://retry.example/')
      expect(r.dataUrl).toContain('data:image/png;base64,')
      expect(fetchMock).toHaveBeenCalled()
    })

    it('内网/环回/保留地址域名 → 直接返回无 dataUrl，不发起任何网络请求（防 SSRF）', async () => {
      for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'http://192.168.1.1/']) {
        fetchMock.mockClear()
        FaviconService.getInstance().clearMemoryCache()
        const r = await FaviconService.getInstance().getFavicon(url)
        expect(r.dataUrl).toBeUndefined()
        expect(fetchMock).not.toHaveBeenCalled()
      }
    })

    it('HTML link icon href 指向内网 → 跳过该图标，落到境外兜底，不请求内网', async () => {
      fetchMock
        // 1) /favicon.ico 404
        .mockResolvedValueOnce({ ok: false, status: 404, body: null })
        // 2) 首页 HTML（link href 指向内网元数据）
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: { getReader: () => makeReader('<html><head><link rel="icon" href="http://169.254.169.254/latest/meta-data/"></head></html>') },
        })
        // 3) DuckDuckGo 兜底失败
        .mockResolvedValueOnce({ ok: false, status: 404, body: null })
        // 4) Google s2 兜底成功
        .mockResolvedValueOnce(okResponse(null, { 'content-type': 'image/png' }))

      const r = await FaviconService.getInstance().getFavicon('https://example.org/')
      expect(r.dataUrl).toContain('data:image/png;base64,')
      // 全程未请求内网地址
      expect(fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes('169.254.169.254'))).toBe(false)
      // 最后一次是 Google s2 兜底
      expect(String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0])).toContain('google.com/s2/favicons')
    })
  })
})

/** 构造 HTML reader（模拟 fetch body 流） */
function makeReader(text: string): { read(): Promise<{ done: boolean; value?: Uint8Array }> } {
  const buf = Buffer.from(text, 'utf8')
  let offset = 0
  return {
    read: async () => {
      if (offset >= buf.length) return { done: true }
      const chunk = buf.subarray(offset, offset + 1024)
      offset += chunk.length
      return { done: false, value: new Uint8Array(chunk) }
    },
  }
}
