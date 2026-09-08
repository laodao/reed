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

/** 页面默认抓取器：SSRF 校验 + 30s 超时 + 50MB 限长 */
export async function defaultPageFetcher(url: string): Promise<FetchedPage> {
  const guard = validateOutboundUrl(url)
  if (!guard.ok) throw new Error(`页面 URL 校验失败：${guard.reason}`)
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!resp.ok) throw new Error(`抓取失败: HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.byteLength > 50 * 1024 * 1024) throw new Error('页面超过 50MB 上限')
  return { url: resp.url || url, html: buf.toString('utf-8') }
}

export interface CollectWebpageInput {
  /** 目标网页 URL（metadata.sourceUrl 与相对资源基准） */
  url: string
  /** 标题；缺省从页面 <title>/og:title 提取 */
  title?: string
  /**
   * 已抓取的页面 HTML（运行页一键收藏传上游完整正文时用，跳过二次抓取）；
   * 缺省按 url 现抓。
   */
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
  /** 是否实际抓取页面（false = 使用了传入 html） */
  fetched: boolean
  /** 生成的 markdown 正文（供调用方提示字数等） */
  markdown: string
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
   */
  async collectWebpage(input: CollectWebpageInput): Promise<CollectWebpageResult> {
    const rawUrl = input.url.trim()
    if (!/^https?:\/\//i.test(rawUrl)) throw new Error('仅支持 http(s) 网页收藏')

    const fetched = input.html == null
    const page = fetched ? await this.fetchPage(rawUrl) : { url: rawUrl, html: input.html! }
    if (!page.html || !page.html.trim()) throw new Error('页面内容为空，无法收藏')

    // 1) 自包含归档（CSS/图片内联 + 静态化）
    const inlined = await inlineHtmlResources(page.html, {
      baseUrl: page.url,
      fetchResource: this.fetchResource,
    })

    // 2) markdown 正文（预剥噪声容器；相对链接基于页面 URL 解析）
    const markdown = htmlToMarkdown(inlined.html, page.url)

    // 3) 元数据与标题
    const title = input.title?.trim() || extractPageTitle(inlined.html) || titleFromUrl(page.url)
    const sourceRef = input.sourceRef?.trim() || null
    const nowIso = this.now().toISOString()
    const metadata: Record<string, unknown> = {
      sourceUrl: page.url,
      sourceTitle: title,
      fetchedAt: nowIso,
      ...(sourceRef ? { sourceRunId: sourceRef } : {}),
      ...(markdown ? { markdownChars: markdown.length } : {}),
    }

    const saveInput: SaveAssetInput = {
      category: WEBPAGE_COLLECT_CATEGORY,
      subCategory: WEBPAGE_COLLECT_SUB_CATEGORY,
      name: input.name?.trim() || `${title}.html`,
      description: input.description?.trim() || undefined,
      tags: input.tags ?? [],
      content: {
        kind: 'file',
        path: `data:text/html;base64,${Buffer.from(inlined.html, 'utf-8').toString('base64')}`,
      },
      // markdown 正文进 text_content 列（删除随行清理；预览以文件 html 为准）
      textContent: markdown || undefined,
      metadata,
      sourceType: input.sourceType || 'workflow',
      sourceRef: sourceRef ?? undefined,
    }
    const record = await this.assetService.createAsset(saveInput)
    return { record, warnings: inlined.warnings, fetched, markdown }
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
