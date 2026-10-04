/**
 * 真实素材服务（stock media）
 * @module platform/services/stock-media
 * @description 「短视频脚本生成视频」配图真实素材链路的**唯一入口**：
 *              检索（多素材库 / 多备选检索词）→ 相关性选优（由上层用 VLM 打分）→ 下载落盘缓存。
 *
 *              设计要点：
 *              1. 只做"取回真实素材"，不做决策——选哪一条由上层（工作流节点）按相关性分决定；
 *              2. 下载落 `<dataPath>/stock-media/<provider>/<kind>/`，按 provider+id 命名做**幂等缓存**
 *                 （同一次脚本重跑 / 多次重试不重复下载）；
 *              3. 出处与授权信息随素材对象一路带回（provider / 素材 id / 作者 / 素材页 URL），
 *                 落卡片时强制留痕。
 */

import * as fs from 'fs'
import * as path from 'path'
import type {
  StockMediaDownload,
  StockMediaItem,
  StockMediaKind,
  StockMediaProviderId,
  StockMediaSearchRequest,
  StockProviderTestResult,
} from '@shared/types/stock-media.types'
import { getPathProvider } from '@core/interfaces/path.interface'
import { createStockProvider } from '@core/platform/providers/stock'

/** 素材缓存子目录（相对 dataPath） */
export const STOCK_MEDIA_CACHE_SUBDIR = 'stock-media'

/** 检索（含备选检索词轮流尝试）入参 */
export interface StockSearchOptions {
  provider: StockMediaProviderId
  apiKey: string
  request: StockMediaSearchRequest
  /** 首选检索词无结果时依次尝试（去重、去空） */
  altQueries?: string[]
  /** fetch 注入点（单测） */
  fetchImpl?: typeof fetch
}

/** 检索 + 下载候选入参 */
export interface StockFetchOptions extends StockSearchOptions {
  /** 最多下载几条候选（相关性选优的池子大小；默认 3） */
  maxDownloads?: number
  /** 覆盖 dataPath（单测注入） */
  dataPath?: string
}

/** 检索 + 下载结果 */
export interface StockFetchResult {
  /** 已落盘候选（按检索结果顺序） */
  downloads: StockMediaDownload[]
  /** 最终生效的检索词（备选命中时用于留痕） */
  queryUsed: string
  /** 依次尝试过的检索词 */
  queriesTried: string[]
  /** 下载失败条数（不阻断流程，仅留痕） */
  failed: number
}

/** 依据 Content-Type / URL 猜扩展名（决定落盘文件名，ffmpeg 依赖扩展名识别容器） */
export function guessMediaExt(contentType: string, url: string, kind: StockMediaKind): string {
  const ct = String(contentType || '').toLowerCase()
  if (ct.includes('video/mp4')) return 'mp4'
  if (ct.includes('video/webm')) return 'webm'
  if (ct.includes('video/quicktime')) return 'mov'
  if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return 'jpg'
  if (ct.includes('image/png')) return 'png'
  if (ct.includes('image/webp')) return 'webp'
  const m = String(url || '').split('?')[0].match(/\.([a-zA-Z0-9]{2,4})$/)
  if (m) return m[1].toLowerCase()
  return kind === 'video' ? 'mp4' : 'jpg'
}

/** 素材文件名（provider + kind + id + 扩展名；同素材幂等复用） */
export function stockFileName(item: StockMediaItem, ext: string): string {
  const safeId = String(item.id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '')
  return `${item.provider}_${item.kind}_${safeId}.${ext}`
}

/** 素材落盘相对目录 */
export function stockRelDir(provider: StockMediaProviderId, kind: StockMediaKind): string {
  return `${STOCK_MEDIA_CACHE_SUBDIR}/${provider}/${kind}`
}

/** 真实素材服务 */
export class StockMediaService {
  /**
   * 检索素材：按主检索词检索，无结果时依次尝试备选检索词。
   * 任一素材库报错（Key 无效/网络/配额）都会向调用方抛出——由节点决定是否降级到生成。
   */
  static async search(options: StockSearchOptions): Promise<{ items: StockMediaItem[]; queryUsed: string; queriesTried: string[] }> {
    const provider = createStockProvider(options.provider, {
      apiKey: options.apiKey,
      fetchImpl: options.fetchImpl,
    })
    const queries = buildQueryChain(options.request.query, options.altQueries)
    const tried: string[] = []
    for (const q of queries) {
      tried.push(q)
      const items = await provider.search({ ...options.request, query: q })
      if (items.length > 0) return { items, queryUsed: q, queriesTried: tried }
    }
    return { items: [], queryUsed: options.request.query, queriesTried: tried }
  }

  /**
   * 检索并下载候选素材（相关性选优用）。
   * 单条下载失败只记数不抛出——候选池少一条不影响整体降级链。
   */
  static async fetchCandidates(options: StockFetchOptions): Promise<StockFetchResult> {
    const { items, queryUsed, queriesTried } = await this.search(options)
    const max = Number(options.maxDownloads) > 0 ? Number(options.maxDownloads) : 3
    const downloads: StockMediaDownload[] = []
    let failed = 0
    for (const item of items.slice(0, max)) {
      try {
        downloads.push(await this.download(item, { dataPath: options.dataPath, fetchImpl: options.fetchImpl }))
      } catch {
        failed += 1
      }
    }
    return { downloads, queryUsed, queriesTried, failed }
  }

  /**
   * 下载单条素材到本地缓存目录（已存在则直接复用）。
   * 落盘相对路径入库、绝对路径给下游 ffmpeg/图生视频使用。
   */
  static async download(
    item: StockMediaItem,
    options?: { dataPath?: string; fetchImpl?: typeof fetch },
  ): Promise<StockMediaDownload> {
    const dataPath = options?.dataPath || getPathProvider().getDataPath()
    const relDir = stockRelDir(item.provider, item.kind)
    const absDir = path.join(dataPath, relDir)
    fs.mkdirSync(absDir, { recursive: true })

    const fetchImpl = options?.fetchImpl ?? fetch
    const resp = await fetchImpl(item.downloadUrl, { method: 'GET' })
    if (!resp.ok) throw new Error(`素材下载失败（HTTP ${resp.status}）：${item.downloadUrl}`)
    const buffer = Buffer.from(await resp.arrayBuffer())
    if (buffer.length === 0) throw new Error(`素材下载为空：${item.downloadUrl}`)

    const ext = guessMediaExt(resp.headers.get('content-type') || '', item.downloadUrl, item.kind)
    const fileName = stockFileName(item, ext)
    const absPath = path.join(absDir, fileName)
    fs.writeFileSync(absPath, buffer)
    return {
      item,
      relPath: `${relDir}/${fileName}`,
      absPath,
      bytes: buffer.length,
      cached: false,
    }
  }

  /** 连接测试（设置页/节点自检用） */
  static async testConnection(
    provider: StockMediaProviderId,
    apiKey: string,
    fetchImpl?: typeof fetch,
  ): Promise<StockProviderTestResult> {
    try {
      return await createStockProvider(provider, { apiKey, fetchImpl }).testConnection()
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
}

/** 检索词链：主词 + 备选（去重、去空、保序） */
export function buildQueryChain(primary: string, altQueries?: string[]): string[] {
  const out: string[] = []
  const push = (v: unknown): void => {
    const s = String(v ?? '').trim()
    if (s && !out.includes(s)) out.push(s)
  }
  push(primary)
  for (const a of altQueries || []) push(a)
  return out
}