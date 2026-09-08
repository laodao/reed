/**
 * HTML → Markdown 转换（网页收藏归档 / 精读正文）
 * @module core/utils/html-to-markdown
 * @description turndown 封装：转换前用 node-html-parser 剥离脚本/样式/导航等
 *              站点级噪声容器（避免 turndown 把 script/style 内容当正文文本保留），
 *              保留标题/段落/列表/链接/图片/引用/代码块等结构，产出可精读的 md。
 */
import { parse } from 'node-html-parser'
import TurndownService from 'turndown'

/** 站点级噪声容器（与 web-extract 的 ARTICLE_NOISE_TAGS 同思路，此处自备避免跨模块耦合） */
const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'template', 'svg', 'canvas',
  'iframe', 'object', 'embed', 'form', 'button', 'input', 'select', 'textarea',
  'nav', 'header', 'footer', 'aside',
]

/**
 * 把 HTML 转为 Markdown。
 * 输入可为完整 <html> 文档或片段；非 HTML/空内容原样返回空串。
 * @param html 原始 HTML
 * @param baseUrl 可选：用于把相对链接/图片解析为绝对地址（默认保留相对原样）
 */
export function htmlToMarkdown(html: string, baseUrl?: string): string {
  if (!html || !html.trim()) return ''
  try {
    const root = parse(html)
    for (const tag of NOISE_SELECTORS) {
      for (const el of root.querySelectorAll(tag)) {
        el.remove()
      }
    }
    // 链接/图片相对地址 → 绝对（可选）
    if (baseUrl) {
      for (const a of root.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href')
        if (href && isHttpishRelative(href)) a.setAttribute('href', resolveHref(baseUrl, href))
      }
      for (const img of root.querySelectorAll('img[src]')) {
        const src = img.getAttribute('src')
        if (src && isHttpishRelative(src)) img.setAttribute('src', resolveHref(baseUrl, src))
      }
    }
    const cleaned = root.toString() || html
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      hr: '---',
    })
    td.remove(['script', 'style'])
    const md = td.turndown(cleaned)
    return (md ?? '').trim()
  } catch {
    // 解析失败时降级为纯文本清洗（至少去掉标签噪声）
    try {
      const root = parse(html)
      return (root.text ?? '').replace(/\n{3,}/g, '\n\n').trim()
    } catch {
      return html.replace(/<[^>]*>/g, '').trim()
    }
  }
}

function isHttpishRelative(href: string): boolean {
  return !/^(https?:|data:|mailto:|tel:|#|javascript:)/i.test(href)
}

function resolveHref(baseUrl: string, href: string): string {
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return href
  }
}
