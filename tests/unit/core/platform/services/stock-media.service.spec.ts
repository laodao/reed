/**
 * 真实素材服务测试（检索链 / 下载落盘 / 缓存命名 / 扩展名判定）
 * @module tests/unit/core/platform/services/stock-media
 * @description 用假 fetch + 临时 dataPath，验证：
 *  - 主检索词无结果时按备选检索词依次尝试，并回报实际生效的检索词与尝试链
 *  - 候选下载：落盘到 stock-media/<provider>/<kind>/，相对路径与绝对路径一致可解析
 *  - 单条下载失败不抛出（候选池少一条不影响整体），failed 计数如实回报
 *  - 扩展名依据 Content-Type 判定（ffmpeg 依赖扩展名识别容器）
 *  - 幂等缓存：已落盘（size>0）直接复用返回 cached:true，不重复发起网络请求
 *  - 出向安全：内网/环回/非 http(s) 的 downloadUrl 直接拒绝（防 SSRF）；fetch 带 60s 超时 signal
 *  - 流式写盘：先写 .part 再改名；下载中断时清理半成品、不落最终文件
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  StockMediaService,
  buildQueryChain,
  guessMediaExt,
  stockFileName,
  stockRelDir,
} from '@core/platform/services/stock-media.service'
import type { StockMediaItem } from '@shared/types/stock-media.types'

let tmpRoot = ''

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-media-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

/** 假 fetch：图片搜索返回给定 photos；下载按 URL 返回二进制 */
function makeFetch(opts: { queries: Record<string, Array<{ id: number; url: string }>>; contentType?: string; failUrls?: string[] }) {
  return (async (url: string) => {
    const u = String(url)
    if (u.includes('/v1/search')) {
      const q = new URL(u).searchParams.get('query') || ''
      const photos = (opts.queries[q] || []).map(p => ({
        id: p.id,
        width: 2000,
        height: 3000,
        url: `https://www.pexels.com/photo/${p.id}/`,
        photographer: 'Tester',
        src: { large2x: p.url, medium: p.url.replace('large2x', 'medium') },
      }))
      return json({ photos })
    }
    if (opts.failUrls?.some(f => u.startsWith(f))) {
      return new Response('boom', { status: 500 })
    }
    // 真实 Response：下载链路为流式写盘（Readable.fromWeb(resp.body)），mock 必须带 body 流
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': opts.contentType || 'image/jpeg' },
    })
  }) as unknown as typeof fetch
}

function json(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response
}

describe('检索词链', () => {
  it('保序去重去空', () => {
    expect(buildQueryChain(' a ', ['b', 'a', '', 'c'])).toEqual(['a', 'b', 'c'])
    expect(buildQueryChain('', ['  '])).toEqual([])
  })
})

describe('StockMediaService.search', () => {
  it('主检索词命中即返回，回报尝试链', async () => {
    const fetchImpl = makeFetch({ queries: { 'container port terminal': [{ id: 1, url: 'https://cdn.example.com/large2x.jpg' }] } })
    const res = await StockMediaService.search({
      provider: 'pexels',
      apiKey: 'K',
      request: { query: 'container port terminal', kind: 'image' },
      altQueries: ['port crane'],
      fetchImpl,
    })
    expect(res.items).toHaveLength(1)
    expect(res.queryUsed).toBe('container port terminal')
    expect(res.queriesTried).toEqual(['container port terminal'])
  })

  it('主检索词无结果时依次尝试备选词', async () => {
    const fetchImpl = makeFetch({ queries: { 'port crane': [{ id: 2, url: 'https://cdn.example.com/large2x.jpg' }] } })
    const res = await StockMediaService.search({
      provider: 'pexels',
      apiKey: 'K',
      request: { query: 'container port terminal', kind: 'image' },
      altQueries: ['port crane'],
      fetchImpl,
    })
    expect(res.items).toHaveLength(1)
    expect(res.queryUsed).toBe('port crane')
    expect(res.queriesTried).toEqual(['container port terminal', 'port crane'])
  })

  it('全部检索词都无结果时返回空（调用方据此降级）', async () => {
    const fetchImpl = makeFetch({ queries: {} })
    const res = await StockMediaService.search({
      provider: 'pexels',
      apiKey: 'K',
      request: { query: 'nothing here', kind: 'image' },
      altQueries: ['still nothing'],
      fetchImpl,
    })
    expect(res.items).toEqual([])
    expect(res.queriesTried).toHaveLength(2)
  })
})

describe('StockMediaService.fetchCandidates', () => {
  it('下载候选到 dataPath/stock-media/<provider>/<kind>/，相对与绝对路径可对应', async () => {
    const fetchImpl = makeFetch({
      queries: { port: [{ id: 11, url: 'https://cdn.example.com/11_large2x.jpg' }, { id: 12, url: 'https://cdn.example.com/12_large2x.jpg' }] },
    })
    const res = await StockMediaService.fetchCandidates({
      provider: 'pexels',
      apiKey: 'K',
      request: { query: 'port', kind: 'image' },
      maxDownloads: 2,
      dataPath: tmpRoot,
      fetchImpl,
    })
    expect(res.downloads).toHaveLength(2)
    expect(res.failed).toBe(0)
    for (const d of res.downloads) {
      expect(d.relPath.startsWith('stock-media/pexels/image/')).toBe(true)
      expect(fs.existsSync(d.absPath)).toBe(true)
      expect(path.join(tmpRoot, d.relPath)).toBe(d.absPath)
      expect(d.bytes).toBeGreaterThan(0)
    }
    expect(res.downloads[0].relPath).toContain('pexels_image_11')
  })

  it('单条下载失败只计数不抛出', async () => {
    const fetchImpl = makeFetch({
      queries: { port: [{ id: 11, url: 'https://cdn.example.com/fail.jpg' }, { id: 12, url: 'https://cdn.example.com/ok.jpg' }] },
      failUrls: ['https://cdn.example.com/fail.jpg'],
    })
    const res = await StockMediaService.fetchCandidates({
      provider: 'pexels',
      apiKey: 'K',
      request: { query: 'port', kind: 'image' },
      maxDownloads: 2,
      dataPath: tmpRoot,
      fetchImpl,
    })
    expect(res.downloads).toHaveLength(1)
    expect(res.failed).toBe(1)
  })
})

describe('扩展名与文件名', () => {
  it('Content-Type 优先，其次 URL 后缀，最后按种类兜底', () => {
    expect(guessMediaExt('image/jpeg; charset=binary', 'https://x/y', 'image')).toBe('jpg')
    expect(guessMediaExt('image/webp', 'https://x/y', 'image')).toBe('webp')
    expect(guessMediaExt('video/mp4', 'https://x/y', 'video')).toBe('mp4')
    expect(guessMediaExt('', 'https://cdn.example.com/video/987_small.mp4?t=1', 'video')).toBe('mp4')
    expect(guessMediaExt('', 'https://x/y', 'image')).toBe('jpg')
    expect(guessMediaExt('', 'https://x/y', 'video')).toBe('mp4')
  })

  it('文件名按 provider+kind+id 幂等（同素材重复检索复用同一文件）', () => {
    const item = { provider: 'pexels', kind: 'image', id: '11/../x' } as unknown as StockMediaItem
    expect(stockFileName(item, 'jpg')).toBe('pexels_image_11x.jpg')
    expect(stockRelDir('pexels', 'video')).toBe('stock-media/pexels/video')
  })
})

/** 构造视频素材条目（download 直测用） */
function videoItem(over: Record<string, unknown> = {}): StockMediaItem {
  return {
    provider: 'pexels',
    id: 'v1',
    kind: 'video',
    downloadUrl: 'https://cdn.example.com/v1.mp4',
    previewUrl: '',
    width: 1080,
    height: 1920,
    durationSec: 8,
    pageUrl: 'https://www.pexels.com/video/v1/',
    author: 'Tester',
    license: 'pexels',
    ...over,
  } as StockMediaItem
}

describe('StockMediaService.download（幂等缓存 / 出向安全 / 流式写盘）', () => {
  it('已缓存（size>0）直接复用：不发网络请求，返回 cached:true 与原路径', async () => {
    const fetchImpl = vi.fn()
    const dir = path.join(tmpRoot, 'stock-media/pexels/video')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'pexels_video_v1.mp4'), 'cached-bytes')
    const d = await StockMediaService.download(videoItem(), { dataPath: tmpRoot, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(d.cached).toBe(true)
    expect(d.absPath).toBe(path.join(dir, 'pexels_video_v1.mp4'))
    expect(d.relPath).toBe('stock-media/pexels/video/pexels_video_v1.mp4')
    expect(d.bytes).toBe(Buffer.byteLength('cached-bytes'))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('空文件（size=0）不视为有效缓存，重新下载覆盖', async () => {
    const dir = path.join(tmpRoot, 'stock-media/pexels/video')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'pexels_video_v1.mp4'), '')
    const fetchImpl = (async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'video/mp4' } })) as unknown as typeof fetch
    const d = await StockMediaService.download(videoItem(), { dataPath: tmpRoot, fetchImpl })
    expect(d.cached).toBe(false)
    expect(d.bytes).toBe(4)
    expect(fs.statSync(d.absPath).size).toBe(4)
  })

  it('内网/环回/非 http(s) 的 downloadUrl 直接拒绝（防 SSRF），不发起请求', async () => {
    const fetchImpl = vi.fn()
    for (const url of ['http://127.0.0.1:8080/x.mp4', 'http://192.168.1.5/x.mp4', 'file:///etc/passwd']) {
      await expect(
        StockMediaService.download(videoItem({ downloadUrl: url }), { dataPath: tmpRoot, fetchImpl: fetchImpl as unknown as typeof fetch }),
      ).rejects.toThrow('校验失败')
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fetch 携带超时 signal；流式写盘完成后落定最终文件且不留 .part', async () => {
    let gotSignal: AbortSignal | undefined
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      gotSignal = init?.signal as AbortSignal
      return new Response(new Uint8Array([9, 8, 7, 6, 5]), { status: 200, headers: { 'content-type': 'video/mp4' } })
    }) as unknown as typeof fetch
    const d = await StockMediaService.download(videoItem(), { dataPath: tmpRoot, fetchImpl })
    expect(gotSignal).toBeInstanceOf(AbortSignal)
    expect(gotSignal?.aborted).toBe(false)
    expect(d.cached).toBe(false)
    expect(d.bytes).toBe(5)
    expect(fs.existsSync(d.absPath)).toBe(true)
    expect(fs.readdirSync(path.dirname(d.absPath)).some(n => n.endsWith('.part'))).toBe(false)
  })

  it('下载流中断：抛出错误并清理 .part 半成品（最终文件不落盘）', async () => {
    const fetchImpl = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]))
            controller.error(new Error('connection reset'))
          },
        }),
        { status: 200, headers: { 'content-type': 'video/mp4' } },
      )) as unknown as typeof fetch
    await expect(
      StockMediaService.download(videoItem({ id: 'v2' }), { dataPath: tmpRoot, fetchImpl }),
    ).rejects.toThrow()
    const dir = path.join(tmpRoot, 'stock-media/pexels/video')
    expect(fs.existsSync(dir)).toBe(true)
    expect(fs.readdirSync(dir)).toEqual([])
  })
})