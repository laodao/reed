/**
 * 视频 URL 解析器（P0 增强：视频文案提取支持 URL）
 * @module core/platform/workflow/tools/video-url-resolver
 * @description 分层支持：
 *  - direct：常规视频直链（mp4/webm/mov/flv/m3u8 等）——ffmpeg 直接拉流，开箱即用
 *  - bilibili：B站（bilibili.com/video/BVxxx、b23.tv 短链）——公开 API 解析 DASH 音频直链
 *    （nav 取 WBI key → playurl 签名 → DASH audio，音频流不受清晰度限制），带 Referer 防盗链
 *  - douyin：抖音风控极强、无稳定公开 API——返回明确提示，走"手动下载后本地导入"降级路径
 *
 * 安全：只接受 http/https（防 file:// 任意读）；B站请求带 UA/Referer；解析失败明确报错不静默。
 */

import crypto from 'node:crypto'
import { workflowRuntimeParams } from '@shared/utils/workflow-runtime-params'

/** B站 WBI 签名密钥置换表（公开固定常量） */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const BILI_REFERER = 'https://www.bilibili.com/'

/** B站匿名会话（buvid3/b_nut Cookie + Origin） */
export interface BilibiliSession {
  cookie: string
  origin: string
}

/**
 * 获取 B站匿名会话：finger/spi 拿 buvid3（公开接口，无需登录）。
 * 目的：view/playurl 接口带 Cookie + Origin 可显著降低 412 风控概率。
 * 失败时返回空会话（不阻断：无风控环境/直链场景仍可解析）。
 */
export async function getBilibiliSession(): Promise<BilibiliSession> {
  try {
    const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(workflowRuntimeParams().tools.videoUrlResolveTimeoutMs),
    })
    if (!res.ok) return { cookie: '', origin: '' }
    const data = (await res.json()) as { code: number; data?: { b_3?: string } }
    const b3 = data.data?.b_3
    if (!b3) return { cookie: '', origin: '' }
    return {
      cookie: `buvid3=${b3}; b_nut=${Math.floor(Date.now() / 1000)}`,
      origin: 'https://www.bilibili.com',
    }
  } catch {
    return { cookie: '', origin: '' }
  }
}

/** 拼装 B站 API 请求头（会话 Cookie + Origin + UA/Referer） */
function biliApiHeaders(session: BilibiliSession): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Referer: BILI_REFERER,
    'Accept-Language': 'zh-CN,zh;q=0.9',
  }
  if (session.cookie) headers.Cookie = session.cookie
  if (session.origin) headers.Origin = session.origin
  return headers
}

export type VideoSourceKind = 'direct' | 'bilibili' | 'douyin' | 'ytdlp' | 'unsupported'

export interface ResolvedVideoSource {
  kind: VideoSourceKind
  /** ffmpeg 输入 URL */
  url: string
  /** 防盗链请求头（Referer/UA） */
  headers: Record<string, string>
  /** 展示名（文件名/视频标题） */
  name: string
  /** 不支持时的明确提示（douyin/unsupported） */
  error?: string
}

/** 提取 B站 bvid（BV 开头 10 字符） */
export function extractBilibiliBvid(input: string): string | null {
  const m = input.match(/BV[0-9A-Za-z]{10}/)
  return m ? m[0] : null
}

/** 平台检测：
 *  - bilibili → 内置 API 解析（无依赖）
 *  - douyin → 风控降级
 *  - 视频扩展名直链 → ffmpeg 直接拉流
 *  - 其它 http(s)（YouTube/西瓜/微博/快手/小红书/优酷页面等）→ 需要 yt-dlp
 *  - 非 http → 不支持
 */
export function detectVideoSource(rawUrl: string): VideoSourceKind {
  const url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) return 'unsupported'
  if (/bilibili\.com|b23\.tv/i.test(url)) return 'bilibili'
  if (/douyin\.com|iesdouyin\.com/i.test(url)) return 'douyin'
  if (DIRECT_EXT.test(url)) return 'direct'
  return 'ytdlp'
}

/** 常规直链：扩展名白名单（.mp4/.webm/.mov/.m4v/.flv/.mkv/.avi/.m3u8/.mp3/.m4a 等） */
const DIRECT_EXT = /\.(mp4|webm|mov|m4v|flv|mkv|avi|m3u8|mp3|m4a|aac|wav)(\?|#|$)/i

/** B站 WBI 签名（公开算法：nav 取 img/sub key → 置换表取 mixinKey → 参数排序拼接 + md5） */
export async function bilibiliWbiSign(
  params: Record<string, string>,
  headers?: Record<string, string>,
): Promise<Record<string, string>> {
  const navRes = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: headers ?? { 'User-Agent': UA },
    signal: AbortSignal.timeout(workflowRuntimeParams().tools.videoUrlResolveTimeoutMs),
  })
  if (!navRes.ok) throw new Error('B站 nav 接口失败（可能被风控，稍后再试）')
  const nav = (await navRes.json()) as {
    code: number
    data?: { wbi_img?: { img_url?: string; sub_url?: string } }
  }
  const imgKey = nav.data?.wbi_img?.img_url?.split('/').pop()?.split('.')[0]
  const subKey = nav.data?.wbi_img?.sub_url?.split('/').pop()?.split('.')[0]
  if (!imgKey || !subKey) throw new Error('B站 WBI 密钥获取失败')
  const raw = imgKey + subKey
  const mixinKey = MIXIN_KEY_ENC_TAB.map(i => raw[i]).join('').slice(0, 32)
  const signed: Record<string, string> = { ...params, wts: String(Math.floor(Date.now() / 1000)) }
  const query = Object.keys(signed).sort().map(k => `${k}=${encodeURIComponent(signed[k])}`).join('&')
  signed.w_rid = crypto.createHash('md5').update(query + mixinKey).digest('hex')
  return signed
}

/** 解析 B站视频/音频直链（优先 DASH 音频流——提取文案只需音频，且不受清晰度限制） */
export async function resolveBilibili(inputUrl: string): Promise<ResolvedVideoSource> {
  const bvid = extractBilibiliBvid(inputUrl)
  if (!bvid) throw new Error('无法从链接提取 B站 BV 号：' + inputUrl)

  // 匿名会话（finger/spi 拿 buvid3）→ 所有请求带 Cookie + Origin，防 412 风控
  const session = await getBilibiliSession()
  const apiHeaders = biliApiHeaders(session)

  // 1. view 接口拿 cid + 标题：优先普通接口；412/失败回退 WBI 签名版（wbi/view）
  let viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    headers: apiHeaders,
    signal: AbortSignal.timeout(workflowRuntimeParams().tools.videoUrlResolveTimeoutMs),
  })
  let view = viewRes.ok
    ? ((await viewRes.json()) as { code: number; data?: { cid?: number; title?: string } })
    : null
  if (!view || view.code !== 0) {
    // WBI 签名回退（新端点同样受签名保护）
    const signed = await bilibiliWbiSign({ bvid }, apiHeaders)
    const qs = new URLSearchParams(signed).toString()
    viewRes = await fetch(`https://api.bilibili.com/x/web-interface/wbi/view?${qs}`, {
      headers: apiHeaders,
      signal: AbortSignal.timeout(workflowRuntimeParams().tools.videoUrlResolveTimeoutMs),
    })
    if (!viewRes.ok) throw new Error('B站 view 接口失败')
    view = (await viewRes.json()) as { code: number; data?: { cid?: number; title?: string } }
  }
  if (view.code !== 0 || !view.data?.cid) {
    throw new Error(`B站视频信息获取失败（code=${view.code}；可能是分区限制或风控）`)
  }
  const cid = view.data.cid
  const title = view.data.title ?? bvid

  // 2. playurl（WBI 签名；fnval=16 开启 DASH）
  const signed = await bilibiliWbiSign({ bvid, cid: String(cid), fnval: '16', fourk: '1' }, apiHeaders)
  const qs = new URLSearchParams(signed).toString()
  const playRes = await fetch(`https://api.bilibili.com/x/player/wbi/playurl?${qs}`, {
    headers: apiHeaders,
    signal: AbortSignal.timeout(workflowRuntimeParams().tools.videoUrlResolveTimeoutMs),
  })
  if (!playRes.ok) throw new Error('B站 playurl 接口失败')
  const play = (await playRes.json()) as {
    code: number
    data?: {
      dash?: { audio?: Array<{ baseUrl?: string; backupUrl?: string[] }> }
      durl?: Array<{ url?: string }>
    }
  }
  if (play.code !== 0) throw new Error(`B站播放地址获取失败（code=${play.code}）`)

  // 优先 DASH 音频流（首个可用 baseUrl/backupUrl）
  let url = ''
  const audio = play.data?.dash?.audio ?? []
  if (audio.length > 0) {
    url = audio[0]?.baseUrl ?? audio[0]?.backupUrl?.[0] ?? ''
  }
  if (!url) {
    // 回退 durl 视频流（低清晰度）
    url = play.data?.durl?.[0]?.url ?? ''
  }
  if (!url) throw new Error('B站未返回可用媒体流（可能需要登录或分区限制）')

  return { kind: 'bilibili', url, headers: { Referer: BILI_REFERER, 'User-Agent': UA }, name: title }
}

/** 解析任意视频来源（URL 输入） */
export async function resolveVideoSource(rawUrl: string): Promise<ResolvedVideoSource> {
  const url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('仅支持 http(s) 视频链接（本地文件请用文件上传）')
  }
  const kind = detectVideoSource(url)
  if (kind === 'bilibili') {
    return resolveBilibili(url)
  }
  if (kind === 'douyin') {
    return {
      kind: 'douyin',
      url,
      headers: {},
      name: url,
      error: '抖音视频受平台风控且无公开下载 API，无法自动解析。请手动下载视频文件后在表单「视频文件」中上传（推荐）或使用其它可直链平台。',
    }
  }
  if (kind === 'unsupported') {
    return { kind: 'unsupported', url, headers: {}, name: url, error: `无法识别的视频链接：${url.slice(0, 80)}` }
  }
  // 视频扩展名直链：ffmpeg 直接拉流（带常见 UA 兜底）
  if (kind === 'direct') {
    const name = url.split('/').pop()?.split('?')[0] || 'video'
    return { kind: 'direct', url, headers: { 'User-Agent': UA }, name }
  }
  // 其它平台（YouTube/西瓜/微博/快手/小红书/优酷页面等）→ 需要 yt-dlp 后端
  const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
  return {
    kind: 'ytdlp',
    url,
    headers: {},
    name: host ? `视频链接（${host}）` : '视频链接',
  }
}
