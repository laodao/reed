/**
 * 浏览器拟人阅读节点
 * @module core/platform/workflow/nodes/browser-read-node
 * @description web-extract 解决"JS 站点拿不到正文"；本节点解决"拿全 + 像人"：
 *              - 隐藏浏览器窗口（Chrome UA + 持久 session 免重复过反爬挑战）打开页面
 *              - 模拟真人阅读：随机步长滚动 + 随机停顿 + 小概率驻留，直到底部
 *                （头条等信息流页面的正文/图片/评论随滚动懒加载，不滚就取不全）
 *              - article 模式：滚动完取正文 markdown（正文容器保结构）+ 纯文本
 *              - links 模式：滚动加载列表页，按链接正则过滤采集（命中数达标即
 *                提前收工——"加载更多"不必滚到全量底部），供 loop 逐篇阅读
 *              - 全程串行节奏（礼貌随机间隔 + 滚动本身即慢速访问），配合引擎
 *                循环实现"一篇一篇抓取"的仿人采集
 *
 *              架构铁律：节点是服务的薄适配器——窗口/滚动/取回全部委托
 *              browser-render（readPageLikeHuman），正文提取复用 extra-nodes 的
 *              extractArticleContent / extractArticleMarkdown 同一套启发式。
 */

import type { WorkflowNodeContext, WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { validateOutboundUrl } from '@core/utils/outbound-url'
import { politePause } from './http-politeness'
import { getAssetService } from '../../assets/asset-registry'
import {
  BROWSER_READ_TIMEOUT_MAX_MS,
  readPageLikeHuman,
  type HumanScrollOptions,
  type PageLinkItem,
} from './browser-render'
import { extractArticleContent, extractArticleMarkdown, truncateTextSmart } from './extra-nodes'

/** 链接归一化（去重键）：去 hash、去尾斜杠，其余保持原样（query 有语义不可动） */
export function normalizeLinkUrl(u: string): string {
  let s = u.trim()
  try {
    const parsed = new URL(s)
    parsed.hash = ''
    s = parsed.toString()
  } catch { /* 非 URL 原样 */ }
  return s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s
}

/**
 * 页内采集链接 → 正则过滤 + 归一去重 + 排除自身 + 截断（保持 DOM 顺序——
 * 信息流列表即时间序，遍历顺序对"按价值取前 N"有语义）。
 * 正则非法时视为不过滤（链接全保留，validateConfig 已拦截常规情况）。
 */
export function filterHarvestedLinks(
  links: PageLinkItem[],
  opts: { pattern?: string; maxLinks: number; excludeUrls?: string[] },
): { links: PageLinkItem[]; dropped: number } {
  const max = Math.max(0, Math.floor(opts.maxLinks))
  let re: RegExp | null = null
  if (opts.pattern && opts.pattern.trim()) {
    try {
      re = new RegExp(opts.pattern.trim())
    } catch {
      re = null
    }
  }
  const exclude = new Set((opts.excludeUrls ?? []).map(normalizeLinkUrl).filter(Boolean))
  const seen = new Set<string>()
  const out: PageLinkItem[] = []
  let dropped = 0
  for (const l of links) {
    if (out.length >= max) break
    if (re && !re.test(l.url)) continue
    const key = normalizeLinkUrl(l.url)
    if (!key || exclude.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push({ url: l.url, title: l.title })
  }
  dropped = links.length - out.length
  return { links: out, dropped }
}

// ==================== 数值配置防御性读取（模板/字面量双形态） ====================

function numOf(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

// 对象字面量类型别名（非 interface）：与 ctx.config（Record<string, unknown>）的
// as 断言兼容（interface 无隐式索引签名会 TS2352，其余节点同为内联对象类型）
type BrowserReadConfig = {
  url: string
  mode?: 'article' | 'links'
  linkPattern?: string
  maxLinks?: number
  maxLength?: number
  onError?: 'fail' | 'skip'
  timeoutMs?: number
  scrollMaxMs?: number
  stepPxMin?: number
  stepPxMax?: number
  pauseMsMin?: number
  pauseMsMax?: number
  dwellChance?: number
  dwellMsMin?: number
  dwellMsMax?: number
  bottomSettleMs?: number
  delayMsMin?: number
  delayMsMax?: number
  /**
   * 跳过已收藏（可选，支持 {{模板}}）：填原文链接，资产库已存在同 url 资产时
   * 直接输出 skipped=true + deduped=true（不开浏览器不滚动）——采集类工作流
   * 续跑秒级快进已采条目，不必重新"阅读"一遍才发现重复。
   */
  skipIfUrlSaved?: string
}

const browserReadNode: WorkflowNodeHandler = {
  type: 'browser-read',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'title', type: 'string', desc: '页面标题' },
    { key: 'text', type: 'string', desc: '正文纯文本（article 模式）' },
    { key: 'markdown', type: 'string', desc: '正文 markdown（article 模式）' },
    { key: 'length', type: 'number', desc: '正文长度（markdown 与 text 取长者）' },
    { key: 'links', type: 'json', desc: '页面链接 [{ title, url }]（links 模式）' },
    { key: 'count', type: 'number', desc: '链接条数（links 模式）' },
    { key: 'finalUrl', type: 'string', desc: '最终 URL（重定向后）' },
    { key: 'scroll', type: 'json', desc: '滚动统计 { steps, totalPx, reachedBottom, durationMs, matchedLinks }' },
    { key: 'skipped', type: 'boolean', desc: '阅读失败被跳过（onError=skip 时输出空结果并置 true）' },
    { key: 'deduped', type: 'boolean', desc: '已收藏命中（skipIfUrlSaved 命中资产库同链接，未打开页面）' },
    { key: 'existingAssetId', type: 'string', desc: '命中时已存在资产的 ID' },
  ],
  validateConfig(config) {
    const cfg = config as BrowserReadConfig
    const errors: string[] = []
    const url = stringifyValue(cfg.url).trim()
    if (!url || !/^https?:\/\//i.test(url)) errors.push('url 必须是 http(s):// 开头的完整地址')
    const mode = cfg.mode ?? 'article'
    if (mode !== 'article' && mode !== 'links') errors.push('mode 只能是 article 或 links')
    const pattern = stringifyValue(cfg.linkPattern ?? '').trim()
    if (pattern) {
      try {
        new RegExp(pattern)
      } catch {
        errors.push('linkPattern 不是合法正则')
      }
    }
    const maxLinks = numOf(cfg.maxLinks)
    if (maxLinks !== undefined && (maxLinks < 0 || maxLinks > 500)) errors.push('maxLinks 需在 0-500 之间')
    const maxLength = numOf(cfg.maxLength)
    if (maxLength !== undefined && maxLength <= 0) errors.push('maxLength 必须大于 0')
    const timeoutMs = numOf(cfg.timeoutMs)
    if (timeoutMs !== undefined && (timeoutMs < 1_000 || timeoutMs > BROWSER_READ_TIMEOUT_MAX_MS)) {
      errors.push(`timeoutMs 需在 1000-${BROWSER_READ_TIMEOUT_MAX_MS} 之间`)
    }
    for (const [minKey, maxKey, label] of [
      ['stepPxMin', 'stepPxMax', '滚动步长'],
      ['pauseMsMin', 'pauseMsMax', '步间停顿'],
      ['dwellMsMin', 'dwellMsMax', '驻留时长'],
      ['delayMsMin', 'delayMsMax', '随机间隔'],
    ] as const) {
      const min = numOf(cfg[minKey])
      const max = numOf(cfg[maxKey])
      if (min !== undefined && max !== undefined && min > max) errors.push(`${label}下限不能大于上限`)
    }
    const dwell = numOf(cfg.dwellChance)
    if (dwell !== undefined && (dwell < 0 || dwell > 1)) errors.push('dwellChance 需在 0-1 之间')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as BrowserReadConfig
    const mode: 'article' | 'links' = cfg.mode ?? 'article'
    const onError: 'fail' | 'skip' = cfg.onError ?? 'fail'
    const skipResult = () => ({
      status: 'succeeded' as const,
      output: {
        title: '', text: '', markdown: '', length: 0, links: [], count: 0,
        finalUrl: '', scroll: null, skipped: true,
      },
    })

    // SSRF：url 可经 {{模板}} 注入（校验失败属配置问题，不静默吞掉）
    const url = stringifyValue(cfg.url).trim()
    const guard = validateOutboundUrl(url)
    if (!guard.ok) {
      return { status: 'failed', error: `URL 校验失败：${guard.reason}`, retryable: false }
    }

    // 已收藏快进：资产库存在同链接 → 不开浏览器（采集续跑秒级跳过已采条目）
    const skipIfUrlSaved = stringifyValue(cfg.skipIfUrlSaved ?? '').trim()
    if (skipIfUrlSaved) {
      const existing = await getAssetService().findAssetByUrl(skipIfUrlSaved)
      if (existing) {
        ctx.logger.info(`[browser-read] 已收藏跳过：${skipIfUrlSaved}（asset ${existing.id}）`)
        return {
          status: 'succeeded',
          output: {
            title: existing.name, text: '', markdown: '', length: 0, links: [], count: 0,
            finalUrl: skipIfUrlSaved, scroll: null, skipped: true, deduped: true, existingAssetId: existing.id,
          },
        }
      }
    }

    // 礼貌节奏：与 web-extract 共享同站限速（跨节点共享队列）
    await politePause({ delayMsMin: numOf(cfg.delayMsMin), delayMsMax: numOf(cfg.delayMsMax) })

    const maxLinks = numOf(cfg.maxLinks) ?? 50
    const scroll: HumanScrollOptions = {}
    const scrollMaxMs = numOf(cfg.scrollMaxMs)
    if (scrollMaxMs !== undefined && scrollMaxMs > 0) scroll.maxDurationMs = scrollMaxMs
    for (const key of ['stepPxMin', 'stepPxMax', 'pauseMsMin', 'pauseMsMax', 'dwellChance', 'dwellMsMin', 'dwellMsMax', 'bottomSettleMs'] as const) {
      const v = numOf(cfg[key])
      if (v !== undefined) scroll[key] = v
    }
    const pattern = stringifyValue(cfg.linkPattern ?? '').trim()
    // links 模式：正则同时充当"加载够了"提前收工条件（命中数 ≥ maxLinks 即停）
    if (mode === 'links' && pattern && maxLinks > 0) {
      scroll.linkPattern = pattern
      scroll.minLinks = maxLinks
    }

    const result = await readPageLikeHuman(url, {
      signal: ctx.signal,
      timeoutMs: numOf(cfg.timeoutMs),
      scroll,
    })
    if (!result.ok) {
      if (onError === 'skip') return skipResult()
      return { status: 'failed', error: `浏览器阅读失败：${result.error}`, retryable: true }
    }
    ctx.logger.info(
      `[browser-read] ${url} → steps=${result.scroll.steps} px=${result.scroll.totalPx} bottom=${result.scroll.reachedBottom} ${result.scroll.durationMs}ms`,
    )

    if (mode === 'links') {
      const { links } = filterHarvestedLinks(result.links, { pattern, maxLinks, excludeUrls: [result.finalUrl, url] })
      return {
        status: 'succeeded',
        output: {
          title: result.title,
          text: '',
          markdown: '',
          length: 0,
          links,
          count: links.length,
          finalUrl: result.finalUrl,
          scroll: result.scroll,
        },
      }
    }

    // article 模式：同一套启发式出 纯文本 + markdown 双形态（下游按需取用）
    const { title: textTitle, text } = extractArticleContent(result.html)
    const { title: mdTitle, markdown } = extractArticleMarkdown(result.html, result.finalUrl)
    const maxLength = numOf(cfg.maxLength) ?? 150_000
    const md = markdown.length > maxLength ? truncateTextSmart(markdown, maxLength) : markdown
    const plain = text.length > maxLength ? truncateTextSmart(text, maxLength) : text
    return {
      status: 'succeeded',
      output: {
        title: mdTitle || textTitle || result.title,
        text: plain,
        markdown: md,
        length: Math.max(md.length, plain.length),
        links: [],
        count: 0,
        finalUrl: result.finalUrl,
        scroll: result.scroll,
      },
    }
  },
}

export const BROWSER_READ_NODE_HANDLERS: WorkflowNodeHandler[] = [browserReadNode]
