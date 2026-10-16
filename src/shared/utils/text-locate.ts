/**
 * 正文文本定位机制层（机制/策略分离：纯字符串数学，不依赖任何业务实体）
 * @module shared/utils/text-locate
 *
 * 两个消费者共用一份实现（架构统一原则）：
 * - 主进程：一致性扫描挂 locs（R9 人名/实体提及）、lw_patch_chapter 锚点替换；
 * - 渲染层：写作台编辑器高亮前按 excerpt 现场重锚定（扫描时的偏移可能已过期）。
 *
 * 坐标约定：
 * - start/end 为相对整章 content 原串的字符偏移，区间 [start, end)；
 * - paragraph 为 1-based 非空段落序号（连续空白为段界）；
 * - 归一化救援：LLM 摘录最常见的转录漂移是引号样式与空白差异，精确匹配
 *   失败时按「剥引号+剥空白」的归一化串重查，返回的仍是原串偏移。
 */

/** 归一化剥除的字符：中西引号对 + 反引号 + 空白 */
const STRIP_CHARS = /[「」『』“”‘’"'`'\s]/

export interface TextLoc {
  paragraph: number
  start: number
  end: number
}

/** 归一化串与「归一化字符 → 原串偏移」映射 */
interface NormIndex {
  norm: string
  map: number[]
}

function buildNormIndex(content: string): NormIndex {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < content.length; i++) {
    if (STRIP_CHARS.test(content[i])) continue
    norm += content[i]
    map.push(i)
  }
  return { norm, map }
}

/**
 * offset 所在段落号（1-based）：数 offset 及其之前出现的非空段落起点。
 * offset 落在段界空白上时归入前一段（实际调用传的都是命中起点，非空白）。
 */
export function paragraphAt(content: string, offset: number): number {
  let count = 0
  let prevWs = true
  const end = Math.min(Math.max(offset, 0) + 1, content.length)
  for (let i = 0; i < end; i++) {
    const isWs = /\s/.test(content[i])
    if (!isWs && prevWs) count++
    prevWs = isWs
  }
  return Math.max(1, count)
}

export interface LocateOptions {
  /** 最多返回的命中数（默认 5——实体多处提及时全标记会变成噪音） */
  cap?: number
}

/** query 在 content 中的全部精确命中（≤cap 处，按出现顺序） */
export function locateAll(content: string, query: string, opts: LocateOptions = {}): TextLoc[] {
  const text = String(content || '')
  const q = String(query || '')
  if (!text || !q) return []
  const cap = Math.max(1, opts.cap ?? 5)
  const out: TextLoc[] = []
  let from = 0
  while (out.length < cap) {
    const idx = text.indexOf(q, from)
    if (idx < 0) break
    out.push({ paragraph: paragraphAt(text, idx), start: idx, end: idx + q.length })
    from = idx + q.length
  }
  return out
}

/** 第 nth 处（1-based）精确命中；不足 nth 处返回 null */
export function locateNth(content: string, query: string, nth = 1): TextLoc | null {
  if (!Number.isFinite(nth) || nth < 1) return null
  const all = locateAll(content, query, { cap: nth })
  return all[nth - 1] ?? null
}

/**
 * 归一化救援匹配：剥引号/空白后查第 nth 处，返回原串偏移。
 * 典型场景：审读器把正文里的「方子动过」转述成 “方子动过”，精确匹配失败但
 * 归一化后命中。仍查不到返回 null（调用方降级为章节级，绝不在错误位置动手）。
 */
export function normalizeRescue(content: string, query: string, nth = 1): TextLoc | null {
  if (!Number.isFinite(nth) || nth < 1) return null
  const text = String(content || '')
  const nq = String(query || '')
    .split('')
    .filter((ch) => !STRIP_CHARS.test(ch))
    .join('')
  if (!text || !nq) return null
  const { norm, map } = buildNormIndex(text)
  let seen = 0
  let from = 0
  while (from <= norm.length - nq.length) {
    const idx = norm.indexOf(nq, from)
    if (idx < 0) return null
    seen++
    if (seen === nth) {
      const start = map[idx]
      const end = map[idx + nq.length - 1] + 1
      return { paragraph: paragraphAt(text, start), start, end }
    }
    from = idx + 1
  }
  return null
}

/** 定位摘录：先精确匹配，失败走归一化救援；两路皆空返回 null */
export function locateExcerpt(content: string, query: string, nth = 1): TextLoc | null {
  return locateNth(content, query, nth) ?? normalizeRescue(content, query, nth)
}
