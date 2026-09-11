/**
 * PDF 书签大纲（/Outlines）→ 权威章节结构。
 *
 * 为什么需要：pdf-inspector 输出的 Markdown 标题来自字号/版面启发式判断，
 * 存在两类硬伤（numpy-user.pdf 实测 721 页）：
 *  1) 页眉/装饰横幅（"NumPy User Guide"、"WHAT IS NUMPY?"）被判成 H1，层级整体错位；
 *  2) 正文标题的**先后顺序**与文档结构不一致，出现 "1.1" 挂在书名下的错父级。
 * 而 PDF 自身携带的书签树是作者/生成器给出的权威结构（numpy-user.pdf 有 2137 条、
 * 6 层、全部带目标页），因此这里直接读大纲，用「标题 + 层级（来自书签嵌套）」替代
 * Markdown 标题推断，正文仍取自 pdf-inspector 的逐页 Markdown。
 *
 * 与 epub 的 extractEpubMarkdown（容器目录 → 锚点切分）思路一致：
 * 结构来自容器/文档的元数据层，正文来自正文层。
 */
import { inferHeadingLevel } from './heading-level'

/** 大纲条目（页码为 0 基，与 pdf-inspector 的 PageMarkdownResult.page 对齐） */
export interface PdfOutlineEntry {
  /** 章节标题（原文，已折叠空白） */
  title: string
  /** 层级（1 起；来自书签嵌套深度，扁平书签用标题编号推导） */
  level: number
  /** 目标页（0 基）；-1 表示该书签没有可解析的目标页 */
  pageIndex: number
}

/** 逐页 Markdown（对齐 pdf-inspector extractPagesMarkdown 的输出） */
export interface PdfPageMarkdown {
  /** 0 基页码 */
  pageIndex: number
  markdown: string
}

/** pdf.js 大纲原始节点（只声明本项目用到的字段） */
interface RawOutlineItem {
  title?: string
  dest?: unknown
  items?: RawOutlineItem[]
}

/** 读取 PDF 书签大纲。无书签 / 解析失败返回空数组（调用方回退 Markdown 标题推断）。 */
export async function readPdfOutline(buffer: Buffer | Uint8Array): Promise<PdfOutlineEntry[]> {
  try {
    // pdfjs-dist 只提供 CJS 构建（legacy 版兼容 Node 18 / Electron 28）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
    const data = toPdfJsBytes(buffer)
    const doc = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    }).promise
    try {
      const raw = (await doc.getOutline()) as RawOutlineItem[] | null
      if (!raw || raw.length === 0) return []

      const flat: Array<{ title: string; depth: number; pageIndex: number }> = []
      const walk = async (items: RawOutlineItem[], depth: number): Promise<void> => {
        for (const item of items) {
          const title = String(item.title ?? '')
            .replace(/\s+/g, ' ')
            .trim()
          if (title) {
            flat.push({ title, depth, pageIndex: await resolveDestPageIndex(doc, item) })
          }
          if (item.items && item.items.length > 0) await walk(item.items, depth + 1)
        }
      }
      await walk(raw, 1)
      if (flat.length === 0) return []

      const levels = resolveOutlineLevels(flat)
      return flat.map((entry, i) => ({
        title: entry.title,
        level: levels[i],
        pageIndex: entry.pageIndex,
      }))
    } finally {
      await doc.destroy()
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[pdf-outline] 书签大纲解析失败，回退 Markdown 标题推断：${msg}`)
    return []
  }
}

/**
 * 复制为纯 Uint8Array：pdf.js 明确拒绝 Node Buffer（"Please provide binary data as
 * Uint8Array, rather than Buffer"），且要求视图独占底层 ArrayBuffer（byteLength 对齐）。
 */
function toPdfJsBytes(input: Buffer | Uint8Array): Uint8Array {
  const out = new Uint8Array(input.length)
  out.set(input)
  return out
}

/** 解析书签目标页（0 基）；无目标 / 解析失败返回 -1 */
async function resolveDestPageIndex(
  doc: { getDestination(name: string): Promise<unknown>; getPageIndex(ref: unknown): Promise<number> },
  item: RawOutlineItem,
): Promise<number> {
  try {
    const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
    if (!Array.isArray(dest) || dest.length === 0) return -1
    return await doc.getPageIndex(dest[0])
  } catch {
    return -1
  }
}

/**
 * 推导大纲层级。
 * 书签有真实嵌套（maxDepth > 1）时以嵌套深度为准——作者给定的层级优先，
 * 避免正文里的编号（如附录 "1.1 Baseline"）把深层小节抬成二级；
 * 书签是扁平列表（多数 NCX/Word 导出）时才用标题编号推导，与 epub 目录同策略。
 */
export function resolveOutlineLevels(entries: Array<{ title: string; depth: number }>): number[] {
  const maxDepth = entries.reduce((max, e) => Math.max(max, e.depth), 0)
  return entries.map(e => {
    const level = maxDepth > 1 ? e.depth : inferHeadingLevel(e.title, e.depth)
    return Math.min(6, Math.max(1, level))
  })
}

/** 页间分隔（与正文段落分隔一致，便于后续结构切分） */
const PAGE_SEPARATOR = '\n\n'

/**
 * 用大纲把逐页 Markdown 重排为「权威标题 + 正文切片」的 Markdown。
 *
 * 规则：
 *  - 正文中已有的 Markdown 标题全部降级为普通段落（PDF 里那些是版面启发式的产物）；
 *  - 逐条按大纲顺序查找标题文本，查找范围从**该书签的目标页**开始（跳过前置目录页），
 *    到下一页结束为止，命中处即为该章起点，命中文本被消费（不再重复出现在正文里）；
 *  - 未命中时按目标页位置直接插入标题，正文照旧保留（结构不丢、内容不丢）；
 *  - 首个标题之前的内容（封面/目录页）原样保留在开头。
 */
export function mergeOutlineIntoMarkdown(
  pages: PdfPageMarkdown[],
  outline: PdfOutlineEntry[],
): string {
  const sorted = [...pages].sort((a, b) => a.pageIndex - b.pageIndex)
  const bodies = sorted.map(p => demoteHeadings(p.markdown).trim())

  const pageStarts: number[] = []
  let offset = 0
  for (const body of bodies) {
    pageStarts.push(offset)
    offset += body.length + PAGE_SEPARATOR.length
  }
  const full = bodies.join(PAGE_SEPARATOR)
  if (outline.length === 0) return full

  const { norm, origOfNorm, normOfOrig } = buildNormalizedIndex(full)

  const marks: Array<{ entry: PdfOutlineEntry; start: number; titleEnd: number }> = []
  let searchFrom = 0
  for (const entry of outline) {
    const pageStart = entry.pageIndex >= 0 ? (pageStarts[entry.pageIndex] ?? full.length) : 0
    const from = Math.max(searchFrom, pageStart)
    // 窗口：目标页起，到目标页结束（防止匹配到更靠后的同名文本或目录页残留）
    const windowEnd =
      entry.pageIndex >= 0 ? (pageStarts[entry.pageIndex + 1] ?? full.length) : full.length
    const hit = matchTitle(full, norm, origOfNorm, normOfOrig, entry.title, from)
    const usable = hit && hit.start < windowEnd ? hit : null
    const start = usable ? usable.start : from
    const titleEnd = usable ? usable.end : from
    marks.push({ entry, start, titleEnd })
    if (usable) searchFrom = usable.end
  }

  const parts: string[] = []
  let cursor = 0
  for (const mark of marks) {
    const prefix = full.slice(cursor, mark.start).trim()
    if (prefix) parts.push(prefix)
    parts.push(`${'#'.repeat(Math.min(6, Math.max(1, mark.entry.level)))} ${mark.entry.title.trim()}`)
    cursor = Math.max(cursor, mark.titleEnd)
  }
  const tail = full.slice(cursor).trim()
  if (tail) parts.push(tail)
  return parts.join(PAGE_SEPARATOR)
}

/** 把 Markdown 标题行降级为普通段落（保留文本，仅去掉 # 标记） */
function demoteHeadings(markdown: string): string {
  return markdown
    .split('\n')
    .map(line => line.replace(/^(\s*)#{1,6}\s+(.*)$/, (_m, indent: string, text: string) => `${indent}${text}`))
    .join('\n')
}

/**
 * 构建「空白折叠 + 小写」的归一化文本及其与原文本的双向索引。
 * 为的是让大纲标题与正文标题在**大小写不同**（PDF 正文常全大写）、
 * **被换行/空格拆开**时也能匹配上，同时能定位回原文位置做切分。
 */
function buildNormalizedIndex(text: string): {
  norm: string
  origOfNorm: number[]
  normOfOrig: number[]
} {
  let norm = ''
  const origOfNorm: number[] = []
  const normOfOrig = new Array<number>(text.length + 1).fill(0)
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (/\s/.test(ch)) {
      let j = i
      while (j < text.length && /\s/.test(text[j])) {
        normOfOrig[j] = norm.length
        j++
      }
      norm += ' '
      origOfNorm.push(i)
      i = j
    } else {
      normOfOrig[i] = norm.length
      const lower = ch.toLowerCase()
      norm += lower.length === 1 ? lower : ch
      origOfNorm.push(i)
      i++
    }
  }
  normOfOrig[text.length] = norm.length
  return { norm, origOfNorm, normOfOrig }
}

/** 在归一化文本中从 from 起查找标题，返回原文本中的 [start, end) */
function matchTitle(
  text: string,
  norm: string,
  origOfNorm: number[],
  normOfOrig: number[],
  title: string,
  from: number,
): { start: number; end: number } | null {
  const needle = title.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!needle) return null
  const fromNorm = normOfOrig[Math.min(Math.max(from, 0), text.length)] ?? 0
  const idx = norm.indexOf(needle, fromNorm)
  if (idx < 0) return null
  const lastNorm = idx + needle.length - 1
  const start = origOfNorm[idx]
  // 标题末尾：交给下一个归一化字符的起点（顺带吃掉标题后的空白）
  const end = lastNorm + 1 < norm.length ? origOfNorm[lastNorm + 1] : text.length
  return { start, end }
}
