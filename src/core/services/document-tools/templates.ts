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

  /** 吃瓜速报·娱乐小报风 V2（港媒头条红黑：白底 + 红黑横幅 + 红底白字章节标签，克制醒目） */
  gossipTabloid: {
    id: 'gossipTabloid',
    name: '吃瓜·娱乐小报',
    width: 750,
    css: `
      ${BASE_CSS}
      :root { --accent:#e53935; --accent-soft:#fff3f2; --line:#f0d5d4; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fff; color:#2b2b2b; font-size:15px; }
      .doc-header { background:linear-gradient(135deg,#1a1a1a 0%,#2f0f0f 45%,#c62828 100%); color:#fff; padding:30px 34px 26px; position:relative; overflow:hidden; }
      .doc-header::before { content:'🔥'; position:absolute; right:26px; top:18px; font-size:34px; opacity:.85; }
      .doc-header h1 { margin:0 0 8px; font-size:28px; font-weight:900; letter-spacing:2px; line-height:1.3; }
      .doc-header .date { display:inline-block; margin-top:4px; padding:3px 12px; background:#ffb300; color:#1a1a1a; font-size:12px; font-weight:700; border-radius:3px; letter-spacing:1px; }
      .doc-header::after { content:''; display:block; height:4px; margin:18px -34px -26px; background:linear-gradient(90deg,#ffb300 0 40%,#e53935 40% 70%,#1a1a1a 70%); }
      .doc-body { padding:26px 34px 34px; }
      .doc-body h1 { font-size:24px; color:#c62828; border-bottom:3px double #e53935; padding-bottom:10px; }
      .doc-body h2 { font-size:17px; color:#fff; margin:30px 0 12px; padding:7px 14px; background:#e53935; border-radius:4px; font-weight:800; letter-spacing:1px; box-shadow:0 2px 0 #b71c1c; }
      .doc-body h3 { font-size:16px; color:#c62828; margin-top:20px; font-weight:700; }
      .doc-body strong { color:#c62828; }
      .doc-body blockquote { border-left:5px solid #e53935; background:#fff3f2; color:#6b3a38; border-radius:0 8px 8px 0; }
      .doc-body table { border-radius:8px; overflow:hidden; }
      .doc-body table th { background:#e53935; color:#fff; border-color:#e53935; }
      .doc-body table td { border-color:#f0d5d4; }
      .doc-body a { color:#c62828; }
      .doc-body hr { border:none; border-top:2px dashed #e5b9b7; margin:24px 0; }
      .doc-footer { background:#1a1a1a; color:#ffb300; font-size:12px; text-align:center; padding:13px; font-weight:600; letter-spacing:1px; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">📰 独家速报 · ${zhToday()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">🍉 本报告由 The Bot 工作流自动生成 · 吃瓜有度，不信谣不传谣</div>`,
  },

  /** 吃瓜速报·事件梳理图风 V2（专业信息图：CSS 计数器章节编号徽章 + 时间线圆点竖线列表，蓝金配色） */
  gossipTimeline: {
    id: 'gossipTimeline',
    name: '吃瓜·事件梳理',
    width: 800,
    css: `
      ${BASE_CSS}
      :root { --accent:#1f5f8b; --accent-soft:#eef5fa; --line:#dce7ef; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fbfcfd; color:#33404d; font-size:15px; }
      .doc-header { background:linear-gradient(135deg,#122c44,#1f5f8b); color:#fff; padding:32px 40px 28px; border-bottom:3px solid #c9a06b; }
      .doc-header h1 { margin:0 0 8px; font-size:25px; font-weight:700; letter-spacing:1px; }
      .doc-header .date { color:#c9a06b; font-size:13px; letter-spacing:1px; }
      .doc-body { padding:28px 40px 36px; counter-reset: sec; }
      .doc-body h1 { font-size:22px; color:#122c44; border-bottom:2px solid var(--line); padding-bottom:10px; }
      .doc-body h2 { counter-increment: sec; font-size:18px; color:#122c44; margin:34px 0 14px; padding-left:44px; position:relative; font-weight:700; }
      .doc-body h2::before { content:counter(sec, decimal-leading-zero); position:absolute; left:0; top:50%; transform:translateY(-50%); width:32px; height:32px; border-radius:50%; background:#1f5f8b; color:#fff; font-size:14px; font-weight:700; display:flex; align-items:center; justify-content:center; box-shadow:0 0 0 3px #d6e6f2; }
      .doc-body h3 { font-size:16px; color:#1f5f8b; margin-top:18px; }
      .doc-body strong { color:#122c44; }
      /* 时间线条目：竖线 + 圆点节点 */
      .doc-body ul { list-style:none; margin:10px 0 18px; padding-left:0; }
      .doc-body ul li { position:relative; padding:7px 0 7px 24px; border-left:2px solid #cfe0ec; margin-left:11px; }
      .doc-body ul li::before { content:''; position:absolute; left:-7px; top:15px; width:12px; height:12px; border-radius:50%; background:#c9a06b; border:2px solid #fff; box-shadow:0 0 0 2px #c9a06b; }
      .doc-body ul li:last-child { border-left-color:transparent; }
      .doc-body blockquote { border-left:4px solid #1f5f8b; background:#eef5fa; color:#3d5870; border-radius:0 8px 8px 0; }
      .doc-body table { border-radius:8px; overflow:hidden; }
      .doc-body table th { background:#1f5f8b; color:#fff; border-color:#1f5f8b; }
      .doc-body table td { border-color:var(--line); }
      .doc-body a { color:#1f5f8b; }
      .doc-body hr { border:none; border-top:1px solid var(--line); margin:24px 0; }
      .doc-footer { padding:14px 40px; background:#122c44; color:#b9c8d6; font-size:12px; text-align:center; letter-spacing:1px; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">事件梳理 · ${zhToday()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">由 The Bot 工作流生成 · 事件分析报告</div>`,
  },

  /** 吃瓜速报·公众号吃瓜文风 V2（暖橙阅读排版：首段放大导语 + 橙色章节条 + 浅橙引用卡片，耐读舒适） */
  gossipArticle: {
    id: 'gossipArticle',
    name: '吃瓜·公众号文',
    width: 720,
    css: `
      ${BASE_CSS}
      :root { --accent:#e8621d; --accent-soft:#fff1e6; --line:#f2e2d2; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fdf9f2; color:#3a3330; font-size:15.5px; }
      .doc-header { padding:36px 38px 24px; border-bottom:2px solid #e8621d; }
      .doc-header h1 { margin:0; font-size:27px; font-weight:800; color:#2c241f; letter-spacing:1px; line-height:1.35; }
      .doc-header .date { margin-top:12px; color:#b08a6b; font-size:12.5px; letter-spacing:1px; }
      .doc-body { padding:24px 38px 32px; }
      .doc-body h1 { font-size:23px; color:#2c241f; border-bottom:1px solid var(--line); padding-bottom:10px; }
      .doc-body p:first-of-type { font-size:16.5px; color:#5c4d42; line-height:1.9; }
      .doc-body h2 { font-size:19px; color:#e8621d; margin:30px 0 14px; padding-left:14px; border-left:5px solid #e8621d; font-weight:800; letter-spacing:.5px; }
      .doc-body h3 { font-size:16px; color:#5c4d42; margin-top:18px; }
      .doc-body strong { color:#d84315; }
      .doc-body blockquote { border-left:4px solid #f5b98f; background:#fff4e9; color:#7a5c3c; border-radius:0 10px 10px 0; padding:12px 16px; }
      .doc-body table { border-radius:8px; overflow:hidden; }
      .doc-body table th { background:#e8621d; color:#fff; border-color:#e8621d; }
      .doc-body table td { border-color:var(--line); }
      .doc-body a { color:#d84315; }
      .doc-body hr { border:none; border-top:2px dashed #f0d5bc; margin:26px 0; }
      .doc-footer { padding:14px 38px; background:#fff1e6; color:#a4876b; font-size:12px; text-align:center; letter-spacing:1px; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">✍️ ${zhToday()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">本文由 The Bot 工作流生成 · 吃瓜有度，理性冲浪</div>`,
  },

  /** 吃瓜速报·港式八卦报（香港娱乐报章/八卦杂志：白底红黑大字、刊头线、红字栏目标题、"爆/独家"标签） */
  gossipHK: {
    id: 'gossipHK',
    name: '吃瓜·港式小报',
    width: 760,
    css: `
      ${BASE_CSS}
      :root { --accent:#d0021b; --accent-soft:#fff3f3; --line:#e8e8e8; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#fffefb; color:#1a1a1a; font-size:15px; }
      /* 报头：白底 + 正中大红报头名 + 顶部「獨家/今日頭條」标签 + 刊头双线 */
      .doc-header { background:#fff; padding:18px 34px 0; border-bottom:4px double #111; text-align:center; }
      .doc-header .kicker { display:inline-block; margin-bottom:6px; padding:2px 14px; background:#d0021b; color:#fff; font-size:12px; font-weight:700; letter-spacing:2px; border-radius:2px; }
      .doc-header h1 { margin:2px 0 6px; font-family:'Songti SC','SimSun','Microsoft YaHei',serif; font-size:30px; font-weight:900; color:#d0021b; letter-spacing:2px; text-shadow:1px 1px 0 rgba(0,0,0,.12); line-height:1.3; }
      .doc-header .date { display:block; padding:6px 0 12px; color:#444; font-size:12px; letter-spacing:2px; border-top:1px solid #e2e2e2; margin-top:6px; }
      .doc-body { padding:24px 34px 32px; }
      .doc-body h1 { font-family:'Songti SC','SimSun',serif; font-size:26px; color:#d0021b; border-bottom:3px double #111; padding-bottom:8px; letter-spacing:1px; }
      /* 栏目标题：红字 + 黑色粗下划线 + 红菱形前缀（报纸栏目感） */
      .doc-body h2 { font-size:19px; color:#d0021b; margin:30px 0 12px; padding:4px 0 6px; border-bottom:3px solid #111; font-weight:800; letter-spacing:1px; }
      .doc-body h2::before { content:'◆ '; color:#d0021b; }
      .doc-body h3 { font-size:16px; color:#d0021b; margin-top:18px; font-weight:700; }
      .doc-body strong { color:#c9002b; }
      .doc-body blockquote { border-left:6px solid #d0021b; background:#fff3d6; color:#7a2a00; padding:10px 16px; }
      .doc-body blockquote strong { color:#a00; }
      .doc-body table { border-radius:6px; overflow:hidden; }
      .doc-body table th { background:#d0021b; color:#fff; border-color:#d0021b; }
      .doc-body table td { border-color:var(--line); }
      .doc-body a { color:#d0021b; }
      .doc-body hr { border:none; border-top:2px solid #ddd; margin:24px 0; }
      .doc-footer { background:#d0021b; color:#fff; font-size:12px; text-align:center; padding:13px; font-weight:700; letter-spacing:1px; }`,
    header: title => `<div class="doc-header"><span class="kicker">🔥 獨家 · 今日頭條</span><h1>${escapeHtml(title)}</h1><span class="date">📰 娛樂熱話 · ${zhToday()}</span></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">🍉 本報由 The Bot 工作流自動生成 · 食瓜有度，不信謠不傳謠</div>`,
  },

  /** 吃瓜速报·信息图风（参照热点信息海报：蓝金配色、卡片式分区、标签徽章、时间线，专业耐看） */
  gossipInfographic: {
    id: 'gossipInfographic',
    name: '吃瓜·信息图',
    width: 780,
    css: `
      ${BASE_CSS}
      :root { --accent:#1f4e8c; --accent-soft:#eaf1fa; --line:#dbe6f2; }
      body { font-family:'Microsoft YaHei','PingFang SC',sans-serif; background:#f5f9fd; color:#2d3a4c; font-size:15px; }
      .doc-header { background:linear-gradient(135deg,#163f72,#1f5a9c); color:#fff; padding:32px 40px 28px; position:relative; }
      .doc-header h1 { margin:0 0 8px; font-size:25px; font-weight:700; letter-spacing:1px; line-height:1.35; }
      .doc-header .date { display:inline-block; margin-top:6px; padding:3px 12px; background:#f0a843; color:#163f72; font-size:12px; font-weight:700; border-radius:20px; letter-spacing:1px; }
      .doc-body { padding:26px 40px 34px; }
      .doc-body h1 { font-size:22px; color:#163f72; border-bottom:2px solid var(--line); padding-bottom:10px; }
      /* 卡片式章节标题：白底圆角卡 + 左蓝竖条 + 深蓝粗体（emoji 由内容提供） */
      .doc-body h2 { font-size:18px; color:#163f72; margin:30px 0 14px; padding:10px 14px; background:#fff; border:1px solid var(--line); border-left:5px solid #1f4e8c; border-radius:10px; font-weight:700; box-shadow:0 1px 3px rgba(31,78,140,.08); }
      .doc-body h3 { font-size:16px; color:#1f4e8c; margin-top:18px; }
      .doc-body strong { color:#163f72; }
      .doc-body blockquote { border:1px solid #dbe6f2; border-left:5px solid #1f4e8c; background:#eef4fb; color:#3d5870; border-radius:10px; padding:12px 16px; }
      .doc-body ul { list-style:none; margin:10px 0 18px; padding-left:0; }
      .doc-body ul li { position:relative; padding:6px 0 6px 22px; }
      .doc-body ul li::before { content:''; position:absolute; left:2px; top:13px; width:9px; height:9px; border-radius:50%; background:#1f4e8c; }
      .doc-body table { border-radius:10px; overflow:hidden; }
      .doc-body table th { background:#1f4e8c; color:#fff; border-color:#1f4e8c; }
      .doc-body table td { border-color:var(--line); }
      .doc-body a { color:#1f4e8c; }
      .doc-body hr { border:none; border-top:2px dashed #c9d8ea; margin:26px 0; }
      .doc-footer { padding:14px 40px; background:#163f72; color:#c3d4e8; font-size:12px; text-align:center; letter-spacing:1px; }`,
    header: title => `<div class="doc-header"><h1>${escapeHtml(title)}</h1><div class="date">🕐 最新時間 · ${zhToday()}</div></div><div class="doc-body">`,
    footer: () => `</div><div class="doc-footer">由 The Bot 工作流生成 · 事件分析信息图</div>`,
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
