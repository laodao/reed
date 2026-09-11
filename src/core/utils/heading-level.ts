/**
 * 标题层级推导与元信息标题识别
 * @module core/utils/heading-level
 *
 * 真实文档实证（为什么需要）：
 * - 《深度学习》epub 的 NCX 目录是**扁平**的（363 项无嵌套），但标题文本自带编号
 *   （「第1章 引言」「1.1 本书面向的读者」「1.2.1 神经网络的众多名称…」）——
 *   层级应由编号模式推导，否则 363 项全平铺成同一级。
 * - numpy PDF 靠字体大小分层，会把「Release 2.5.0」「Written by the NumPy community」
 *   这类元信息行判成标题，导致正文小节全部挂到元信息节点下（层级错挂）。
 *
 * 本模块是纯函数：不依赖具体文档，规则均为通用模式（非写死某本书的文本）。
 */

/** 中文篇/章：第N章、第N篇、第N部 → 1 级 */
const CN_CHAPTER_RE = /^第\s*[0-9一二三四五六七八九十百千零]+\s*[章篇部]/
/** 中文节：第N节 → 2 级 */
const CN_SECTION_RE = /^第\s*[0-9一二三四五六七八九十百千零]+\s*节/
/** 阿拉伯三级编号：2.6.1 → 3 级 */
const NUM3_RE = /^\d+\.\d+\.\d+/
/** 阿拉伯二级编号：1.1 / 2.6 → 2 级 */
const NUM2_RE = /^\d+\.\d+/
/** 阿拉伯章编号：1. What is NumPy? → 1 级 */
const NUM1_RE = /^\d+\.\s+\S/
/** 全大写部件标题（GETTING STARTED、NUMPY QUICKSTART）→ 2 级 */
const UPPER_SECTION_RE = /^[A-Z][A-Z0-9&,\s\-]{6,}$/

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december'

/** 元信息标题模式（版本/发布/署名/版权/日期） */
const METADATA_PATTERNS: RegExp[] = [
  /^(release|version|published|written\s+by|edited\s+by|translated\s+by|compiled\s+by)\b/i,
  /^(©|\(c\)|copyright)/i,
  new RegExp(`^(${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}$`, 'i'),
  /^\d{4}\s*[-/年]\s*\d{1,2}(\s*[-/月]\s*\d{1,2})?\s*日?$/,
]

/** 是否为「真实章节」形态的标题（编号或部件标题）——这类绝不判为元信息 */
function isChapterLike(title: string): boolean {
  return (
    CN_CHAPTER_RE.test(title) ||
    CN_SECTION_RE.test(title) ||
    NUM1_RE.test(title) ||
    NUM2_RE.test(title) ||
    UPPER_SECTION_RE.test(title)
  )
}

/**
 * 推导标题层级：编号模式优先，无编号时保留 fallback（目录深度 / 原始字体层级）。
 * @param title 标题文本
 * @param fallback 无编号可依时的层级（如目录嵌套深度或 PDF 原层级）
 */
export function inferHeadingLevel(title: string, fallback: number): number {
  const t = (title ?? '').trim()
  if (!t) return fallback
  if (CN_SECTION_RE.test(t)) return 2
  if (CN_CHAPTER_RE.test(t)) return 1
  if (NUM3_RE.test(t)) return 3
  if (NUM2_RE.test(t)) return 2
  if (NUM1_RE.test(t)) return 1
  if (UPPER_SECTION_RE.test(t)) return 2
  return fallback
}

/**
 * 是否为元信息标题（应降级为正文，不作为章节节点）。
 * 真实章节形态（编号/部件标题）一律不算元信息，避免误伤。
 */
export function isMetadataHeading(title: string): boolean {
  const t = (title ?? '').trim()
  if (!t) return true
  if (isChapterLike(t)) return false
  return METADATA_PATTERNS.some(re => re.test(t))
}