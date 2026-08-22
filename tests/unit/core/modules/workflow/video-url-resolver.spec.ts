/**
 * 视频 URL 解析器测试：平台检测 / BV 提取 / WBI 签名 / B站解析（mock fetch）/ 抖音降级提示 / 直链直通
 * @module tests/workflow/video-url-resolver
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  detectVideoSource,
  extractBilibiliBvid,
  bilibiliWbiSign,
  resolveVideoSource,
} from '@core/modules/workflow/tools/video-url-resolver'

const BVID = 'BV1xx411c7mD'

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

  it('B站 → 解析出音频直链 + Referer（mock view/playurl）', async () => {
    const fetchMock = vi.fn()
      // 1. nav（WBI key）
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { wbi_img: { img_url: 'https://x/bfs/wbi/aaaa1111.png', sub_url: 'https://x/bfs/wbi/bbbb2222.png' } } }), { status: 200 }))
      // 2. view（cid + title）
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { cid: 456, title: '测试视频标题' } }), { status: 200 }))
      // 3. playurl（DASH 音频）
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { dash: { audio: [{ baseUrl: 'https://upos.example.com/audio.m4s' }] } } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await resolveVideoSource(`https://www.bilibili.com/video/${BVID}`)
    expect(r.kind).toBe('bilibili')
    expect(r.url).toBe('https://upos.example.com/audio.m4s')
    expect(r.headers.Referer).toBe('https://www.bilibili.com/')
    expect(r.name).toBe('测试视频标题')
    // 校验 playurl 请求带了 wbi 签名（URLSearchParams 含 w_rid）
    const playCall = fetchMock.mock.calls[2][0]
    expect(playCall).toContain('w_rid=')
  })

  it('B站 playurl 无媒体流 → 抛错', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { wbi_img: { img_url: 'https://x/bfs/wbi/aaaa1111.png', sub_url: 'https://x/bfs/wbi/bbbb2222.png' } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { cid: 1, title: 't' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { dash: null } }), { status: 200 })))
    await expect(resolveVideoSource(`https://www.bilibili.com/video/${BVID}`)).rejects.toThrow('未返回可用媒体流')
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
