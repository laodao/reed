/**
 * Markdown 渲染共用管线（33 号实测反馈：Agent 对话页输出要渲染不要原始文本）
 * @module renderer/utils/markdown
 *
 * 管线：提取代码块占位 → marked 解析 → sanitizeHtml 消毒 → 还原代码块。
 * 消毒放在还原之前：占位符是纯文本标记可安全穿越 DOMParser，而代码块 HTML 是
 * 本工具自己生成的可信产物（依赖 class 样式），不应被白名单剥掉 class。
 * 代码块提取/还原复用 chat/code-block.ts（聊天页同一套占位符机制）。
 */

import { marked } from 'marked'
import { extractCodeBlocks, restoreCodeBlocks, escapeHtmlKeepPlaceholders } from '@/components/chat/code-block'
import { sanitizeHtml } from './sanitize-html'

export interface MarkdownRenderOptions {
  /** 自定义代码块渲染（缺省：语言标签 + pre/code，不含复制按钮） */
  renderCode?: (language: string, code: string, isOpen: boolean) => string
}

/** 缺省代码块渲染（只读展示；复制按钮需要事件委托，按需在各宿主自行注入） */
function defaultRenderCode(language: string, code: string, isOpen: boolean): string {
  const label = language || (isOpen ? 'text' : '')
  const tag = label ? `<div class="md-code-lang">${escapeHtmlKeepPlaceholders(label)}${isOpen ? ' · 输出中' : ''}</div>` : ''
  return `<div class="md-code-block">${tag}<pre><code>${escapeHtmlKeepPlaceholders(code)}</code></pre></div>`
}

/** markdown → 消毒后的 HTML（v-html 用） */
export function renderMarkdown(content: string, opts: MarkdownRenderOptions = {}): string {
  if (!content) return ''
  try {
    const { blocks, contentWithPlaceholders } = extractCodeBlocks(content)
    const renderCode = opts.renderCode ?? defaultRenderCode
    const renderer = new marked.Renderer()
    renderer.code = ({ text, lang }: { text: string; lang?: string }) => renderCode(lang || '', text, false)
    renderer.codespan = ({ text }: { text: string }) => `<code class="inline-code">${escapeHtmlKeepPlaceholders(text)}</code>`
    const parsed = marked.parse(contentWithPlaceholders, { breaks: true, gfm: true, renderer }) as string
    // 消毒在先（带着占位符过白名单）、还原代码块在后：还原出的代码块 HTML 是本工具
    // 生成的可信产物，依赖 class 样式，过消毒器会被剥掉 class（属性白名单无 class）。
    const sanitized = sanitizeHtml(parsed)
    return restoreCodeBlocks(sanitized, blocks, b => renderCode(b.language, b.code, !b.closed))
  } catch {
    return `<p>${escapeHtmlKeepPlaceholders(content).replace(/\n/g, '<br>')}</p>`
  }
}
