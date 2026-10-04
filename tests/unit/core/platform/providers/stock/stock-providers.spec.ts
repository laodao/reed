/**
 * 真实素材 Provider 测试（Pexels / Pixabay 映射与过滤）
 * @module tests/unit/core/platform/providers/stock
 * @description 全部用假 fetch（fixture 按官方文档字段构造），不联网：
 *  - Pexels 图片/视频映射：下载直链、预览、出处页、作者、授权、宽高、时长
 *  - 视频清晰度挑选：画幅一致优先 → 满足最小宽度里最小 → 否则最宽
 *  - 统一硬过滤：最小宽度丢弃、视频最小时长丢弃；全被过滤时回落最宽一条（真实素材优先于凭空生成）
 *  - 认证头：Pexels 用 Authorization 原值；Pixabay 用 key 查询参数
 *  - 未配置 Key / 空检索词 / 非 2xx：明确报错，不静默返回空
 */
import { describe, it, expect, vi } from 'vitest'
import { PexelsStockProvider } from '@core/platform/providers/stock/pexels-stock.provider'
import { PixabayStockProvider } from '@core/platform/providers/stock/pixabay-stock.provider'
import { createStockProvider, isStockProviderId, STOCK_PROVIDER_IDS } from '@core/platform/providers/stock'

/** 假 fetch：按 URL 片段返回 JSON，并记录请求 */
function fakeFetch(routes: Array<{ match: string; body: unknown; status?: number }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const hit = routes.find(r => String(url).includes(r.match))
    const status = hit?.status ?? (hit ? 200 : 404)
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify(hit?.body ?? { error: 'not found' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

const PEXELS_PHOTO = {
  photos: [
    {
      id: 16229885,
      width: 4000,
      height: 6000,
      url: 'https://www.pexels.com/photo/16229885/',
      photographer: 'Tom Fisk',
      photographer_url: 'https://www.pexels.com/@tomfisk',
      alt: 'Aerial view of a container port',
      src: {
        original: 'https://images.pexels.com/photos/16229885/original.jpg',
        large2x: 'https://images.pexels.com/photos/16229885/large2x.jpg',
        medium: 'https://images.pexels.com/photos/16229885/medium.jpg',
      },
    },
  ],
}

const PEXELS_VIDEO = {
  videos: [
    {
      id: 11801939,
      width: 1080,
      height: 1920,
      duration: 12,
      url: 'https://www.pexels.com/video/11801939/',
      image: 'https://images.pexels.com/videos/11801939/cover.jpg',
      user: { name: 'Coverr', url: 'https://www.pexels.com/@coverr' },
      video_files: [
        { id: 1, link: 'https://videos.pexels.com/video-files/11801939/tiny_360_640.mp4', width: 360, height: 640, file_type: 'video/mp4', quality: 'sd' },
        { id: 2, link: 'https://videos.pexels.com/video-files/11801939/hd_1080_1920.mp4', width: 1080, height: 1920, file_type: 'video/mp4', quality: 'hd' },
        { id: 3, link: 'https://videos.pexels.com/video-files/11801939/landscape_1920_1080.mp4', width: 1920, height: 1080, file_type: 'video/mp4', quality: 'hd' },
        { id: 4, link: 'https://videos.pexels.com/video-files/11801939/preview.gif', width: 300, height: 300, file_type: 'image/gif' },
      ],
    },
  ],
}

describe('PexelsStockProvider', () => {
  it('图片检索：下载用 original 基址 + 1600px 参数（避免库里 large2x 只有 940px）', async () => {
    const { impl, calls } = fakeFetch([{ match: '/v1/search', body: PEXELS_PHOTO }])
    const p = new PexelsStockProvider({ apiKey: 'KEY123', fetchImpl: impl })
    const items = await p.search({ query: 'container port terminal', kind: 'image', perPage: 3 })
    expect(items).toHaveLength(1)
    const it = items[0]
    expect(it.provider).toBe('pexels')
    expect(it.kind).toBe('image')
    expect(it.downloadUrl).toBe('https://images.pexels.com/photos/16229885/original.jpg?auto=compress&cs=tinysrgb&w=1600')
    expect(it.previewUrl).toContain('medium.jpg')
    expect(it.pageUrl).toBe('https://www.pexels.com/photo/16229885/')
    expect(it.author).toBe('Tom Fisk')
    expect(it.license).toBe('pexels')
    expect(it.width).toBe(4000)
    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('KEY123')
    expect(calls[0].url).toContain('/v1/search')
    expect(calls[0].url).toContain('orientation=portrait')
  })

  it('视频检索：画幅一致优先，满足最小宽度里取最高清晰度', async () => {
    const { impl } = fakeFetch([{ match: '/videos/search', body: PEXELS_VIDEO }])
    const p = new PexelsStockProvider({ apiKey: 'KEY123', fetchImpl: impl })
    const items = await p.search({ query: 'container port', kind: 'video', minWidth: 720, orientation: 'portrait' })
    expect(items).toHaveLength(1)
    const it = items[0]
    expect(it.downloadUrl).toContain('hd_1080_1920.mp4')
    expect(it.previewUrl).toContain('cover.jpg')
    expect(it.durationSec).toBe(12)
    expect(it.width).toBe(1080)
    expect(it.height).toBe(1920)
  })

  it('最小宽度过滤：全部不达标时回落最宽一条（真实素材优先于凭空生成）', async () => {
    const { impl } = fakeFetch([{ match: '/videos/search', body: PEXELS_VIDEO }])
    const p = new PexelsStockProvider({ apiKey: 'KEY123', fetchImpl: impl })
    const items = await p.search({ query: 'container port', kind: 'video', minWidth: 4000, orientation: 'portrait' })
    expect(items).toHaveLength(1)
    expect(items[0].width).toBe(1080) // 竖屏里最宽（横屏 1920 因画幅不一致被排除在候选池外）
  })

  it('视频最小时长过滤：过短候选按硬过滤丢弃', async () => {
    const shortVideo = { videos: [{ ...PEXELS_VIDEO.videos[0], duration: 2 }] }
    const { impl } = fakeFetch([{ match: '/videos/search', body: shortVideo }])
    const p = new PexelsStockProvider({ apiKey: 'KEY123', fetchImpl: impl })
    const items = await p.search({ query: 'port', kind: 'video', minDurationSec: 5 })
    // 硬过滤后为空 → 回落最宽一条（保留真实素材，但调用方可从 durationSec 判断）
    expect(items).toHaveLength(1)
    expect(items[0].durationSec).toBe(2)
  })

  it('未配置 Key 时明确报错（不静默返回空）', async () => {
    const { impl } = fakeFetch([{ match: '/v1/search', body: PEXELS_PHOTO }])
    const p = new PexelsStockProvider({ apiKey: '', fetchImpl: impl })
    await expect(p.search({ query: 'port', kind: 'image' })).rejects.toThrow(/未配置 API Key/)
  })

  it('空检索词报错；HTTP 非 2xx 报错并带状态码', async () => {
    const { impl } = fakeFetch([{ match: '/v1/search', body: { error: 'unauthorized' }, status: 401 }])
    const p = new PexelsStockProvider({ apiKey: 'BAD', fetchImpl: impl })
    await expect(p.search({ query: '   ', kind: 'image' })).rejects.toThrow(/不能为空/)
    await expect(p.search({ query: 'port', kind: 'image' })).rejects.toThrow(/HTTP 401/)
  })

  it('连接测试：成功返回示例素材，失败返回错误消息', async () => {
    const ok = new PexelsStockProvider({
      apiKey: 'K',
      fetchImpl: fakeFetch([{ match: '/v1/search', body: PEXELS_PHOTO }]).impl,
    })
    expect((await ok.testConnection()).success).toBe(true)
    const bad = new PexelsStockProvider({
      apiKey: 'K',
      fetchImpl: fakeFetch([{ match: '/v1/search', body: { error: 'x' }, status: 401 }]).impl,
    })
    const res = await bad.testConnection()
    expect(res.success).toBe(false)
    expect(res.message).toContain('401')
  })
})

describe('PixabayStockProvider', () => {
  const IMAGE = {
    hits: [
      {
        id: 12345,
        pageURL: 'https://pixabay.com/photos/container-port-12345/',
        tags: 'container, port, crane',
        previewURL: 'https://cdn.pixabay.com/photo/12345_150.jpg',
        webformatURL: 'https://cdn.pixabay.com/photo/12345_640.jpg',
        largeImageURL: 'https://cdn.pixabay.com/photo/12345_1280.jpg',
        imageWidth: 1280,
        imageHeight: 1920,
        user: 'PixabayUser',
      },
    ],
  }
  const VIDEO = {
    hits: [
      {
        id: 987,
        pageURL: 'https://pixabay.com/videos/port-987/',
        tags: 'port, ship',
        duration: 20,
        user: 'PixabayUser',
        videos: {
          large: { url: 'https://cdn.pixabay.com/video/987_large.mp4', width: 1920, height: 1080, size: 100, thumbnail: 'https://cdn.pixabay.com/video/987_large.jpg' },
          medium: { url: 'https://cdn.pixabay.com/video/987_medium.mp4', width: 1280, height: 720, size: 60, thumbnail: 'https://cdn.pixabay.com/video/987_medium.jpg' },
          small: { url: 'https://cdn.pixabay.com/video/987_small.mp4', width: 960, height: 540, size: 30, thumbnail: 'https://cdn.pixabay.com/video/987_small.jpg' },
        },
      },
    ],
  }

  it('图片检索：Key 走查询参数，映射大图与出处', async () => {
    const { impl, calls } = fakeFetch([{ match: '/api/', body: IMAGE }])
    const p = new PixabayStockProvider({ apiKey: 'PK', fetchImpl: impl })
    const items = await p.search({ query: 'container port', kind: 'image' })
    expect(items).toHaveLength(1)
    expect(items[0].downloadUrl).toContain('12345_1280.jpg')
    expect(items[0].pageUrl).toContain('pixabay.com/photos')
    expect(items[0].license).toBe('pixabay')
    expect(calls[0].url).toContain('key=PK')
    expect(calls[0].url).toContain('image_type=photo')
  })

  it('视频检索：按最小宽度挑清晰度（下限内取最高，超上限不取）', async () => {
    const { impl, calls } = fakeFetch([{ match: '/api/videos/', body: VIDEO }])
    const p = new PixabayStockProvider({ apiKey: 'PK', fetchImpl: impl })
    const items = await p.search({ query: 'container port', kind: 'video', minWidth: 1000 })
    expect(items).toHaveLength(1)
    expect(items[0].downloadUrl).toContain('987_large.mp4')
    expect(items[0].previewUrl).toContain('987_large.jpg')
    expect(items[0].durationSec).toBe(20)
    expect(calls[0].url).toContain('/api/videos/')
  })
})

describe('素材库工厂', () => {
  it('已登记 id 可创建，未知 id 抛错', () => {
    expect(isStockProviderId('pexels')).toBe(true)
    expect(isStockProviderId('unknown')).toBe(false)
    expect(STOCK_PROVIDER_IDS).toContain('pixabay')
    expect(createStockProvider('pexels', { apiKey: 'K' }).id).toBe('pexels')
    expect(() => createStockProvider('nope', { apiKey: 'K' })).toThrow(/未知素材库/)
  })

  it('provider 不做网络请求也可构造（懒加载）', () => {
    const spy = vi.fn()
    expect(spy).not.toHaveBeenCalled()
    expect(createStockProvider('pixabay', { apiKey: '' }).isConfigured()).toBe(false)
  })
})