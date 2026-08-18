/**
 * 文档排版模板（双端共用纯函数）
 * @module core/services/document-tools/templates
 * @description markdown → 完整排版 HTML。模板决定字体/配色/页眉页脚；
 *              marked 做正文转换。新增场景 = 加一个模板对象，不改服务。
 */

/** 模板基础排版 CSS（中文字体栈、代码块、表格、引用——长图与 PDF 共用） */
const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; line-height: 1.8; color: #2c3e50; }
  h1, h2, h3, h4 { line-height: 1.4; }
  pre { background: #f6f8fa; padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  code { background: #f6f8fa; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.92em; }
  pre code { padding: 0; background: none; }
  blockquote { border-left: 4px solid var(--accent); padding: 4px 16px; margin: 12px 0; color: #5a6b7c; background: var(--accent-soft); border-radius: 0 8px 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; }
  th { background: var(--accent-soft); }
  img { max-width: 100%; border-radius: 8px; }
  a { color: var(--accent); }
`

export interface DocumentTemplate {
  id: string
  name: string
  /** 内容区宽度（px；长图宽度/打印页宽） */
  width: number
  /** 正文上下文 CSS 变量与版式 */
  css: string
  /** 页眉（标题区，可含日期） */
  header?: (title: string) => string
  /** 页脚 */
  footer?: () => string
}

const chatBubble = (role: string, who: string, body: string, accent: string, soft: string): string =>
  `<div class="msg ${role}" style="--a:${accent};--s:${soft}"><div class="who">${who}</div><div class="bubble">${body}</div></div>`

export const DOCUMENT_TEMPLATES: Record<string, DocumentTemplate> = {
  /** 通用文档（日记/报告缺省） */
  generic: {
    id: 'generic',
    name: '通用文档',
    width: 800,
    css: `
      :root { --accent:#409eff; --accent-soft:#ecf5ff; --line:#e4e7ed; }
      body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; padding: 32px 40px; font-size: 15px; }
      h1 { font-size: 24px; border-bottom: 2px solid var(--line); padding-bottom: 10px; }
      h2 { font-size: 19px; margin-top: 26px; }
      h3 { font-size: 16px; }
      ${BASE_CSS}`,
    header: title => `<h1 style="margin-top:0">${escapeHtml(title)}</h1>`,
  },

  /** 早报/简报长图（竖版卡片风） */
  morningReport: {
    id: 'morningReport',
    name: '早报长图',
    width: 750,
    css: `
      :root { --accent:#c0392b; --accent-soft:#fdf1ef; --line:#f0d9d6; }
      body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; background: #fff; }
      .doc-header { background: linear-gradient(135deg, #c0392b, #e74c3c); color: #fff; padding: 28px 32px; }
      .doc-header h1 { margin: 0 0 6px; font-size: 26px; }
      .doc-header .date { opacity: 0.85; font-size: 13px; }
      .doc-body { padding: 24px 32px 32px; font-size: 15px; }
      .doc-body h2 { font-size: 18px; color: #c0392b; margin-top: 22px; }
      .doc-footer { padding: 14px 32px; background: #fdf1ef; color: #9a6258; font-size: 12px; text-align: center; }
      ${BASE_CSS}`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">由 The Bot 工作流生成</div>`,
  },

  /** AI 对话记录（气泡式，仅 PC/长图场景；PDF 也可用） */
  chatTranscript: {
    id: 'chatTranscript',
    name: '对话记录',
    width: 760,
    css: `
      :root { --accent:#409eff; --accent-soft:#ecf5ff; --line:#e4e7ed; }
      body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; padding: 28px 32px; background: #f7f8fa; font-size: 14px; }
      .doc-title { text-align: center; font-size: 20px; font-weight: 600; margin-bottom: 4px; }
      .doc-meta { text-align: center; color: #90a0b0; font-size: 12px; margin-bottom: 20px; }
      .msg { display: flex; flex-direction: column; margin: 14px 0; }
      .msg .who { font-size: 12px; color: #8a99a8; margin-bottom: 4px; }
      .msg .bubble { max-width: 88%; padding: 12px 16px; border-radius: 12px; background: var(--s); border-top-left-radius: 4px; }
      .msg.assistant .bubble { background: #fff; border: 1px solid var(--line); border-top-left-radius: 4px; border-top-right-radius: 12px; }
      ${BASE_CSS}`,
    header: title => `<div class="doc-title">${escapeHtml(title)}</div><div class="doc-meta">${new Date().toLocaleString('zh-CN')}</div>`,
  },
}

/** 对话消息（chatTranscript 模板专用入参） */
export interface TranscriptMessage {
  role: 'user' | 'assistant'
  /** 展示名（用户昵称/模型名） */
  name: string
  /** markdown 正文 */
  content: string
}

/** HTML 转义（标题等非 markdown 文本） */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

let markedModule: typeof import('marked') | null = null
async function getMarked(): Promise<typeof import('marked')> {
  if (!markedModule) markedModule = await import('marked')
  return markedModule
}

/** markdown → 排版 HTML 片段 */
async function mdToHtml(md: string): Promise<string> {
  const marked = await getMarked()
  return await marked.marked(md, { gfm: true, breaks: true, async: true })
}

/** 渲染完整 HTML 文档（模板 + 正文）。markdown 为空且 messages 提供时走对话气泡版式 */
export async function renderTemplateHtml(
  markdown: string,
  opts: { template: DocumentTemplate; title?: string; messages?: TranscriptMessage[] }
): Promise<string> {
  const t = opts.template
  const title = opts.title ?? '文档'
  let bodyHtml: string
  if (!markdown && opts.messages?.length) {
    bodyHtml = (await Promise.all(opts.messages.map(async m => {
      const inner = await mdToHtml(m.content)
      return m.role === 'user'
        ? chatBubble('user', escapeHtml(m.name), inner, '#409eff', '#ecf5ff')
        : chatBubble('assistant', escapeHtml(m.name), inner, '#67c23a', '#f0f9eb')
    }))).join('')
  } else {
    bodyHtml = await mdToHtml(markdown)
  }
  const header = t.header?.(title) ?? ''
  const footer = t.footer?.() ?? ''
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title><style>${t.css}</style></head><body>${header}${bodyHtml}${footer}</body></html>`
}
