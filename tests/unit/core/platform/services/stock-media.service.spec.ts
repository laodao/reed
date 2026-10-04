/**
 * 真实素材服务测试（检索链 / 下载落盘 / 缓存命名 / 扩展名判定）
 * @module tests/unit/core/platform/services/stock-media
 * @description 用假 fetch + 临时 dataPath，验证：
 *  - 主检索词无结果时按备选检索词依次尝试，并回报实际生效的检索词与尝试链
 *  - 候选下载：落盘到 stock-media/<provider>/<kind>/，相对路径与绝对路径一致可解析
 *  - 单条下载失败不抛出（候选池少一条不影响整体），failed 计数如实回报
 *  - 扩展名依据 Content-Type 判定（ffmpeg 依赖扩展名识别容器）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
      return { ok: false, status: 500, headers: new Headers({}), text: async () => 'boom', arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': opts.contentType || 'image/jpeg' }),
      text: async () => '',
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    } as unknown as Response
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
    const fetchImpl = makeFetch({ queries: { 'container port terminal': [{ id: 1, url: 'https://cdn/large2x.jpg' }] } })
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
    const fetchImpl = makeFetch({ queries: { 'port crane': [{ id: 2, url: 'https://cdn/large2x.jpg' }] } })
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
      queries: { port: [{ id: 11, url: 'https://cdn/11_large2x.jpg' }, { id: 12, url: 'https://cdn/12_large2x.jpg' }] },
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
      queries: { port: [{ id: 11, url: 'https://cdn/fail.jpg' }, { id: 12, url: 'https://cdn/ok.jpg' }] },
      failUrls: ['https://cdn/fail.jpg'],
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
    expect(guessMediaExt('', 'https://cdn/video/987_small.mp4?t=1', 'video')).toBe('mp4')
    expect(guessMediaExt('', 'https://x/y', 'image')).toBe('jpg')
    expect(guessMediaExt('', 'https://x/y', 'video')).toBe('mp4')
  })

  it('文件名按 provider+kind+id 幂等（同素材重复检索复用同一文件）', () => {
    const item = { provider: 'pexels', kind: 'image', id: '11/../x' } as unknown as StockMediaItem
    expect(stockFileName(item, 'jpg')).toBe('pexels_image_11x.jpg')
    expect(stockRelDir('pexels', 'video')).toBe('stock-media/pexels/video')
  })
})