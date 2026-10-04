/**
 * Pexels 真实素材 Provider
 * @module platform/providers/stock/pexels-stock
 * @description Pexels API（https://www.pexels.com/api/documentation/）：
 *              - 图片检索 GET /v1/search
 *              - 视频检索 GET /videos/search
 *              - 认证：请求头 Authorization: <API Key>（无 Bearer 前缀）
 *              授权：Pexels License —— 免费商用、无需署名（仍强制留痕出处与作者）。
 *              实测环境：本机可直连 api.pexels.com / images.pexels.com / videos.pexels.com。
 */

import type {
  StockMediaItem,
  StockMediaSearchRequest,
  StockMediaProviderId,
  StockProviderTestResult,
} from '@shared/types/stock-media.types'
import { BaseStockProvider, aspectOf } from './base-stock-provider'

/** Pexels 图片项（仅列本 provider 使用到的字段） */
interface PexelsPhoto {
  id: number
  width?: number
  height?: number
  url?: string
  photographer?: string
  photographer_url?: string
  alt?: string
  src?: Record<string, string>
}

/** Pexels 视频文件项 */
interface PexelsVideoFile {
  id?: number
  link?: string
  width?: number
  height?: number
  quality?: string
  file_type?: string
  size?: number
}

/** Pexels 视频项 */
interface PexelsVideo {
  id: number
  width?: number
  height?: number
  duration?: number
  url?: string
  image?: string
  user?: { name?: string; url?: string }
  video_files?: PexelsVideoFile[]
}

const PEXELS_BASE = 'https://api.pexels.com'

/**
 * 图片下载目标宽度：成片竖屏 1080×1920，且 9:16 裁切需要横向余量 → 取 1600px。
 * 说明：Pexels 的 large2x 直链带 `h=650&w=940` 参数，实测只有 940px 宽（成片会明显发虚），
 * 因此**不能**直接拿 large2x 当下载源；这里统一按 original 基址 + 尺寸参数取 1600px。
 */
const PEXELS_IMAGE_DOWNLOAD_WIDTH = 1600

/** 视频下载的清晰度偏好上限：超过 2160 宽（4K 竖屏）体积过大，收益有限 */
const PEXELS_VIDEO_MAX_WIDTH = 2160

/** 图片下载直链：original 基址 + 尺寸参数（去掉库里自带的固定尺寸参数） */
export function pexelsImageDownloadUrl(src: Record<string, string>): string {
  const base = String(src.original || src.large2x || src.large || '').split('?')[0]
  if (!base) return ''
  return `${base}?auto=compress&cs=tinysrgb&w=${PEXELS_IMAGE_DOWNLOAD_WIDTH}`
}

/** 画幅方向 → Pexels 入参（any 不传） */
function pexelsOrientation(o?: string): string | undefined {
  if (o === 'portrait' || o === 'landscape' || o === 'square') return o
  return undefined
}

/**
 * 从 Pexels 的多清晰度文件里挑一个：
 * 画幅一致优先 → 满足最小宽度且**不超上限**的里取最大的（画质优先）→ 只能超上限取最小 →
 * 都不满足最小宽度取最大（保真实素材，宁可用略低分辨率也不凭空生成）。
 */
function pickVideoFile(
  files: PexelsVideoFile[] | undefined,
  orientation: string | undefined,
  minWidth: number,
): PexelsVideoFile | undefined {
  const mp4 = (files || []).filter(f => f && f.link && String(f.file_type || '').includes('mp4'))
  if (mp4.length === 0) return undefined
  const wanted = orientation && orientation !== 'any' ? orientation : 'portrait'
  const sameAspect = mp4.filter(f => aspectOf(Number(f.width) || 0, Number(f.height) || 0) === wanted)
  const pool = sameAspect.length > 0 ? sameAspect : mp4
  const sorted = pool.slice().sort((a, b) => Number(a.width) - Number(b.width))
  const floor = minWidth > 0 ? minWidth : 0
  const withinFloor = sorted.filter(f => Number(f.width) >= floor)
  const capped = withinFloor.filter(f => Number(f.width) <= PEXELS_VIDEO_MAX_WIDTH)
  if (capped.length > 0) return capped[capped.length - 1]
  if (withinFloor.length > 0) return withinFloor[0]
  return sorted[sorted.length - 1]
}

export class PexelsStockProvider extends BaseStockProvider {
  get id(): StockMediaProviderId {
    return 'pexels'
  }

  get name(): string {
    return 'Pexels'
  }

  protected headers(): Record<string, string> {
    return { Authorization: String(this.config.apiKey || '').trim(), Accept: 'application/json' }
  }

  async searchImages(req: StockMediaSearchRequest): Promise<StockMediaItem[]> {
    const url = this.buildUrl(PEXELS_BASE, '/v1/search', {
      query: req.query,
      per_page: req.perPage,
      orientation: pexelsOrientation(req.orientation),
      size: 'large',
    })
    const data = await this.requestJson<{ photos?: PexelsPhoto[] }>(url, {
      method: 'GET',
      headers: this.headers(),
    })
    const items: StockMediaItem[] = []
    for (const p of data.photos || []) {
      const src = p.src || {}
      // 下载用 original 基址 + 1600px 参数（large2x 实测被库里固定参数压到 940px，成片会发虚）；
      // 预览/质检用 large（约 940px、几十 KB），避免素材板与 VLM 拉原图
      const downloadUrl = pexelsImageDownloadUrl(src)
      if (!downloadUrl) continue
      items.push({
        provider: 'pexels',
        id: String(p.id),
        kind: 'image',
        downloadUrl,
        previewUrl: src.large || src.medium || downloadUrl,
        width: Number(p.width) || 0,
        height: Number(p.height) || 0,
        pageUrl: p.url || `https://www.pexels.com/photo/${p.id}/`,
        author: p.photographer,
        authorUrl: p.photographer_url,
        license: 'pexels',
        title: p.alt,
      })
    }
    return items
  }

  async searchVideos(req: StockMediaSearchRequest): Promise<StockMediaItem[]> {
    const url = this.buildUrl(PEXELS_BASE, '/videos/search', {
      query: req.query,
      per_page: req.perPage,
      orientation: pexelsOrientation(req.orientation),
      size: 'medium',
    })
    const data = await this.requestJson<{ videos?: PexelsVideo[] }>(url, {
      method: 'GET',
      headers: this.headers(),
    })
    const items: StockMediaItem[] = []
    for (const v of data.videos || []) {
      const file = pickVideoFile(v.video_files, pexelsOrientation(req.orientation), Number(req.minWidth) || 0)
      if (!file || !file.link) continue
      items.push({
        provider: 'pexels',
        id: String(v.id),
        kind: 'video',
        downloadUrl: file.link,
        previewUrl: v.image || '',
        width: Number(file.width) || Number(v.width) || 0,
        height: Number(file.height) || Number(v.height) || 0,
        durationSec: Number(v.duration) || 0,
        pageUrl: v.url || `https://www.pexels.com/video/${v.id}/`,
        author: v.user?.name,
        authorUrl: v.user?.url,
        license: 'pexels',
        title: undefined,
      })
    }
    return items
  }

  async testConnection(): Promise<StockProviderTestResult> {
    if (!this.isConfigured()) return { success: false, message: '未填写 Pexels API Key' }
    try {
      const items = await this.searchImages({ query: 'container port', kind: 'image', perPage: 1 })
      return {
        success: items.length > 0,
        message: items.length > 0 ? `Pexels 可用（示例素材 #${items[0].id}）` : 'Pexels 返回空结果，请检查 Key 配额',
      }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
}