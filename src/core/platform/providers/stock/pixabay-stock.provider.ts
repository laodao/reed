/**
 * Pixabay 真实素材 Provider
 * @module platform/providers/stock/pixabay-stock
 * @description Pixabay API（https://pixabay.com/api/docs/）：
 *              - 图片检索 GET /api/
 *              - 视频检索 GET /api/videos/
 *              - 认证：query 参数 key=<API Key>
 *              授权：Pixabay Content License —— 免费商用、无需署名（仍强制留痕出处与作者）。
 *
 *              说明：本 provider 按官方文档字段实现，**尚未实测**（当前环境只有 Pexels Key）。
 *              作为第二素材源保留：接口形状与 Pexels 完全一致（BaseStockProvider），
 *              配上 Key 即可启用；若字段与文档有出入，只需改本文件映射。
 */

import type {
  StockMediaItem,
  StockMediaSearchRequest,
  StockMediaProviderId,
  StockProviderTestResult,
} from '@shared/types/stock-media.types'
import { BaseStockProvider } from './base-stock-provider'

/** Pixabay 图片项 */
interface PixabayImageHit {
  id: number
  pageURL?: string
  tags?: string
  previewURL?: string
  webformatURL?: string
  largeImageURL?: string
  imageWidth?: number
  imageHeight?: number
  user?: string
}

/** Pixabay 视频单个清晰度 */
interface PixabayVideoRendition {
  url?: string
  width?: number
  height?: number
  size?: number
  thumbnail?: string
}

/** Pixabay 视频项 */
interface PixabayVideoHit {
  id: number
  pageURL?: string
  tags?: string
  duration?: number
  user?: string
  videos?: Record<string, PixabayVideoRendition | undefined>
}

const PIXABAY_BASE = 'https://pixabay.com'
/** 清晰度取用顺序（仅用于兜底遍历；实际按宽度择优） */
const RENDITION_ORDER = ['large', 'medium', 'small', 'tiny'] as const
/** 视频清晰度上限：超 2160 宽体积过大收益有限 */
const PIXABAY_VIDEO_MAX_WIDTH = 2160

/** 画幅方向 → Pixabay 入参（any 不传） */
function pixabayOrientation(o?: string): string | undefined {
  if (o === 'portrait') return 'vertical'
  if (o === 'landscape') return 'horizontal'
  return undefined
}

/**
 * 挑选清晰度：满足最小宽度且不超上限的里取**最大**（画质优先）→ 只能超上限取最小 →
 * 都不满足下限取最大。
 */
function pickRendition(
  videos: Record<string, PixabayVideoRendition | undefined> | undefined,
  minWidth: number,
): PixabayVideoRendition | undefined {
  const list = RENDITION_ORDER.map(k => videos?.[k]).filter((v): v is PixabayVideoRendition => !!v?.url)
  if (list.length === 0) return undefined
  const sorted = list.slice().sort((a, b) => Number(a.width) - Number(b.width))
  const floor = minWidth > 0 ? minWidth : 0
  const withinFloor = sorted.filter(v => Number(v.width) >= floor)
  const capped = withinFloor.filter(v => Number(v.width) <= PIXABAY_VIDEO_MAX_WIDTH)
  if (capped.length > 0) return capped[capped.length - 1]
  if (withinFloor.length > 0) return withinFloor[0]
  return sorted[sorted.length - 1]
}

export class PixabayStockProvider extends BaseStockProvider {
  get id(): StockMediaProviderId {
    return 'pixabay'
  }

  get name(): string {
    return 'Pixabay'
  }

  async searchImages(req: StockMediaSearchRequest): Promise<StockMediaItem[]> {
    const url = this.buildUrl(PIXABAY_BASE, '/api/', {
      key: String(this.config.apiKey || '').trim(),
      q: req.query,
      image_type: 'photo',
      orientation: pixabayOrientation(req.orientation),
      per_page: req.perPage,
      safesearch: 'true',
    })
    const data = await this.requestJson<{ hits?: PixabayImageHit[] }>(url, { method: 'GET' })
    const items: StockMediaItem[] = []
    for (const h of data.hits || []) {
      const downloadUrl = h.largeImageURL || h.webformatURL || ''
      if (!downloadUrl) continue
      items.push({
        provider: 'pixabay',
        id: String(h.id),
        kind: 'image',
        downloadUrl,
        previewUrl: h.webformatURL || h.previewURL || downloadUrl,
        width: Number(h.imageWidth) || 0,
        height: Number(h.imageHeight) || 0,
        pageUrl: h.pageURL || `https://pixabay.com/photos/${h.id}/`,
        author: h.user,
        license: 'pixabay',
        title: h.tags,
      })
    }
    return items
  }

  async searchVideos(req: StockMediaSearchRequest): Promise<StockMediaItem[]> {
    const url = this.buildUrl(PIXABAY_BASE, '/api/videos/', {
      key: String(this.config.apiKey || '').trim(),
      q: req.query,
      per_page: req.perPage,
      safesearch: 'true',
    })
    const data = await this.requestJson<{ hits?: PixabayVideoHit[] }>(url, { method: 'GET' })
    const items: StockMediaItem[] = []
    for (const h of data.hits || []) {
      const rendition = pickRendition(h.videos, Number(req.minWidth) || 0)
      if (!rendition?.url) continue
      items.push({
        provider: 'pixabay',
        id: String(h.id),
        kind: 'video',
        downloadUrl: rendition.url,
        previewUrl: rendition.thumbnail || '',
        width: Number(rendition.width) || 0,
        height: Number(rendition.height) || 0,
        durationSec: Number(h.duration) || 0,
        pageUrl: h.pageURL || `https://pixabay.com/videos/${h.id}/`,
        author: h.user,
        license: 'pixabay',
        title: h.tags,
      })
    }
    return items
  }

  async testConnection(): Promise<StockProviderTestResult> {
    if (!this.isConfigured()) return { success: false, message: '未填写 Pixabay API Key' }
    try {
      const items = await this.searchImages({ query: 'container port', kind: 'image', perPage: 3 })
      return {
        success: items.length > 0,
        message: items.length > 0 ? `Pixabay 可用（示例素材 #${items[0].id}）` : 'Pixabay 返回空结果，请检查 Key 配额',
      }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
}