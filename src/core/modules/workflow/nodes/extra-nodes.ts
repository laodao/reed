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

/** 极简 HTML 正文提取：去脚本/样式/标签，压缩空白 */
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

const webExtractNode: WorkflowNodeHandler = {
  type: 'web-extract',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'title', type: 'string', desc: '页面标题' },
    { key: 'text', type: 'string', desc: '正文文本' },
    { key: 'length', type: 'number', desc: '文本长度' },
    { key: 'links', type: 'json', desc: '页面内链接 [{ title, url }]（去重/过滤，最多 maxLinks 条）' },
  ],
  validateConfig(config) {
    const cfg = config as { url?: string }
    if (!cfg.url || !/^https?:\/\//.test(String(cfg.url))) return ['url 必须是 http(s):// 开头的完整地址']
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { url: string; maxLength?: number; maxLinks?: number }
    const timeout = Math.min(WORKFLOW_DEFAULTS.httpRequestTimeoutMs, WORKFLOW_LIMITS.httpTimeoutMs)
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(timeout)])
    let html: string
    try {
      const res = await fetch(String(cfg.url), { signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; the-bot-workflow)' } })
      if (!res.ok) return { status: 'failed', error: `请求失败：HTTP ${res.status}` }
      html = await res.text()
    } catch (e) {
      return { status: 'failed', error: `网页获取失败: ${e instanceof Error ? e.message : String(e)}` }
    }
    const { title, text } = htmlToText(html)
    const max = cfg.maxLength && cfg.maxLength > 0 ? cfg.maxLength : 100_000
    const trimmed = text.length > max ? text.slice(0, max) + '…[已截断]' : text
    const links = extractPageLinks(html, String(cfg.url), cfg.maxLinks ?? 30)
    return { status: 'succeeded', output: { title, text: trimmed, length: trimmed.length, links } }
  },
}

/**
 * 从 HTML 提取页面内链接列表（新闻首页/专栏页 → 条目候选）。
 * - 去重（按 href 归一化后的绝对 URL）
 * - 过滤：空/非 http(s)/javascript:/mailto:/纯锚点/站外忽略（站外保留，便于跨源抓取）
 * - 可见文本为空时用 URL 兜底
 * - 最多 maxLinks 条（0 = 不提取）
 */
export function extractPageLinks(html: string, baseUrl: string, maxLinks: number): Array<{ title: string; url: string }> {
  if (!maxLinks || maxLinks <= 0) return []
  const root = parse(html)
  const seen = new Set<string>()
  const out: Array<{ title: string; url: string }> = []
  for (const a of root.querySelectorAll('a[href]')) {
    if (out.length >= maxLinks) break
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
    out.push({ title: title.slice(0, 200), url: abs })
  }
  return out
}

export const EXTRA_NODE_HANDLERS: WorkflowNodeHandler[] = [
  templateTransformNode,
  parameterExtractorNode,
  webExtractNode,
]
