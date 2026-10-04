/**
 * 真实素材库 Provider 基类
 * @module platform/providers/stock/base-stock-provider
 * @description 统一"按语义检索真实版权素材"的接口：图片检索 / 视频检索 / 连接测试。
 *              各库（Pexels / Pixabay）入参名与响应结构不同，由子类各自映射；
 *              本基类负责统一入参裁剪、**统一硬过滤语义**（最小宽度 / 最小时长）与
 *              统一错误信息，保证上层（StockMediaService / 工作流节点）只面对一种形态。
 */

import type {
  StockMediaItem,
  StockMediaOrientation,
  StockMediaProviderId,
  StockMediaSearchRequest,
  StockProviderTestResult,
} from '@shared/types/stock-media.types'

/** provider 配置 */
export interface StockProviderConfig {
  /** API Key（Pexels / Pixabay 均为单值 Key） */
  apiKey: string
  /** 覆盖默认 baseUrl（代理/镜像场景） */
  baseUrl?: string
  /** fetch 注入点（单测注入假实现；缺省用全局 fetch） */
  fetchImpl?: typeof fetch
}

/** 默认单次检索条数（候选多了才有得挑，但要控制下载量） */
export const STOCK_DEFAULT_PER_PAGE = 8
/** 单次检索上限（防误配把一次检索放大成几十次下载） */
export const STOCK_MAX_PER_PAGE = 30

/** 把期望条数夹到合法区间 */
export function clampStockPerPage(perPage?: number): number {
  const n = Number(perPage)
  if (!Number.isFinite(n) || n <= 0) return STOCK_DEFAULT_PER_PAGE
  return Math.min(STOCK_MAX_PER_PAGE, Math.max(1, Math.floor(n)))
}

/**
 * 画幅方向归一：**缺省即竖屏**（短视频主场景），显式 'any'/'all' 才不限制。
 * 未知值按不限处理（宁可多给候选，也不因写错一个词就搜不到素材）。
 */
export function normalizeOrientation(o?: string): StockMediaOrientation {
  const v = String(o || '').trim().toLowerCase()
  if (!v || v === 'portrait' || v === 'vertical') return 'portrait'
  if (v === 'landscape' || v === 'horizontal') return 'landscape'
  if (v === 'square') return 'square'
  return 'any'
}

/** 按宽高判定画幅方向（过滤视频文件用） */
export function aspectOf(width: number, height: number): StockMediaOrientation {
  if (!width || !height || width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

export abstract class BaseStockProvider {
  protected readonly config: StockProviderConfig

  constructor(config: StockProviderConfig) {
    this.config = config
  }

  /** provider 标识（与素材库同名） */
  abstract get id(): StockMediaProviderId

  /** 展示名 */
  abstract get name(): string

  /** 图片检索（返回归一化素材，已按请求做硬过滤） */
  abstract searchImages(req: StockMediaSearchRequest): Promise<StockMediaItem[]>

  /** 视频检索（返回归一化素材，已按请求做硬过滤） */
  abstract searchVideos(req: StockMediaSearchRequest): Promise<StockMediaItem[]>

  /** 连接测试（用一次最小检索验证 Key 是否有效） */
  abstract testConnection(): Promise<StockProviderTestResult>

  /** 是否已配置 Key */
  isConfigured(): boolean {
    return String(this.config.apiKey || '').trim() !== ''
  }

  /**
   * 统一检索入口：校验 → 分派 → 硬过滤。
   * 过滤后为空但库内确有候选时，返回**最宽的一条**兜底——真实但略低分辨率的画面，
   * 在"配图相关性"目标下优于凭空生成；调用方可从 item 的 width 自行判断取舍。
   */
  async search(req: StockMediaSearchRequest): Promise<StockMediaItem[]> {
    const query = String(req.query || '').trim()
    if (!query) throw new Error('素材检索词（query）不能为空')
    if (!this.isConfigured()) throw new Error(`素材库「${this.name}」未配置 API Key`)
    const normalized: StockMediaSearchRequest = {
      ...req,
      query,
      kind: req.kind === 'video' ? 'video' : 'image',
      perPage: clampStockPerPage(req.perPage),
      orientation: normalizeOrientation(req.orientation),
    }
    const raw =
      normalized.kind === 'video'
        ? await this.searchVideos(normalized)
        : await this.searchImages(normalized)
    const filtered = this.applyFilters(raw, normalized)
    if (filtered.length > 0) return filtered
    if (raw.length === 0) return []
    return [raw.slice().sort((a, b) => b.width - a.width)[0]]
  }

  /** 统一硬过滤：最小宽度、视频最小时长（库内参数名不同，这里兜底保证同语义） */
  protected applyFilters(items: StockMediaItem[], req: StockMediaSearchRequest): StockMediaItem[] {
    const minWidth = Number(req.minWidth) > 0 ? Number(req.minWidth) : 0
    const minDuration = Number(req.minDurationSec) > 0 ? Number(req.minDurationSec) : 0
    return items.filter(it => {
      if (!it || !it.downloadUrl) return false
      if (minWidth > 0 && it.width > 0 && it.width < minWidth) return false
      if (req.kind === 'video' && minDuration > 0 && Number(it.durationSec ?? 0) < minDuration) return false
      return true
    })
  }

  /** 拼 URL + query（各库 query 参数名不同，由子类给 params） */
  protected buildUrl(
    base: string,
    path: string,
    params?: Record<string, string | number | undefined>,
  ): string {
    const root = (this.config.baseUrl || base).replace(/\/+$/, '')
    const url = new URL(root + path)
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null || v === '') continue
      url.searchParams.set(k, String(v))
    }
    return url.toString()
  }

  /** 统一 JSON 请求（fetch 可注入；非 2xx 抛带响应片段的错误） */
  protected async requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const fetchImpl = this.config.fetchImpl ?? fetch
    const resp = await fetchImpl(url, init)
    const text = await resp.text()
    if (!resp.ok) {
      throw new Error(`${this.name} 接口返回 HTTP ${resp.status}：${text.slice(0, 200)}`)
    }
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(`${this.name} 接口返回非 JSON：${text.slice(0, 200)}`)
    }
  }
}