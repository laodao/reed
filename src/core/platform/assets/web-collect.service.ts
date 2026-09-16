/**
 * 网页收藏服务：把网页归档为资产中心的「网页收藏」资产
 * @module core/platform/assets/web-collect.service
 * @description 一个网页收藏 = 一条资产记录（document 大类 + 网页收藏 分类）：
 *              - 磁盘文件：single-file 自包含 HTML（CSS/图片内联，离线原样打开）
 *              - text_content 列：markdown 正文（精读 / 一键入知识库，免二次抓取）
 *              - metadata：sourceUrl / sourceTitle / fetchedAt / 来源 run
 *
 *              抓取/内联资源逐个走 SSRF 白名单与限长；失败不阻断，warnings 带回。
 *              依赖注入（页面抓取器 / 资源抓取器）便于单测与限速定制。
 */
import { validateOutboundUrl } from '@core/utils/outbound-url'
import { assetParams } from '@shared/utils/asset-params'
import { htmlToMarkdown } from '@core/utils/html-to-markdown'
import { inlineHtmlResources, defaultWebResourceFetcher, type WebResourceFetcher } from './single-file-html'
import type { AssetRecord, AssetSourceType, SaveAssetInput } from '@shared/types/asset.types'
import type { AssetService } from './asset.service'

/** 「网页收藏」资产固定归属 */
export const WEBPAGE_COLLECT_SUB_CATEGORY = '网页收藏'
const WEBPAGE_COLLECT_CATEGORY = 'document' as const

/** 页面抓取结果 */
export interface FetchedPage {
  /** 最终 URL（重定向后；内联相对资源基准） */
  url: string
  /** 页面 HTML 文本 */
  html: string
}

export type PageFetcher = (url: string) => Promise<FetchedPage>

/** 页面默认抓取器：SSRF 校验 + 超时/限长（走「参数设置 → 素材与图片 → 素材下载与网页收藏」） */
export async function defaultPageFetcher(url: string): Promise<FetchedPage> {
  const guard = validateOutboundUrl(url)
  if (!guard.ok) throw new Error(`页面 URL 校验失败：${guard.reason}`)
  const { collectTimeoutMs, maxCollectBytes } = assetParams().asset
  const resp = await fetch(url, { signal: AbortSignal.timeout(collectTimeoutMs) })
  if (!resp.ok) throw new Error(`抓取失败: HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.byteLength > maxCollectBytes) {
    throw new Error(`页面超过 ${Math.round(maxCollectBytes / 1024 / 1024)}MB 上限`)
  }
  return { url: resp.url || url, html: buf.toString('utf-8') }
}

export interface CollectWebpageInput {
  /** 目标网页 URL（幂等键与 metadata.sourceUrl；资源相对解析基于最终页） */
  url: string
  /**
   * 已收藏过同一 URL 时的策略：
   * - skip（缺省）：跳过，不新建也不改写（跑流程重复爬网不会重复入池）
   * - replace：就地刷新快照（同一资产 ID 更新 html/markdown/抓取时间）
   */
  existingPolicy?: 'skip' | 'replace'
  /** 标题；缺省从页面 <title>/og:title 提取 */
  title?: string
  /** 已抓取的页面 HTML（运行页一键收藏传上游完整正文时用，跳过二次抓取）；缺省按 url 现抓 */
  html?: string
  /** 资产名；缺省 <标题>.html */
  name?: string
  description?: string
  tags?: string[]
  sourceType?: AssetSourceType | string
  sourceRef?: string
}

export interface CollectWebpageResult {
  record: AssetRecord
  warnings: string[]
  /** 是否实际抓取页面（false = 使用了传入 html 或命中已有档直接跳过） */
  fetched: boolean
  /** 生成的 markdown 正文（供调用方提示字数等） */
  markdown: string
  /** 命中已有收藏且按策略跳过（true = 未产生任何写入/改写） */
  skipped: boolean
}

export interface WebCollectServiceDeps {
  assetService: AssetService
  /** 页面抓取器（缺省 defaultPageFetcher） */
  fetchPage?: PageFetcher
  /** 资源内联抓取器（缺省内置） */
  fetchResource?: WebResourceFetcher
  now?: () => Date
}

export class WebCollectService {
  private readonly assetService: AssetService
  private readonly fetchPage: PageFetcher
  private readonly fetchResource: WebResourceFetcher
  private readonly now: () => Date

  constructor(deps: WebCollectServiceDeps) {
    this.assetService = deps.assetService
    this.fetchPage = deps.fetchPage ?? defaultPageFetcher
    this.fetchResource = deps.fetchResource ?? defaultWebResourceFetcher
    this.now = deps.now ?? (() => new Date())
  }

  /**
   * 收藏网页：single-file html 落盘 + markdown 正文入库。
   * 幂等：同一 sourceUrl 已收藏时按 existingPolicy 跳过或就地刷新快照。
   */
  async collectWebpage(input: CollectWebpageInput): Promise<CollectWebpageResult> {
    const keyUrl = input.url.trim()
    if (!/^https?:\/\//i.test(keyUrl)) throw new Error('仅支持 http(s) 网页收藏')

    // 抓取前查重：跳过策略命中则不发任何网络请求、不产生写入
    const existing = await this.assetService.findWebCollectBySourceUrl(keyUrl)
    const policy = input.existingPolicy ?? 'skip'
    if (existing && policy === 'skip') {
      return {
        record: existing,
        warnings: [],
        fetched: false,
        markdown: existing.textContent ?? '',
        skipped: true,
      }
    }

    const fetched = input.html == null
    const page = fetched ? await this.fetchPage(keyUrl) : { url: keyUrl, html: input.html! }
    if (!page.html || !page.html.trim()) throw new Error('页面内容为空，无法收藏')

    // 1) 自包含归档（CSS/图片内联 + 静态化）
    const inlined = await inlineHtmlResources(page.html, {
      baseUrl: page.url,
      fetchResource: this.fetchResource,
    })

    // 2) markdown 正文（预剥噪声容器；相对链接基于页面 URL 解析）
    const markdown = htmlToMarkdown(inlined.html, page.url)

    // 3) 元数据与标题：sourceUrl 固定存输入 URL（幂等键稳定，重定向 final 只作资源基准）
    const title = input.title?.trim() || extractPageTitle(inlined.html) || titleFromUrl(keyUrl)
    const sourceRef = input.sourceRef?.trim() || null
    const nowIso = this.now().toISOString()
    const metadata: Record<string, unknown> = {
      sourceUrl: keyUrl,
      sourceTitle: title,
      fetchedAt: nowIso,
      ...(sourceRef ? { sourceRunId: sourceRef } : {}),
      ...(markdown ? { markdownChars: markdown.length } : {}),
    }
    const dataUrl = `data:text/html;base64,${Buffer.from(inlined.html, 'utf-8').toString('base64')}`

    // 4) 写入：首次收藏建新资产；已存在（replace 策略）就地刷新同一记录
    if (existing && policy === 'replace') {
      const updated = await this.assetService.updateAssetContent(existing.id, {
        dataUrl,
        name: input.name?.trim() || undefined, // 缺省保留原名
        textContent: markdown || null,
        metadata,
        sourceRef: sourceRef ?? undefined,
      })
      if (!updated) throw new Error(`资产更新失败: ${existing.id}`)
      return { record: updated, warnings: inlined.warnings, fetched, markdown, skipped: false }
    }

    const saveInput: SaveAssetInput = {
      category: WEBPAGE_COLLECT_CATEGORY,
      subCategory: WEBPAGE_COLLECT_SUB_CATEGORY,
      name: input.name?.trim() || `${title}.html`,
      description: input.description?.trim() || undefined,
      tags: input.tags ?? [],
      content: { kind: 'file', path: dataUrl },
      // 源链接同时入 url 列：普通列等值查询做幂等键（免 JSON/LIKE 扫描）
      url: keyUrl,
      // markdown 正文进 text_content 列（删除随行清理；预览以文件 html 为准）
      textContent: markdown || undefined,
      metadata,
      sourceType: input.sourceType || 'workflow',
      sourceRef: sourceRef ?? undefined,
    }
    const record = await this.assetService.createAsset(saveInput)
    return { record, warnings: inlined.warnings, fetched, markdown, skipped: false }
  }

  /**
   * 刷新已有收藏的快照（资产中心「更新快照」）：
   * 按记录 metadata.sourceUrl 重新抓取并就地更新同一资产（不新建、不产生孤儿文件）。
   */
  async refreshExisting(assetId: string): Promise<CollectWebpageResult> {
    const record = await this.assetService.getAsset(assetId)
    if (!record) throw new Error(`资产不存在: ${assetId}`)
    if (record.category !== WEBPAGE_COLLECT_CATEGORY || record.subCategory !== WEBPAGE_COLLECT_SUB_CATEGORY) {
      throw new Error('仅「网页收藏」资产可刷新快照')
    }
    const url = typeof record.metadata?.sourceUrl === 'string' ? record.metadata.sourceUrl : ''
    if (!/^https?:\/\//i.test(url)) throw new Error('该收藏缺少原始网页 URL，无法刷新')
    return this.collectWebpage({
      url,
      name: record.name, // 保留原标题（页面标题可能已变化，避免反复改名）
      tags: record.tags,
      sourceRef: record.sourceRef ?? undefined,
      existingPolicy: 'replace',
    })
  }
}

/** 从归档后 HTML 提取标题：og:title 优先，其次 <title> */
export function extractPageTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return (og?.[1] ?? title?.[1] ?? '').trim()
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    return `${host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return url
  }
}
