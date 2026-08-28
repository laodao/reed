/**
 * 扩展组件（第三批：模板转换 / 参数提取 / 网页正文提取）
 * @module core/modules/workflow/nodes/extra-nodes
 * @description 对齐 Dify/Bisheng 核心组件面：
 *              - template-transform：模板渲染文本（{{}} 插值拼接输出）
 *              - parameter-extractor：LLM 结构化参数抽取（声明字段 schema）
 *              - web-extract：URL → 网页正文提取（去脚本/样式/标签）
 */

import { callAIStream } from '../../../services/ai-call'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { WORKFLOW_DEFAULTS, WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import { parse } from 'node-html-parser'
import { validateOutboundUrl } from '@core/utils/outbound-url'
import { politeFetch } from './http-politeness'

// ==================== 模板转换 ====================

const templateTransformNode: WorkflowNodeHandler = {
  type: 'template-transform',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [{ key: 'text', type: 'string', desc: '渲染后的文本' }],
  validateConfig(config) {
    const cfg = config as { template?: string }
    if (stringifyValue(cfg.template).trim() === '') return ['模板内容不能为空']
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { template: string }
    // config 已深解析——但模板转换的语义恰是"把模板渲染成文本"，
    // 引擎深解析对单占位字符串会透传原值（非字符串转换场景），
    // 多占位会提前拼接。为保证确定性：单占位透传的对象会被 stringify
    const text = stringifyValue(cfg.template)
    return { status: 'succeeded', output: { text } }
  },
}

// ==================== 数组拼接（List 合并） ====================

const arrayMergeNode: WorkflowNodeHandler = {
  type: 'array-merge',
  // 纯同步计算（无 IO/无异步）→ control 级：像 assign 一样在 pump 内同步求值，
  // 不占 runningTasks（task 级 fire-and-forget 会让后续挂起节点 execute 不返回）
  controlKind: 'control',
  cancellable: false,
  outputSchema: [{ key: 'merged', type: 'json', desc: '按 sources 顺序拼接后的数组（非数组项跳过）' }],
  validateConfig(config) {
    const cfg = config as { sources?: unknown }
    if (!Array.isArray(cfg.sources) || cfg.sources.length === 0) {
      return ['sources 必须是非空数组（每个元素是 {{节点.数组}} 模板）']
    }
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { sources?: unknown[] }
    // sources 已由引擎 resolveConfigDeep 解析（每个元素可能是数组/undefined/其他）
    const merged: unknown[] = []
    for (const item of cfg.sources ?? []) {
      if (Array.isArray(item)) merged.push(...item)
    }
    return { status: 'succeeded', output: { merged } }
  },
}

// ==================== 参数提取（LLM 结构化抽取） ====================

/** 字段类型 → JSON Schema 描述 */
function jsonTypeOf(t: string | undefined): string {
  switch (t) {
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    default: return 'string'
  }
}

const parameterExtractorNode: WorkflowNodeHandler = {
  type: 'parameter-extractor',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: '*', type: 'json', desc: '按声明字段展开（{{本节点ID.字段名}}）' },
    { key: '_raw', type: 'string', desc: '模型原始回复' },
  ],
  validateConfig(config) {
    const cfg = config as { input?: string; fields?: Array<{ key: string }> }
    const errors: string[] = []
    if (stringifyValue(cfg.input).trim() === '') errors.push('待抽取内容不能为空')
    if (!cfg.fields || cfg.fields.length === 0) errors.push('至少声明一个抽取字段')
    else if (cfg.fields.some(f => !f.key?.trim())) errors.push('字段键不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      input: string
      instruction?: string
      fields: Array<{ key: string; type?: string; required?: boolean }>
      providerConfigId?: string
      modelId?: string
    }
    const input = stringifyValue(cfg.input)
    const schemaDesc = cfg.fields
      .map(f => `- "${f.key}": ${jsonTypeOf(f.type)}${f.required ? '（必填）' : '（可为 null）'}`)
      .join('\n')
    const systemPrompt = [
      '你是参数抽取器。从用户给的文本中抽取结构化参数，只输出一个 JSON 对象，不要任何解释或代码块标记。',
      `JSON 对象的 schema：\n${schemaDesc}`,
      cfg.instruction ? `抽取要求：${stringifyValue(cfg.instruction)}` : '',
      '文本中找不到的字段填 null。',
    ].filter(Boolean).join('\n\n')

    const { content } = await callAIStream({
      prompt: input,
      systemPrompt,
      providerConfigId: cfg.providerConfigId,
      modelId: cfg.modelId,
      signal: ctx.signal,
      onDelta: d => ctx.emitProgress(-1, d.slice(-30)),
    })

    let parsed: Record<string, unknown>
    try {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      parsed = JSON.parse((match ? match[1] : content).trim())
    } catch {
      return { status: 'failed', error: '参数抽取输出不是有效 JSON（可尝试在配置中给出更明确的抽取要求）', retryable: true }
    }
    // 必填校验
    for (const f of cfg.fields) {
      if (f.required && (parsed[f.key] === undefined || parsed[f.key] === null)) {
        return { status: 'failed', error: `必填字段「${f.key}」未能从文本中抽取`, retryable: true }
      }
    }
    return { status: 'succeeded', output: { ...parsed, _raw: content } }
  },
}

// ==================== 网页正文提取 ====================

/** 极简 HTML 正文提取：去脚本/样式/标签，压缩空白（兜底方案） */
function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  return { title: (titleMatch?.[1] ?? '').trim(), text: cleaned }
}

// ==================== 正文提取（启发式：文本密度选主内容容器） ====================

/** 噪声标签：站级导航/交互/元信息，其文本不是正文，直接移除 */
const ARTICLE_NOISE_TAGS = [
  'script', 'style', 'noscript', 'iframe', 'form', 'button', 'input', 'select', 'textarea',
  'nav', 'footer', 'header', 'aside', 'svg', 'canvas', 'template',
]

/** 正文候选块级标签（按文本密度评分选主内容容器） */
const ARTICLE_BLOCK_TAGS = new Set(['article', 'main', 'section', 'div', 'td', 'blockquote'])

/** 标题提取：og:title 优先，其次 <title> */
function extractDocumentTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i)
  const doc = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return (og?.[1] ?? doc?.[1] ?? '').trim()
}

/** 元素内全部链接文本长度（评估链接密集度：正文容器链接占比应低） */
function linkTextLengthOf(el: HTMLElement): number {
  let n = 0
  for (const a of el.querySelectorAll('a')) {
    n += (a.textContent ?? '').replace(/\s+/g, '').length
  }
  return n
}

/** 元素内非链接正文长度（= 总文本 − 链接文本；正文判据用非链接文本更准确） */
function nonLinkTextLengthOf(el: HTMLElement): number {
  const total = (el.textContent ?? '').replace(/\s+/g, '').length
  return Math.max(0, total - linkTextLengthOf(el))
}

/**
 * 文本密度启发式选正文容器：
 * 正文长度 = 非链接文本；density = 正文长度 / 链接文本长度（链接越少越像正文），
 * 结合长度取最高分；正文 <100 字不作为容器（导航/相关阅读列表等链接块除外）。
 */
function pickMainContent(root: HTMLElement): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestDensity = 0
  let bestLen = 0
  const walk = (el: HTMLElement) => {
    const tag = el.tagName?.toLowerCase() ?? ''
    if (ARTICLE_BLOCK_TAGS.has(tag)) {
      const len = nonLinkTextLengthOf(el)
      if (len >= 100) {
        const linkLen = linkTextLengthOf(el)
        const density = linkLen === 0 ? len : len / linkLen
        if (density > bestDensity || (density === bestDensity && len > bestLen)) {
          bestDensity = density
          bestLen = len
          best = el
        }
      }
    }
    for (const child of el.childNodes) {
      if (child.nodeType === 1) walk(child as HTMLElement)
    }
  }
  walk(root)
  return best
}

/**
 * 正文容器 → 结构化文本：段落/标题/列表项换行输出；
 * 跳过链接文本与"链接密集子块"（相关阅读/导航残留），避免按钮、评论混入。
 */
function containerText(el: HTMLElement): string {
  const parts: string[] = []
  const collect = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue
      const c = child as HTMLElement
      const tag = c.tagName?.toLowerCase() ?? ''
      if (tag === 'a') continue // 链接文本不作为正文
      // 链接密集子块（相关阅读/评论入口等）跳过：文本短且链接占大头
      if (['div', 'section', 'ul', 'ol', 'aside'].includes(tag)) {
        const text = (c.textContent ?? '').replace(/\s+/g, '')
        const linkLen = linkTextLengthOf(c)
        if (text.length < 200 && linkLen > 0 && linkLen / Math.max(1, text.length) > 0.4) continue
        if (text.length < 100 && linkLen > 0) continue
      }
      if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'br', 'tr'].includes(tag)) {
        const t = (c.textContent ?? '').trim()
        if (t) parts.push(t)
      } else {
        collect(c)
      }
    }
  }
  collect(el)
  return parts.join('\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
}

/**
 * 正文提取（启发式，替代"抓全部文字"）：
 * 移除导航/按钮/评论等噪声 → 文本密度选正文容器 → 结构化文本（段落换行）。
 * 标题：正文容器内 h1 优先（比 <title> 准确），否则 og:title / <title>。
 * 无正文容器或正文过短（页面无文章）→ 回退极简 htmlToText（保持兼容）。
 */
export function extractArticleContent(html: string): { title: string; text: string } {
  const fallback = htmlToText(html)
  const docTitle = extractDocumentTitle(html) // og:title > <title>
  try {
    const root = parse(html)
    for (const tag of ARTICLE_NOISE_TAGS) {
      for (const el of root.querySelectorAll(tag)) el.remove()
    }
    const main = pickMainContent(root)
    if (!main) return { title: docTitle, text: fallback.text }
    const text = containerText(main)
    if (text.length < 60) return { title: docTitle, text: fallback.text } // 正文太短视为噪声残留
    const h1 = main.querySelector('h1')
    const h1Text = (h1?.textContent ?? '').trim()
    return { title: h1Text || docTitle, text }
  } catch {
    return { title: docTitle, text: fallback.text }
  }
}

/**
 * 智能截断：在内容预算（max − 标记长度）内从后往前找句末/段落边界，
 * 找到则在边界处截断（不切半句子）；无句末边界回退软边界（空格/逗号/顿号），
 * 最后才硬切；始终追加「…[已截断]」标记。
 */
export function truncateTextSmart(text: string, max: number): string {
  if (text.length <= max) return text
  const marker = '…[已截断]'
  const contentBudget = max - marker.length
  if (contentBudget <= 0) return marker
  const searchable = text.slice(0, contentBudget)
  // 1. 句末/段落边界（取最后一个）
  let cut = -1
  const re = /[。！？!?；;\n]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(searchable)) !== null) cut = m.index
  if (cut >= 0) return searchable.slice(0, cut + 1) + marker
  // 2. 软边界（空格/逗号/顿号；切掉分隔符本身）
  let softCut = -1
  const soft = /[\s，,、]/g
  let sm: RegExpExecArray | null
  while ((sm = soft.exec(searchable)) !== null) softCut = sm.index
  if (softCut >= 0) return searchable.slice(0, softCut) + marker
  // 3. 无任何边界 → 硬切
  return searchable + marker
}

const webExtractNode: WorkflowNodeHandler = {
  type: 'web-extract',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'title', type: 'string', desc: '页面标题' },
    { key: 'text', type: 'string', desc: '正文文本' },
    { key: 'length', type: 'number', desc: '文本长度' },
    { key: 'links', type: 'json', desc: '页面内链接 [{ title, url }]（去重/过滤，最多 maxLinks 条）' },
    { key: 'skipped', type: 'boolean', desc: '抓取失败被跳过（onError=skip 时输出空结果并置 true）' },
  ],
  validateConfig(config) {
    const cfg = config as { url?: string }
    if (!cfg.url || !/^https?:\/\//.test(String(cfg.url))) return ['url 必须是 http(s):// 开头的完整地址']
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      url: string
      maxLength?: number
      maxLinks?: number
      /** 爬取礼貌（可选，缺省走工作流默认）：请求前随机间隔 / 同站并发 */
      delayMsMin?: number
      delayMsMax?: number
      hostConcurrency?: number
      /**
       * 抓取失败处理策略（可选，默认 fail）：
       * - fail：节点失败（默认，报错并可能触发重试/fail 边）
       * - skip：返回空结果（title/text 为空、skipped=true），适合批量采集场景
       *   （如早报逐条抓取正文），单个链接不可达不阻断整个流程
       */
      onError?: 'fail' | 'skip'
    }
    const timeout = Math.min(WORKFLOW_DEFAULTS.httpRequestTimeoutMs, WORKFLOW_LIMITS.httpTimeoutMs)
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(timeout)])
    // onError=skip：抓取失败时返回空结果而非报错
    const skipResult = () => ({
      status: 'succeeded' as const,
      output: { title: '', text: '', length: 0, links: [], skipped: true },
    })
    let html: string
    try {
      // SSRF 防护：url 可经 {{模板}} 注入（内置应用"网页摘要入库"即 {{start.url}}）
      const guard = validateOutboundUrl(String(cfg.url))
      if (!guard.ok) {
        // SSRF/校验失败属配置问题，不因 onError=skip 静默吞掉
        return { status: 'failed', error: `URL 校验失败：${guard.reason}`, retryable: false }
      }
      // 礼貌抓取：同站单线程 + 随机间隔（跨节点共享限速）
      const res = await politeFetch(String(cfg.url), { signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; the-bot-workflow)' } }, {
        delayMsMin: cfg.delayMsMin,
        delayMsMax: cfg.delayMsMax,
        hostConcurrency: cfg.hostConcurrency,
      })
      if (!res.ok) {
        if (cfg.onError === 'skip') return skipResult()
        return { status: 'failed', error: `请求失败：HTTP ${res.status}` }
      }
      html = await res.text()
    } catch (e) {
      if (cfg.onError === 'skip') return skipResult()
      return { status: 'failed', error: `网页获取失败: ${e instanceof Error ? e.message : String(e)}` }
    }
    // 正文提取（启发式：文本密度选主内容容器，剔除导航/按钮/评论等噪声）
    const { title, text } = extractArticleContent(html)
    const max = cfg.maxLength && cfg.maxLength > 0 ? cfg.maxLength : 100_000
    // 智能截断：按句子/段落边界，不切半（内容完整性优先）
    const trimmed = text.length > max ? truncateTextSmart(text, max) : text
    const links = extractPageLinks(html, String(cfg.url), cfg.maxLinks ?? 30)
    return { status: 'succeeded', output: { title, text: trimmed, length: trimmed.length, links } }
  },
}

/**
 * 从 HTML 提取页面内链接列表（新闻首页/专栏页 → 条目候选）。
 * - 去重（按 href 归一化后的绝对 URL）
 * - 过滤：空/非 http(s)/javascript:/mailto:/纯锚点/站外忽略（站外保留，便于跨源抓取）
 * - 导航链接过滤：短文本（首页/资讯/更多/登录等菜单项）、纯图标/纯数字、href 指向站点根
 * - 社交/短内容平台过滤：x.com/twitter/facebook/instagram/youtube 等（普通 fetch 无正文，
 *   抓了也没文章内容——新闻正文采集场景应排除，避免 LLM 选中后抓取必失败）
 * - 新闻特征优先：标题较长或含日期/编号特征的链接排在前面（maxLinks 截断时优先保留真实条目）
 * - 最多 maxLinks 条（0 = 不提取）
 */

/** 社交/短内容平台域名：普通 HTTP 抓取拿不到文章正文（需登录/JS 渲染），正文采集场景排除 */
const SOCIAL_MEDIA_HOSTS = new Set([
  'x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 't.co',
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com',
  'instagram.com', 'www.instagram.com',
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'shorts',
  'weibo.com', 'weibo.cn', 'tieba.baidu.com',
  'tiktok.com', 'www.tiktok.com', 'threads.net', 'bsky.app', 'reddit.com', 'www.reddit.com',
])

function isSocialMediaUrl(absUrl: string): boolean {
  try {
    const host = new URL(absUrl).hostname.toLowerCase()
    return SOCIAL_MEDIA_HOSTS.has(host)
  } catch {
    return false
  }
}

export function extractPageLinks(html: string, baseUrl: string, maxLinks: number): Array<{ title: string; url: string }> {
  if (!maxLinks || maxLinks <= 0) return []
  const root = parse(html)
  const seen = new Set<string>()
  const out: Array<{ title: string; url: string }> = []
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }
  for (const a of root.querySelectorAll('a[href]')) {
    const href = (a.getAttribute('href') ?? '').trim()
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) continue
    let abs: string
    try {
      abs = new URL(href, baseUrl).href
    } catch {
      continue
    }
    if (!/^https?:\/\//i.test(abs)) continue
    if (seen.has(abs)) continue
    seen.add(abs)
    const title = (a.text ?? '').replace(/\s+/g, ' ').trim()
    if (!title) continue
    // 导航链接过滤（短菜单项/纯图标/纯数字）
    if (isNavLink(title, abs, base)) continue
    // 社交/短内容平台过滤（普通 fetch 无正文，排除避免下游抓取必失败）
    if (isSocialMediaUrl(abs)) continue
    out.push({ title: title.slice(0, 200), url: abs })
  }
  // 新闻特征优先：长标题/含日期或编号 → 前置；保持原顺序稳定
  out.sort((x, y) => newsScore(y) - newsScore(x))
  return out.slice(0, maxLinks)
}

/** 导航链接判定：短菜单项 / 纯符号 / 指向站点根路径 */
function isNavLink(title: string, absUrl: string, base: URL): boolean {
  const t = title.trim()
  if (!t) return true
  // 纯符号/纯数字/纯图标（emoji）
  if (/^[\d\s·\-—|/\\.,，。、()[\]{}<>《》""''【】★☆●○]+$/.test(t)) return true
  if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+$/u.test(t)) return true
  // 单字符且非汉字（如 '1'/'x'/'©'）→ 导航；单汉字（如 '上'/'读'）保留
  if (t.length === 1 && !/[\u4e00-\u9fff]/.test(t)) return true
  // 常见导航词（中英）
  const navWords = ['首页', '资讯', '新闻', '更多', '登录', '注册', '搜索', '关于', '联系我们', '设为首页', '加入收藏',
    'home', 'news', 'more', 'login', 'sign in', 'sign up', 'register', 'search', 'about', 'contact', 'menu', 'navigation', 'back', 'top']
  if (navWords.includes(t.toLowerCase())) return true
  // 指向站点根（首页/栏目根）的短链接
  try {
    const u = new URL(absUrl)
    if (u.origin === base.origin && (u.pathname === '/' || u.pathname === '')) return true
  } catch {
    /* 忽略解析失败 */
  }
  return false
}

/** 新闻特征打分：标题越长越像条目；含日期/编号特征加分 */
function newsScore(link: { title: string; url: string }): number {
  let score = 0
  const t = link.title
  if (t.length >= 8) score += 2
  else if (t.length >= 4) score += 1
  // 中文日期（2026年/08-23/8月23日）——位于标题开头（新闻头条常见格式）额外加分
  if (/\d{4}年|\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}日/.test(t)) score += 3
  if (/^\d{4}年|^\d{1,2}-\d{1,2}|^\d{1,2}月\d{1,2}日/.test(t)) score += 2
  // 编号/序号特征
  if (/^(第?[一二三四五六七八九十\d]+[章篇期集]|No\.?\s*\d+|#\d+)/.test(t)) score += 2
  return score
}

export const EXTRA_NODE_HANDLERS: WorkflowNodeHandler[] = [
  templateTransformNode,
  arrayMergeNode,
  parameterExtractorNode,
  webExtractNode,
]
