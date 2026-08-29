/**
 * 新闻采集节点（内置应用 C1 早报 / C2 周报的数据层）
 * @module core/modules/workflow/nodes/news-nodes
 * @description 极简采集：给定主题（预置源目录）或自定义 URL 列表 → 并发 fetch 各源首页 →
 *              提取页面内链接（web-extract 同款 extractPageLinks）→ 跨源合并去重。
 *
 *              不做 CSS 选择器配置、不做 JS 渲染、不做 RSS——任何能 fetch 到 HTML 的
 *              站点都可用；"哪些链接有价值"由下游 LLM 判断（这是通用性的来源）。
 *
 *              容错：单源失败跳过（记入 failedSources），不阻断整体；全部失败则节点失败。
 */

import { getNewsTopicSources } from '@shared/types/news-topics'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { WORKFLOW_DEFAULTS, WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import { extractPageLinks } from './extra-nodes'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { validateOutboundUrl } from '@core/utils/outbound-url'
import { politeFetch } from './http-politeness'

const UA = 'Mozilla/5.0 (compatible; the-bot-workflow)'

/** 解析输入源列表：预置主题 + 新闻来源库（sourceIds 多选）+ 自定义 URL（去重） */
export async function resolveSourceUrls(
  topicId: string | undefined,
  sourceIdsRaw: unknown,
  customUrlsRaw: unknown,
): Promise<Array<{ name: string; url: string }>> {
  const out: Array<{ name: string; url: string }> = []
  const seen = new Set<string>()
  const push = (name: string, url: string) => {
    const u = url.trim()
    // scheme 白名单 + 内网/环回/保留地址拦截（防 SSRF：Web 端多租户下
    // 自定义 URL 可被用来扫描内网/云元数据）
    const guard = validateOutboundUrl(u)
    if (!guard.ok || seen.has(u)) return
    seen.add(u)
    out.push({ name, url: u })
  }
  // 1. 新闻来源库（sourceIds 多选：用户设置页管理，工作流中直接选）
  const ids = parseSourceIds(sourceIdsRaw)
  if (ids.length > 0) {
    try {
      const db = getCoreDatabaseManager()
      if (db.newsSources) {
        const rows = await db.newsSources.listByIds(ids)
        for (const r of rows) push(r.name, r.url)
      }
    } catch (e) {
      // 来源库不可用时降级（不影响预置主题/自定义 URL 路径）
      console.warn('[crawl-news] 新闻来源库读取失败（降级）', e)
    }
  }
  // 2. 预置主题源（topicId）
  for (const s of getNewsTopicSources((topicId ?? '').trim())) {
    push(s.name, s.url)
  }
  // 3. 自定义 URL（JSON 数组（string[] 或 [{name,url}]）或逗号分隔）
  const raw = customUrlsRaw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return out
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') push(item, item)
          else if (item && typeof item === 'object') {
            const o = item as { name?: unknown; url?: unknown }
            if (typeof o.url === 'string') push(String(o.name ?? o.url), o.url)
          }
        }
      }
    } catch {
      // 非 JSON → 按换行/逗号拆 URL
      for (const u of trimmed.split(/[\n,]/)) {
        const clean = u.trim()
        if (clean) push(clean, clean)
      }
    }
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') push(item, item)
      else if (item && typeof item === 'object') {
        const o = item as { name?: unknown; url?: unknown }
        if (typeof o.url === 'string') push(String(o.name ?? o.url), o.url)
      }
    }
  }
  return out
}

/** 解析 sourceIds：字符串数组（JSON/逗号分隔）或数组 */
function parseSourceIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {
      // 非 JSON → 逗号分隔
      return trimmed.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    }
  }
  return []
}

const crawlNewsNode: WorkflowNodeHandler = {
  type: 'crawl-news',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'links', type: 'json', desc: '[{ title, url, source }] 跨源合并去重后的链接' },
    { key: 'count', type: 'number', desc: '链接总数' },
    { key: 'failedSources', type: 'json', desc: '抓取失败的源 [{ name, url, error }]' },
  ],
  validateConfig(config) {
    const cfg = config as { topicId?: string; sourceIds?: string; customUrls?: string }
    if (!cfg.topicId && !stringifyValue(cfg.sourceIds).trim() && !stringifyValue(cfg.customUrls).trim()) {
      return ['需要选择新闻来源（sourceIds）、预置主题（topicId）或提供自定义 URL（customUrls）']
    }
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      topicId?: string
      sourceIds?: string
      customUrls?: string
      maxLinks?: number
      maxSources?: number
      /** 爬取礼貌（可选，缺省走工作流默认）：请求前随机间隔 / 同站并发 */
      delayMsMin?: number
      delayMsMax?: number
      hostConcurrency?: number
    }
    const sources = await resolveSourceUrls(cfg.topicId, cfg.sourceIds, cfg.customUrls)
    if (sources.length === 0) {
      return { status: 'failed', error: '没有可抓取的来源（预置主题为空或自定义 URL 为空）', retryable: false }
    }
    // 并发上限保护：最多并行抓 maxSources 个源
    const maxSources = Math.min(cfg.maxSources && cfg.maxSources > 0 ? cfg.maxSources : 10, 10)
    const maxLinksPerSource = Math.min(cfg.maxLinks && cfg.maxLinks > 0 ? cfg.maxLinks : 30, 50)

    const timeout = Math.min(WORKFLOW_DEFAULTS.httpRequestTimeoutMs, WORKFLOW_LIMITS.httpTimeoutMs)
    const seen = new Set<string>()
    const links: Array<{ title: string; url: string; source: string }> = []
    const failedSources: Array<{ name: string; url: string; error: string }> = []

    const fetchOne = async (s: { name: string; url: string }) => {
      try {
        // 礼貌抓取：同站单线程 + 随机间隔（跨节点共享限速）
        const res = await politeFetch(s.url, {
          signal: AbortSignal.timeout(timeout),
          headers: { 'User-Agent': UA, Accept: 'text/html' },
        }, {
          delayMsMin: cfg.delayMsMin,
          delayMsMax: cfg.delayMsMax,
          hostConcurrency: cfg.hostConcurrency,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const html = await res.text()
        const pageLinks = extractPageLinks(html, s.url, maxLinksPerSource)
        for (const l of pageLinks) {
          if (seen.has(l.url)) continue
          seen.add(l.url)
          links.push({ ...l, source: s.name })
        }
        ctx.emitProgress(Math.round((links.length / (sources.length * maxLinksPerSource)) * 100))
      } catch (e) {
        failedSources.push({ name: s.name, url: s.url, error: e instanceof Error ? e.message : String(e) })
      }
    }

    // 分批并发（每批 maxSources 个），避免瞬时打爆所有源
    for (let i = 0; i < sources.length; i += maxSources) {
      const batch = sources.slice(i, i + maxSources)
      await Promise.all(batch.map(fetchOne))
    }

    if (links.length === 0 && failedSources.length > 0) {
      return {
        status: 'failed',
        error: `全部 ${failedSources.length} 个来源抓取失败（如 ${failedSources[0].name}: ${failedSources[0].error}）`,
        retryable: true,
      }
    }
    ctx.emitProgress(100)
    return {
      status: 'succeeded',
      output: { links, count: links.length, failedSources },
    }
  },
}

/**
 * 解析待抓取页面列表：JSON 数组（string[] 或 [{name,url}]）/ 运行时数组 /
 * 逗号换行分隔的 URL 列表；校验 http(s) 前缀并去重。
 *
 * 支持嵌套结构展平（LLM 分组输出场景，如「按来源分组，每来源最多 N 个栏目页」）：
 * - [{ source, items: [{title,url}] }] / [{ source, links: [...] }]：展平所有 items/links
 * - [{ name, url }] / [{ title, url }]：直接取 url
 * - string[]：元素即 URL
 */
export function parseUrlList(raw: unknown): Array<{ name: string; url: string }> {
  const out: Array<{ name: string; url: string }> = []
  const seen = new Set<string>()
  const push = (name: string, url: string) => {
    const u = url.trim()
    if (!u || !/^https?:\/\//i.test(u) || seen.has(u)) return
    // 与 crawl-news 的 resolveSourceUrls 一致：拦截内网/环回/保留地址（防 SSRF）。
    // crawl-links 的输入 URL 可能来自上游 LLM 输出或分享链访客，Web 端多租户下
    // 直接 fetch 内网/云元数据属高危面。
    const guard = validateOutboundUrl(u)
    if (!guard.ok) return
    seen.add(u)
    out.push({ name: name.trim() || u, url: u })
  }
  const walk = (item: unknown, fallbackName?: string): void => {
    if (typeof item === 'string') {
      push(item, item)
      return
    }
    if (!item || typeof item !== 'object') return
    const o = item as Record<string, unknown>
    // 嵌套数组优先展平（[{source, items:[...]}] / [{source, links:[...]}] 分组输出）
    const nested = Array.isArray(o.items) ? o.items : Array.isArray(o.links) ? o.links : null
    if (nested) {
      for (const child of nested) walk(child, typeof o.source === 'string' ? o.source : fallbackName)
      return
    }
    if (typeof o.url === 'string') {
      push(String(o.name ?? o.title ?? fallbackName ?? o.url), o.url)
    }
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return out
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        for (const item of parsed) walk(item)
        return out
      }
    } catch {
      /* 非 JSON → 按行/逗号拆 */
    }
    for (const u of trimmed.split(/[\n,]/)) {
      const clean = u.trim()
      if (clean) push(clean, clean)
    }
  } else if (Array.isArray(raw)) {
    for (const item of raw) walk(item)
  }
  return out
}

/** 批量抓取页面 → 提取页面内链接（两级采集第二步：专栏页/二级页 → 新闻链接） */
const crawlLinksNode: WorkflowNodeHandler = {
  type: 'crawl-links',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'links', type: 'json', desc: '[{ title, url, source }] 各页面链接合并去重' },
    { key: 'count', type: 'number', desc: '链接总数' },
    { key: 'failedUrls', type: 'json', desc: '抓取失败的页面 [{ url, error }]' },
  ],
  validateConfig(config) {
    const cfg = config as { urls?: unknown }
    const raw = cfg.urls
    const asText = typeof raw === 'string' ? raw.trim() : ''
    const asArr = Array.isArray(raw) ? raw : []
    if (!asText && asArr.length === 0) {
      return ['待抓取页面列表不能为空（JSON 数组或 {{节点.数组}} 模板）']
    }
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      urls: unknown
      maxLinks?: number
      maxConcurrent?: number
      timeoutMs?: number
      /** 爬取礼貌（可选，缺省走工作流默认）：请求前随机间隔 / 同站并发 */
      delayMsMin?: number
      delayMsMax?: number
      hostConcurrency?: number
    }
    const targets = parseUrlList(cfg.urls)
    if (targets.length === 0) {
      return { status: 'failed', error: '待抓取页面列表为空', retryable: false }
    }
    const maxLinksPerPage = Math.min(cfg.maxLinks && cfg.maxLinks > 0 ? cfg.maxLinks : 50, 100)
    const maxConcurrent = Math.min(
      cfg.maxConcurrent && cfg.maxConcurrent > 0 ? cfg.maxConcurrent : 5,
      10
    )
    const timeout = Math.min(
      cfg.timeoutMs && cfg.timeoutMs > 0 ? cfg.timeoutMs : WORKFLOW_DEFAULTS.httpRequestTimeoutMs,
      WORKFLOW_LIMITS.httpTimeoutMs
    )

    const seen = new Set<string>()
    const links: Array<{ title: string; url: string; source: string }> = []
    const failedUrls: Array<{ url: string; error: string }> = []

    const fetchOne = async (t: { name: string; url: string }) => {
      try {
        // 礼貌抓取：同站单线程 + 随机间隔（跨节点共享限速）
        const res = await politeFetch(t.url, {
          signal: AbortSignal.timeout(timeout),
          headers: { 'User-Agent': UA, Accept: 'text/html' },
        }, {
          delayMsMin: cfg.delayMsMin,
          delayMsMax: cfg.delayMsMax,
          hostConcurrency: cfg.hostConcurrency,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const html = await res.text()
        const pageLinks = extractPageLinks(html, t.url, maxLinksPerPage)
        for (const l of pageLinks) {
          if (seen.has(l.url)) continue
          seen.add(l.url)
          links.push({ ...l, source: t.name })
        }
      } catch (e) {
        failedUrls.push({ url: t.url, error: e instanceof Error ? e.message : String(e) })
      }
    }

    // 分批并发（每批 maxConcurrent 个）
    for (let i = 0; i < targets.length; i += maxConcurrent) {
      const batch = targets.slice(i, i + maxConcurrent)
      await Promise.all(batch.map(fetchOne))
    }

    if (links.length === 0 && failedUrls.length > 0) {
      return {
        status: 'failed',
        error: `全部 ${failedUrls.length} 个页面抓取失败（如 ${failedUrls[0].url}: ${failedUrls[0].error}）`,
        retryable: true,
      }
    }
    ctx.emitProgress(100)
    return {
      status: 'succeeded',
      output: { links, count: links.length, failedUrls },
    }
  },
}

/** 新闻类节点集合 */
export const NEWS_NODE_HANDLERS: WorkflowNodeHandler[] = [crawlNewsNode, crawlLinksNode]
