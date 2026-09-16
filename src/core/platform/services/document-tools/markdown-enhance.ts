/**
 * 文档工具层：markdown 增强（公式 / mermaid）
 * @module core/platform/services/document-tools/markdown-enhance
 *
 * 背景：讲义的区正文里带 KaTeX 公式（$…$ / $$…$$）与 mermaid 图，前端 bytemd 有
 * plugin-math / plugin-mermaid 能渲染；但导出走平台文档工具层时只有 marked，
 * 公式会以 `$…$` 原文进 PDF/长图、mermaid 会以代码块出现——属于"导出内容不对"。
 *
 * 本模块把这些能力补在**平台层唯一实现**里（工作流/日记等消费方默认不开，
 * 只有显式传 enhance 才生效，零回归）：
 *  - 公式：markdown 阶段抽成占位符（避免 marked 吃掉公式里的 `_`/`*`），
 *    HTML 阶段用 KaTeX 回填；KaTeX CSS 与字体内联（自包含，Web 端打印也正常）；
 *  - mermaid：把 marked 产出的 ```mermaid 代码块转成 `<div class="mermaid">`，
 *    内联 mermaid 运行脚本并在渲染完成后置 `window.__docRenderDone = true`
 *    （隐藏窗口渲染器据此等待，见 electron-document-renderer）。
 *
 * 纯字符串变换部分全部可单测；资源读取失败一律降级（不抛错、不阻塞导出）。
 */

import * as fs from 'fs'
import * as path from 'path'

export interface MathPlaceholder {
  /** 占位 token（ASCII，marked 不会改写） */
  token: string
  /** TeX 源码 */
  tex: string
  /** true = 块级公式（$$…$$） */
  display: boolean
}

/** 块级公式：$$…$$（可跨行） */
const BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g
/**
 * 行内公式：$…$（不跨行；`$` 后不接空白、闭合 `$` 前不接空白或反斜杠，避免把货币写法
 * 与转义 `\$` 当公式；前后不与其他 `$` 相邻，避免吃掉块级公式的边界）。
 */
const INLINE_MATH_RE = /(?<![\\$])\$(?!\s)([^\n$]*?)(?<![\\\s])\$(?!\$)/g

/**
 * 在「非 fenced code block」的连续片段上应用 fn（fence 内原样保留）。
 * fenced code 里出现 `$` 不是公式（代码示例），必须绕开。
 */
export function mapOutsideFences(md: string, fn: (segment: string) => string): string {
  const lines = String(md ?? '').split('\n')
  const out: string[] = []
  let fence: string | null = null
  let buffer: string[] = []
  const flush = (): void => {
    if (buffer.length) {
      out.push(fn(buffer.join('\n')))
      buffer = []
    }
  }
  for (const line of lines) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      out.push(line)
      if (m && line.trim().startsWith(fence)) fence = null
      continue
    }
    if (m) {
      flush()
      fence = m[1]
      out.push(line)
      continue
    }
    buffer.push(line)
  }
  flush()
  return out.join('\n')
}

/** 在「非行内 code」的片段上应用 fn（`code` 内原样保留） */
export function mapOutsideInlineCode(segment: string, fn: (plain: string) => string): string {
  const re = /(`+)([\s\S]*?)\1/g
  let out = ''
  let last = 0
  for (const m of segment.matchAll(re)) {
    const at = m.index ?? 0
    out += fn(segment.slice(last, at)) + m[0]
    last = at + m[0].length
  }
  out += fn(segment.slice(last))
  return out
}

/**
 * 把 markdown 里的公式抽成占位符。
 * @returns text 供 marked 转换；math 供 HTML 阶段回填
 */
export function extractMath(md: string): { text: string; math: MathPlaceholder[] } {
  const math: MathPlaceholder[] = []
  const push = (tex: string, display: boolean): string => {
    const token = `@@DLMATH${math.length}@@`
    math.push({ token, tex: String(tex ?? '').trim(), display })
    return token
  }
  const replaceInPlain = (plain: string): string => {
    // 块级与行内一起找、按**文档出现顺序**编号（token 顺序与阅读顺序一致，便于排查）；
    // 行内匹配与块级区间重叠的丢弃（避免把 $$…$$ 的边界当成行内公式）
    const found: Array<{ start: number; end: number; tex: string; display: boolean }> = []
    for (const m of plain.matchAll(BLOCK_MATH_RE)) {
      const start = m.index ?? 0
      found.push({ start, end: start + m[0].length, tex: m[1], display: true })
    }
    for (const m of plain.matchAll(INLINE_MATH_RE)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      if (found.some((f) => start < f.end && end > f.start)) continue
      found.push({ start, end, tex: m[1], display: false })
    }
    found.sort((a, b) => a.start - b.start)
    let out = ''
    let last = 0
    for (const f of found) {
      out += plain.slice(last, f.start) + push(f.tex, f.display)
      last = f.end
    }
    return out + plain.slice(last)
  }
  const text = mapOutsideFences(md, (seg) => mapOutsideInlineCode(seg, replaceInPlain))
  return { text, math }
}

/** 单条公式渲染结果（失败回退原文，保证内容不丢） */
export function fallbackMathText(m: MathPlaceholder): string {
  return m.display ? `$$${m.tex}$$` : `$${m.tex}$`
}

/**
 * 用 KaTeX 把占位符回填为公式 HTML。
 * @param render 渲染函数（默认 KaTeX；注入便于单测）
 */
export async function renderMathInHtml(
  html: string,
  math: MathPlaceholder[],
  render?: (m: MathPlaceholder) => Promise<string> | string,
): Promise<string> {
  if (!math.length) return html
  const renderer = render ?? defaultKatexRender
  let out = html
  for (const m of math) {
    let piece: string
    try {
      piece = await renderer(m)
    } catch {
      piece = fallbackMathText(m)
    }
    out = out.split(m.token).join(piece || fallbackMathText(m))
  }
  return out
}

/** KaTeX 渲染（动态加载，避免非公式场景付出模块求值成本） */
export async function defaultKatexRender(m: MathPlaceholder): Promise<string> {
  const katex = (await import('katex')) as unknown as {
    default?: { renderToString: (tex: string, opts?: Record<string, unknown>) => string }
    renderToString?: (tex: string, opts?: Record<string, unknown>) => string
  }
  const fn = katex.renderToString ?? katex.default?.renderToString
  if (!fn) throw new Error('katex.renderToString 不可用')
  return fn(m.tex, { displayMode: m.display, throwOnError: false, strict: false, output: 'html' })
}

/** mermaid 代码块 → `<div class="mermaid">` 容器（marked 产出的 pre>code 结构） */
export function mermaidBlocksToContainers(html: string): { html: string; hasMermaid: boolean } {
  let hasMermaid = false
  const out = String(html ?? '').replace(
    /<pre>\s*<code[^>]*class="[^"]*language-mermaid[^"]*"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/g,
    (_m, code: string) => {
      hasMermaid = true
      return `<div class="mermaid">${unescapeHtml(code)}</div>`
    },
  )
  return { html: out, hasMermaid }
}

/** HTML 实体反转义（mermaid 源码需要原始文本） */
export function unescapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
}

// ==================== 资源解析与内联（带缓存；失败降级） ====================

/** 解析包内文件绝对路径（Electron 主进程 CJS / vitest ESM 双兼容） */
export function resolvePackageFile(spec: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const req = typeof require === 'function' ? (require as NodeRequire) : null
    if (req?.resolve) return req.resolve(spec)
  } catch {
    /* 落到下一策略 */
  }
  try {
    const base = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    // 从当前文件向上找到 node_modules（源码位于 src/core/... 或 out/main/...）
    let dir = base
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, 'node_modules', spec)
      if (fs.existsSync(candidate)) return candidate
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    /* 降级返回 null */
  }
  return null
}

let katexStyleCache: string | null | undefined
/**
 * KaTeX 样式（CSS + 字体 base64 内联）。
 * 自包含的原因：桌面端隐藏窗口可能以 data: URL 加载（file:// 子资源被阻止），
 * Web 端降级 HTML 直接打印时也没有本地字体目录——内联才能两端一致显示公式。
 */
export function loadKatexStyle(): string | null {
  if (katexStyleCache !== undefined) return katexStyleCache
  const cssPath = resolvePackageFile('katex/dist/katex.min.css')
  if (!cssPath) {
    katexStyleCache = null
    return null
  }
  try {
    const css = fs.readFileSync(cssPath, 'utf-8')
    const fontDir = path.join(path.dirname(cssPath), 'fonts')
    const inlined = css.replace(/url\((['"]?)fonts\/([^'")]+)\1\)/g, (whole, _q, file: string) => {
      // 只内联 woff2：@font-face 的 src 列表里 woff2 在前，Chromium 命中即止；
      // 把 woff/ttf 也内联会让每个导出 HTML 白涨约 1MB（长图/PDF 传输与渲染都吃亏）。
      if (!file.endsWith('.woff2')) return whole
      try {
        const buf = fs.readFileSync(path.join(fontDir, file))
        return `url(data:font/woff2;base64,${buf.toString('base64')})`
      } catch {
        return whole
      }
    })
    katexStyleCache = inlined
    return inlined
  } catch {
    katexStyleCache = null
    return null
  }
}

let mermaidScriptCache: string | null | undefined
/** mermaid 运行脚本（dist/mermaid.min.js 内容；读不到返回 null → 降级为代码块） */
export function loadMermaidScript(): string | null {
  if (mermaidScriptCache !== undefined) return mermaidScriptCache
  const candidates = ['mermaid/dist/mermaid.min.js', 'mermaid/dist/mermaid.js']
  for (const spec of candidates) {
    const p = resolvePackageFile(spec)
    if (!p) continue
    try {
      mermaidScriptCache = fs.readFileSync(p, 'utf-8')
      return mermaidScriptCache
    } catch {
      /* 试下一个候选 */
    }
  }
  mermaidScriptCache = null
  return null
}

/** 测试/长驻进程用：清空资源缓存 */
export function resetEnhanceCaches(): void {
  katexStyleCache = undefined
  mermaidScriptCache = undefined
}

/** 增强项开关（缺省全关：既有消费方行为不变） */
export interface DocumentEnhanceOptions {
  /** 渲染 KaTeX 公式（$…$ / $$…$$） */
  math?: boolean
  /** 渲染 mermaid 图（```mermaid 代码块） */
  mermaid?: boolean
}

/** 增强产出的 HTML 片段（样式 + 渲染脚本） */
export interface EnhanceAssets {
  /** 需注入 <head> 的样式（KaTeX 样式 + mermaid 容器版式） */
  headHtml: string
  /** 需注入 </body> 前的脚本（mermaid 渲染 + 就绪标志） */
  bodyScript: string
}

/** mermaid 容器与公式块的基础版式 */
const ENHANCE_LAYOUT_CSS = `
  .mermaid { text-align: center; margin: 12px 0; }
  .mermaid svg { max-width: 100%; height: auto; }
  .katex-display { overflow-x: auto; overflow-y: hidden; padding: 2px 0; }
`

/** 渲染就绪标志：脚本先置 false，渲染完成后置 true（渲染器据此等待） */
const READY_FLAG_START = 'window.__docRenderDone = false;'
const READY_FLAG_DONE = 'window.__docRenderDone = true;'

/** mermaid 渲染脚本（无 mermaid 时不注入） */
export function buildMermaidRuntimeScript(): string {
  const lib = loadMermaidScript()
  if (!lib) return ''
  return `<script>${READY_FLAG_START}</script>
<script>${lib}</script>
<script>
(function () {
  var done = function () { ${READY_FLAG_DONE} };
  try {
    if (typeof mermaid === 'undefined') { done(); return; }
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
    Promise.resolve(mermaid.run({ querySelector: '.mermaid' })).then(done, function (e) {
      console.warn('[document-tools] mermaid 渲染失败：', e); done();
    });
  } catch (e) { console.warn('[document-tools] mermaid 初始化失败：', e); done(); }
})();
</script>`
}

/**
 * 组装增强资源：KaTeX 样式 + mermaid 容器版式 + mermaid 渲染脚本。
 * @param want 开关；未开启或资源缺失时不产出对应片段
 * @param hasMermaid HTML 中是否真的存在 mermaid 容器（决定是否注入脚本）
 */
export function buildEnhanceAssets(want: DocumentEnhanceOptions, hasMermaid: boolean): EnhanceAssets {
  let headHtml = ''
  const headParts: string[] = []
  if (want.math) {
    const katex = loadKatexStyle()
    if (katex) headParts.push(`<style>${katex}</style>`)
  }
  if (want.mermaid && hasMermaid) {
    const script = buildMermaidRuntimeScript()
    if (script) {
      headParts.push(`<style>${ENHANCE_LAYOUT_CSS}</style>`)
      return { headHtml: headParts.join('\n'), bodyScript: script }
    }
  }
  headHtml = headParts.join('\n')
  return { headHtml, bodyScript: '' }
}