/**
 * 视频 URL 解析器测试：平台检测 / BV 提取 / WBI 签名 / B站解析（mock fetch）/ 抖音降级提示 / 直链直通
 * @module tests/workflow/video-url-resolver
 * @description B站解析链路：finger/spi 取会话 → view（412 回退 WBI 签名版）→ playurl DASH 音频直链
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  detectVideoSource,
  extractBilibiliBvid,
  bilibiliWbiSign,
  getBilibiliSession,
  resolveVideoSource,
} from '@core/modules/workflow/tools/video-url-resolver'

const BVID = 'BV1xx411c7mD'

/** 标准 mock 序列：spi 会话 → view → nav(WBI key) → playurl */
function biliFetchMocks(overrides: Record<number, unknown> = {}): ReturnType<typeof vi.fn> {
  const seq = [
    // 0. finger/spi 会话
    new Response(JSON.stringify({ code: 0, data: { b_3: 'C6EB1BAB-169A-DE2B-21FD-58A5F83FAD7252797infoc' } }), { status: 200 }),
    // 1. view（cid + title）
    new Response(JSON.stringify({ code: 0, data: { cid: 456, title: '测试视频标题' } }), { status: 200 }),
    // 2. nav（WBI key）
    new Response(JSON.stringify({ code: 0, data: { wbi_img: { img_url: 'https://x/bfs/wbi/aaaa1111.png', sub_url: 'https://x/bfs/wbi/bbbb2222.png' } } }), { status: 200 }),
    // 3. playurl（DASH 音频）
    new Response(JSON.stringify({ code: 0, data: { dash: { audio: [{ baseUrl: 'https://upos.example.com/audio.m4s' }] } } }), { status: 200 }),
  ]
  for (const [i, r] of Object.entries(overrides)) seq[Number(i)] = r as Response
  return vi.fn()
    .mockResolvedValueOnce(seq[0])
    .mockResolvedValueOnce(seq[1])
    .mockResolvedValueOnce(seq[2])
    .mockResolvedValueOnce(seq[3])
    .mockResolvedValue(seq[3])
}

describe('detectVideoSource / extractBilibiliBvid', () => {
  it('平台检测：B站/抖音/直链扩展名/需 yt-dlp 的站点/非 http', () => {
    expect(detectVideoSource('https://www.bilibili.com/video/BV1xx411c7mD')).toBe('bilibili')
    expect(detectVideoSource('https://b23.tv/abc123')).toBe('bilibili')
    expect(detectVideoSource('https://v.douyin.com/xxxx/')).toBe('douyin')
    expect(detectVideoSource('https://cdn.example.com/video.mp4')).toBe('direct')
    expect(detectVideoSource('https://cdn.example.com/stream.m3u8?token=1')).toBe('direct')
    // 页面 URL（无视频扩展名）→ 需要 yt-dlp
    expect(detectVideoSource('https://www.youtube.com/watch?v=abc123')).toBe('ytdlp')
    expect(detectVideoSource('https://v.youku.com/v_show/id_X123.html')).toBe('ytdlp')
    expect(detectVideoSource('https://weibo.com/tv/show/12345')).toBe('ytdlp')
    expect(detectVideoSource('C:/videos/a.mp4')).toBe('unsupported')
  })

  it('BV 号提取', () => {
    expect(extractBilibiliBvid('https://www.bilibili.com/video/BV1xx411c7mD/?p=2')).toBe(BVID)
    expect(extractBilibiliBvid('没有BV号')).toBeNull()
  })
})

describe('bilibiliWbiSign', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('生成 wts/w_rid（mock nav 返回 img/sub key）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { wbi_img: { img_url: 'https://i0.hdslb.com/bfs/wbi/abc12345.png', sub_url: 'https://i0.hdslb.com/bfs/wbi/def67890.png' } },
    }), { status: 200 })))
    const signed = await bilibiliWbiSign({ bvid: BVID, cid: '123' })
    expect(signed.wts).toMatch(/^\d{10}$/)
    expect(signed.w_rid).toMatch(/^[0-9a-f]{32}$/)
    expect(signed.bvid).toBe(BVID)
  })

  it('nav 失败 → 抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    await expect(bilibiliWbiSign({ bvid: BVID })).rejects.toThrow()
  })
})

describe('getBilibiliSession', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('finger/spi 返回 b_3 → 组装 buvid3 Cookie + Origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { b_3: 'ABC123-4567-infoc' },
    }), { status: 200 })))
    const s = await getBilibiliSession()
    expect(s.cookie).toContain('buvid3=ABC123-4567-infoc')
    expect(s.cookie).toContain('b_nut=')
    expect(s.origin).toBe('https://www.bilibili.com')
  })

  it('finger/spi 失败/无 b_3 → 空会话（不阻断）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    expect(await getBilibiliSession()).toEqual({ cookie: '', origin: '' })
  })
})

describe('resolveVideoSource', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('常规直链 → direct（直通 URL + UA 头）', async () => {
    const r = await resolveVideoSource('https://cdn.example.com/video.mp4')
    expect(r.kind).toBe('direct')
    expect(r.url).toBe('https://cdn.example.com/video.mp4')
    expect(r.headers['User-Agent']).toBeTruthy()
  })

  it('需 yt-dlp 的站点（YouTube/优酷页面）→ kind=ytdlp（带主机名展示名）', async () => {
    const r1 = await resolveVideoSource('https://www.youtube.com/watch?v=abc123')
    expect(r1.kind).toBe('ytdlp')
    expect(r1.url).toBe('https://www.youtube.com/watch?v=abc123')
    expect(r1.name).toContain('youtube')
    const r2 = await resolveVideoSource('https://v.youku.com/v_show/id_X123.html')
    expect(r2.kind).toBe('ytdlp')
  })

  it('B站 → 先取会话再解析：spi/view/nav/playurl 顺序 + Cookie/Origin 头 + DASH 直链', async () => {
    const fetchMock = biliFetchMocks()
    vi.stubGlobal('fetch', fetchMock)
    const r = await resolveVideoSource(`https://www.bilibili.com/video/${BVID}`)
    expect(r.kind).toBe('bilibili')
    expect(r.url).toBe('https://upos.example.com/audio.m4s')
    expect(r.headers.Referer).toBe('https://www.bilibili.com/')
    expect(r.name).toBe('测试视频标题')

    // 0. finger/spi：请求头带 UA（取会话）
    expect(String(fetchMock.mock.calls[0][0])).toContain('finger/spi')
    // 1. view：带 Cookie + Origin（防 412）
    const viewCall = fetchMock.mock.calls[1]
    expect(String(viewCall[0])).toContain('/x/web-interface/view')
    expect((viewCall[1] as Record<string, unknown>).headers).toMatchObject({ Cookie: expect.stringContaining('buvid3='), Origin: 'https://www.bilibili.com' })
    // 2. nav：WBI key（同样带会话头）
    const navCall = fetchMock.mock.calls[2]
    expect(String(navCall[0])).toContain('/x/web-interface/nav')
    expect((navCall[1] as Record<string, unknown>).headers).toMatchObject({ Cookie: expect.stringContaining('buvid3=') })
    // 3. playurl：带 wbi 签名（URLSearchParams 含 w_rid）
    expect(String(fetchMock.mock.calls[3][0])).toContain('w_rid=')
  })

  it('B站 view 412 → 回退 WBI 签名版（wbi/view）', async () => {
    const fetchMock = vi.fn()
      // 0. finger/spi 会话
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { b_3: 'SPI-1' } }), { status: 200 }))
      // 1. view → 412 风控
      .mockResolvedValueOnce(new Response('<!DOCTYPE html>', { status: 412 }))
      // 2. nav（回退签名）
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { wbi_img: { img_url: 'https://x/bfs/wbi/aaaa1111.png', sub_url: 'https://x/bfs/wbi/bbbb2222.png' } } }), { status: 200 }))
      // 3. wbi/view（cid + title）
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { cid: 789, title: '回退标题' } }), { status: 200 }))
      // 4. nav（playurl 签名）
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { wbi_img: { img_url: 'https://x/bfs/wbi/aaaa1111.png', sub_url: 'https://x/bfs/wbi/bbbb2222.png' } } }), { status: 200 }))
      // 5. playurl
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { dash: { audio: [{ baseUrl: 'https://upos.example.com/fallback.m4s' }] } } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await resolveVideoSource(`https://www.bilibili.com/video/${BVID}`)
    expect(r.kind).toBe('bilibili')
    expect(r.url).toBe('https://upos.example.com/fallback.m4s')
    expect(r.name).toBe('回退标题')
    // 回退路径确实调用了 wbi/view
    expect(String(fetchMock.mock.calls[3][0])).toContain('wbi/view')
    expect(String(fetchMock.mock.calls[3][0])).toContain('w_rid=')
  })

  it('B站 playurl 无媒体流 → 抛错', async () => {
    vi.stubGlobal('fetch', biliFetchMocks({
      3: new Response(JSON.stringify({ code: 0, data: { dash: null } }), { status: 200 }),
    }))
    await expect(resolveVideoSource(`https://www.bilibili.com/video/${BVID}`)).rejects.toThrow('未返回可用媒体流')
  })

  it('B站 view 接口失败且 WBI 回退也失败 → 抛错', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { b_3: 'SPI-1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('<!DOCTYPE html>', { status: 412 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { wbi_img: { img_url: 'https://x/bfs/wbi/aaaa1111.png', sub_url: 'https://x/bfs/wbi/bbbb2222.png' } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 })))
    await expect(resolveVideoSource(`https://www.bilibili.com/video/${BVID}`)).rejects.toThrow('view 接口失败')
  })

  it('B站无 BV 号 → 抛错', async () => {
    await expect(resolveVideoSource('https://www.bilibili.com/video/xxx')).rejects.toThrow('BV')
  })

  it('抖音 → 返回 error 提示（明确降级路径，不抛错不伪造）', async () => {
    const r = await resolveVideoSource('https://v.douyin.com/abc123/')
    expect(r.kind).toBe('douyin')
    expect(r.error).toContain('抖音')
  })

  it('非 http 链接 → 抛错', async () => {
    await expect(resolveVideoSource('file:///etc/passwd')).rejects.toThrow('仅支持 http')
  })
})
