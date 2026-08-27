/**
 * HTML 消毒工具（marked 渲染输出的安全网）
 * @module renderer/utils/sanitize-html
 * @description marked v17 透传原始 HTML，LLM/知识库/网页抓取来源的 markdown 可被
 *              提示注入污染（`<img onerror>` / `<script>` 等）。本工具用 DOMParser
 *              解析后按白名单重建：
 *              - 只保留展示性标签（结构/文本/表格/图片/链接）
 *              - 剥掉全部 on* 事件属性、javascript: URL、srcdoc
 *              - 脚本/iframe/object/embed/form 等危险标签直接拆掉（保留子内容）
 *
 *              双端：渲染端（PC/Web 共用同一 renderer）。
 */

/** 允许保留的标签白名单（大写 tagName；展示性标签，无脚本/表单/嵌入能力） */
const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'SPAN', 'BR', 'HR',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'MARK', 'SMALL', 'SUB', 'SUP',
  'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
  'BLOCKQUOTE', 'UL', 'OL', 'LI',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'A', 'IMG',
])

/** 属性白名单（key 为小写属性名） */
const ALLOWED_ATTRS = new Set(['href', 'title', 'alt', 'src', 'width', 'height', 'colspan', 'rowspan', 'align'])

/**
 * 消毒一段 HTML 字符串。
 * DOMParser 不可用（SSR/非浏览器）时原样返回（调用方应避免在该环境渲染 v-html）。
 */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html')

  // 自底向上遍历：危险标签拆散（子节点上提），白名单标签清属性
  const all = Array.from(doc.body.querySelectorAll('*'))
  for (const el of all) {
    const tag = el.tagName.toUpperCase()
    if (!ALLOWED_TAGS.has(tag)) {
      // 拆散危险标签（script/iframe/object/embed/form/...），保留其文本内容
      el.replaceWith(...Array.from(el.childNodes))
      continue
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (!ALLOWED_ATTRS.has(name)) { el.removeAttribute(attr.name); continue }
      const value = attr.value.trim()
      // javascript:/data: 危险 URL（href/src）直接剥掉
      if ((name === 'href' || name === 'src') && /^\s*(javascript|data):/i.test(value)) {
        el.removeAttribute(attr.name)
      }
    }
  }
  return doc.body.innerHTML
}
