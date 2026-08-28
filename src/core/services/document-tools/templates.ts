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

/** 今日日期（中文长格式） */
function zhToday(): string {
  return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}

/** 本周标识（ISO 周计数，用于周报页眉） */
function zhWeek(): string {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const week = Math.ceil((((now.getTime() - start.getTime()) / 86_400_000) + start.getDay() + 1) / 7)
  return `${now.getFullYear()} 年第 ${week} 周`
}

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

  /** 早报/简报长图（商务蓝：清爽渐变头 + 栏目卡片标题，专业耐看） */
  morningReportBlue: {
    id: 'morningReportBlue',
    name: '早报·商务蓝',
    width: 750,
    css: `
      ${BASE_CSS}
      :root { --accent:#2563eb; --accent-soft:#eff6ff; --line:#dbeafe; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fff; color:#1f2937; font-size:15px; }
      .doc-header { background:linear-gradient(135deg,#1e3a8a,#3b82f6); color:#fff; padding:30px 36px 26px; }
      .doc-header h1 { margin:0 0 8px; font-size:26px; font-weight:700; letter-spacing:1px; }
      .doc-header .date { opacity:.85; font-size:13px; }
      .doc-body { padding:26px 36px 34px; }
      .doc-body h2 { font-size:18px; color:#1d4ed8; margin:28px 0 10px; padding:8px 14px; background:var(--accent-soft); border-left:4px solid #3b82f6; border-radius:0 6px 6px 0; }
      .doc-body h3 { font-size:16px; color:#1f2937; margin-top:18px; }
      .doc-body strong { color:#0f172a; }
      .doc-footer { padding:14px 36px; background:#eff6ff; color:#64748b; font-size:12px; text-align:center; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">${zhToday()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">由 The Bot 工作流生成 · 每日早报</div>`,
  },

  /** 早报/简报长图（极简：大留白 + 细分割线 + 红色圆点栏目标记，克制典雅） */
  morningReportMinimal: {
    id: 'morningReportMinimal',
    name: '早报·极简',
    width: 750,
    css: `
      ${BASE_CSS}
      :root { --accent:#111827; --accent-soft:#f9fafb; --line:#e5e7eb; }
      body { font-family:'PingFang SC','Microsoft YaHei',sans-serif; background:#fff; color:#111827; font-size:15px; }
      .doc-header { padding:36px 44px 20px; border-bottom:1px solid var(--line); }
      .doc-header h1 { margin:0; font-size:25px; font-weight:600; letter-spacing:2px; }
      .doc-header .date { margin-top:10px; color:#9ca3af; font-size:12px; letter-spacing:1px; }
      .doc-body { padding:24px 44px 32px; }
      .doc-body h2 { font-size:17px; font-weight:600; margin:26px 0 10px; padding-left:16px; position:relative; }
      .doc-body h2::before { content:''; position:absolute; left:0; top:50%; transform:translateY(-50%); width:6px; height:6px; border-radius:50%; background:#e11d48; }
      .doc-body h3 { font-size:15px; color:#374151; margin-top:16px; }
      .doc-body strong { font-weight:600; }
      .doc-footer { padding:14px 44px; border-top:1px solid var(--line); color:#9ca3af; font-size:11px; text-align:center; letter-spacing:1px; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">${zhToday()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">由 The Bot 工作流生成 · 每日早报</div>`,
  },

  /** 行业周报长图（商务金：藏青渐变头 + 金色章节线，稳重专业） */
  industryWeekly: {
    id: 'industryWeekly',
    name: '周报·商务金',
    width: 750,
    css: `
      ${BASE_CSS}
      :root { --accent:#b08d3e; --accent-soft:#faf6ec; --line:#e8e2d4; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fff; color:#2f3542; font-size:15px; }
      .doc-header { background:linear-gradient(135deg,#1f2d3d,#3d546e); color:#fff; padding:32px 38px 28px; }
      .doc-header h1 { margin:0 0 8px; font-size:25px; font-weight:600; letter-spacing:1px; }
      .doc-header .date { color:#d4b877; font-size:13px; }
      .doc-body { padding:26px 38px 34px; }
      .doc-body h2 { font-size:18px; color:#1f2d3d; margin:30px 0 12px; padding-bottom:8px; border-bottom:2px solid var(--accent); }
      .doc-body h3 { font-size:16px; color:#2f3542; margin-top:18px; }
      .doc-body table th { background:var(--accent-soft); }
      .doc-footer { padding:14px 38px; background:#f8f6f1; color:#8a8578; font-size:12px; text-align:center; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">${zhToday()} · ${zhWeek()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">由 The Bot 工作流生成 · 行业周报</div>`,
  },

  /** 行业周报长图（墨绿：深绿渐变头 + 左竖线章节标题，金融稳重） */
  industryWeeklyGreen: {
    id: 'industryWeeklyGreen',
    name: '周报·墨绿',
    width: 750,
    css: `
      ${BASE_CSS}
      :root { --accent:#1f6f5c; --accent-soft:#eef6f3; --line:#d9e6e1; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fcfdfc; color:#24312c; font-size:15px; }
      .doc-header { background:linear-gradient(135deg,#134e3f,#2a8a72); color:#fff; padding:30px 38px 26px; }
      .doc-header h1 { margin:0 0 8px; font-size:25px; font-weight:600; }
      .doc-header .date { opacity:.85; font-size:13px; }
      .doc-body { padding:26px 38px 34px; }
      .doc-body h2 { font-size:18px; color:#134e3f; margin:28px 0 10px; padding-left:12px; border-left:4px solid var(--accent); }
      .doc-body h3 { font-size:16px; color:#24312c; margin-top:16px; }
      .doc-body strong { color:#0f2e24; }
      .doc-footer { padding:14px 38px; background:var(--accent-soft); color:#4d7264; font-size:12px; text-align:center; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">${zhToday()} · ${zhWeek()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">由 The Bot 工作流生成 · 行业周报</div>`,
  },

  /** 行业周报长图（深色：深底亮字 + 高对比，夜间阅读/高端呈现） */
  industryWeeklyDark: {
    id: 'industryWeeklyDark',
    name: '周报·深色',
    width: 750,
    css: `
      ${BASE_CSS}
      :root { --accent:#7dd3fc; --accent-soft:#0f172a; --line:#334155; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#0b1220; color:#e2e8f0; font-size:15px; }
      .doc-header { background:linear-gradient(135deg,#0b1220,#1e293b); border-bottom:1px solid var(--line); color:#f8fafc; padding:32px 38px 28px; }
      .doc-header h1 { margin:0 0 8px; font-size:25px; font-weight:600; letter-spacing:1px; }
      .doc-header .date { color:#94a3b8; font-size:13px; }
      .doc-body { padding:26px 38px 34px; }
      .doc-body h2 { font-size:18px; color:var(--accent); margin:28px 0 10px; }
      .doc-body h3 { font-size:16px; color:#f1f5f9; margin-top:16px; }
      .doc-body pre { background:#1e293b; color:#e2e8f0; border:1px solid var(--line); }
      .doc-body code { background:#1e293b; color:#e2e8f0; }
      .doc-body blockquote { color:#94a3b8; background:#0f172a; }
      .doc-body table th { background:#1e293b; color:#cbd5e1; }
      .doc-body td { border-color:var(--line); }
      .doc-body a { color:var(--accent); }
      .doc-footer { padding:14px 38px; border-top:1px solid var(--line); color:#64748b; font-size:12px; text-align:center; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">${zhToday()} · ${zhWeek()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">由 The Bot 工作流生成 · 行业周报</div>`,
  },

  /** 吃瓜速报·娱乐小报风（港媒/香港娱乐杂志大字报：品红+明黄警示色、爆点标题块、锯齿饰边） */
  gossipTabloid: {
    id: 'gossipTabloid',
    name: '吃瓜·娱乐小报',
    width: 750,
    css: `
      :root { --accent:#e91e63; --accent-soft:#fdf0f5; --line:#f5c6d4; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fff; color:#262626; font-size:15px; }
      .doc-header { background:linear-gradient(135deg,#a8104c,#e91e63 55%,#ff8f00); color:#fff; padding:30px 34px 26px; }
      .doc-header h1 { margin:0 0 8px; font-size:27px; font-weight:900; letter-spacing:1px; text-shadow:2px 2px 0 rgba(0,0,0,.28); }
      .doc-header .date { opacity:.95; font-size:13px; font-weight:600; }
      .doc-header::after { content:''; display:block; height:6px; margin:16px -34px -26px; background:repeating-linear-gradient(45deg,#ffb300 0 10px,#262626 10px 20px); }
      .doc-body { padding:26px 32px 32px; }
      .doc-body h2 { font-size:19px; color:#111; margin:28px 0 10px; padding:6px 14px; background:#ffd54f; border-radius:4px 14px 4px 14px; font-weight:800; box-shadow:3px 3px 0 #e91e63; }
      .doc-body h3 { font-size:16px; color:#c2185b; margin-top:18px; font-weight:700; }
      .doc-body strong { color:#c2185b; }
      .doc-body blockquote { border-left:6px solid #ffb300; background:#fff8e1; color:#5a4400; border-radius:0 8px 8px 0; }
      .doc-body table th { background:#fdf0f5; color:#a8104c; }
      .doc-body hr { border:none; border-top:3px double #e91e63; margin:22px 0; }
      .doc-footer { background:#262626; color:#ffd54f; font-size:12px; text-align:center; padding:12px; font-weight:600; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">📰 独家速报 · ${zhToday()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">🍉 本报告由 The Bot 工作流自动生成 · 吃瓜有度，不信谣不传谣</div>`,
  },

  /** 吃瓜速报·事件梳理图风（专业事件分析图：藏青底 + 琥珀色时间线条、信息卡片式分节） */
  gossipTimeline: {
    id: 'gossipTimeline',
    name: '吃瓜·事件梳理',
    width: 800,
    css: `
      :root { --accent:#c96f1a; --accent-soft:#fdf3e7; --line:#e8ddcf; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fff; color:#2d3748; font-size:15px; }
      .doc-header { background:linear-gradient(135deg,#16324f,#2c4f6e); color:#fff; padding:32px 38px 28px; border-bottom:4px solid #c96f1a; }
      .doc-header h1 { margin:0 0 8px; font-size:25px; font-weight:700; letter-spacing:1px; }
      .doc-header .date { color:#c9a06b; font-size:13px; }
      .doc-body { padding:26px 38px 34px; }
      .doc-body h2 { font-size:18px; color:#16324f; margin:30px 0 12px; padding-left:14px; border-left:5px solid #c96f1a; font-weight:700; }
      .doc-body h3 { font-size:16px; color:#2c4f6e; margin-top:18px; }
      .doc-body strong { color:#16324f; }
      .doc-body blockquote { border-left:4px solid #c96f1a; background:#fdf8f0; color:#6b5636; }
      .doc-body table th { background:#fdf3e7; color:#8a5a1c; }
      .doc-body hr { border:none; border-top:1px solid var(--line); margin:22px 0; }
      .doc-footer { padding:14px 38px; background:#16324f; color:#b9c8d6; font-size:12px; text-align:center; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">事件梳理 · ${zhToday()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">由 The Bot 工作流生成 · 事件分析报告</div>`,
  },

  /** 吃瓜速报·公众号吃瓜文风（米白底橙字、卡片式小节、阅读舒适耐分享） */
  gossipArticle: {
    id: 'gossipArticle',
    name: '吃瓜·公众号文',
    width: 720,
    css: `
      :root { --accent:#e8621d; --accent-soft:#fef0e7; --line:#f3e3d3; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fdf9f2; color:#3a3330; font-size:15px; }
      .doc-header { padding:34px 36px 22px; border-bottom:1px solid var(--line); }
      .doc-header h1 { margin:0; font-size:26px; font-weight:800; color:#2c241f; letter-spacing:1px; }
      .doc-header .date { margin-top:10px; color:#a8947f; font-size:12px; }
      .doc-body { padding:22px 36px 30px; }
      .doc-body h2 { font-size:19px; color:#e8621d; margin:28px 0 12px; font-weight:800; }
      .doc-body h3 { font-size:16px; color:#5c4d42; margin-top:18px; }
      .doc-body strong { color:#d84315; }
      .doc-body blockquote { border-left:4px solid #ffd9bd; background:#fff6ec; color:#7a5c3c; border-radius:0 8px 8px 0; }
      .doc-body hr { border:none; border-top:2px dashed #f0d5bc; margin:22px 0; }
      .doc-body table th { background:#fef0e7; color:#b0440f; }
      .doc-footer { padding:14px 36px; background:#fff6ec; color:#a4876b; font-size:12px; text-align:center; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">✍️ ${zhToday()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">本文由 The Bot 工作流生成 · 吃瓜有度，理性冲浪</div>`,
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
