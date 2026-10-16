/**
 * Markdown 段落感知子切
 * @module platform/services/chunk-splitter/markdown-splitter
 * @description 把长章节（或任意 Markdown 片段）按「段落（空行分隔）」边界切成
 *              ≤ maxChunkSize 的块：切点永远落在段落边界，段落完整保留；
 *              单个段落超过上限时按句子边界兜底（text-boundary），
 *              不依赖 Embedding API，也不存在 8000 字符硬切切断句子的情况。
 *
 * 输出为「裸块」（不含层级包装），由调用方（HybridSplitter）经
 * HierarchyBuilder.build 统一补层级/父链——与既有语义子切产物的消费端一致，
 * 故 splitMethod 复用 'sub-semantic'（真实语义是段落子切）。
 */
import type { SplitChunk } from './types'
import { splitLongText } from './text-boundary'

/** 段落感知子切参数 */
export interface ParagraphSubSplitOptions {
  /** 单块最大字符数（通常来自 SplitConfig.maxChunkSize） */
  maxChunkSize: number
  /** 单块最小字符数（低于此值的尾块并入前块，除非前块放不下） */
  minChunkSize: number
}

/** 父章节身份（层级包装由外层完成，这里仅透传） */
export interface SectionIdentity {
  title?: string
  sectionPath: string[]
  sectionIndex?: number
}

/** 已定位的段落块（text + 相对原文的近似位置） */
interface LocatedBlock {
  text: string
  start: number
  end: number
}

/**
 * 按段落切分章节内容。
 * @param content 章节完整内容（可能以 Markdown 标题行开头，标题行会被剥离）
 * @param options 切分参数
 * @param parent 父章节身份
 * @returns 裸块列表（index 从 0 编号）
 */
export function splitSectionByParagraphs(
  content: string,
  options: ParagraphSubSplitOptions,
  parent: SectionIdentity,
): SplitChunk[] {
  const { maxChunkSize, minChunkSize } = options
  const blocks = content
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(block => block.length > 0)

  // 剥离章节标题行（Markdown 标题由父 chunk 的 title 承载，不重复进正文）
  const bodyBlocks = blocks.length > 0 && /^#{1,6}\s+/.test(blocks[0]) ? blocks.slice(1) : blocks
  if (bodyBlocks.length === 0) return []

  // 定位每块的近似 [start, end)：indexOf 从游标起找，找不到退化顺序累计（仅展示用元数据）
  const located: LocatedBlock[] = []
  let cursor = 0
  for (const block of bodyBlocks) {
    const idx = content.indexOf(block, cursor)
    const start = idx !== -1 ? idx : cursor
    located.push({ text: block, start, end: start + block.length })
    cursor = start + block.length + 2 // 近似跳过 "\n\n"
  }

  const chunks: SplitChunk[] = []
  const emit = (units: LocatedBlock[]): void => {
    if (units.length === 0) return
    chunks.push({
      content: units.map(u => u.text).join('\n\n'),
      index: chunks.length,
      title: parent.title,
      level: 1,
      splitMethod: 'sub-semantic',
      sectionPath: parent.sectionPath,
      sectionIndex: parent.sectionIndex,
      startOffset: units[0].start,
      endOffset: units[units.length - 1].end,
    })
  }

  let current: LocatedBlock[] = []
  let currentLen = 0

  for (const item of located) {
    // 单段超长：先收掉当前累积，再按句子边界切该段（各句子单元独立成块）
    if (item.text.length > maxChunkSize) {
      emit(current)
      current = []
      currentLen = 0
      const parts = splitLongText(item.text, maxChunkSize)
      let partStart = item.start
      const units: LocatedBlock[] = []
      for (const part of parts) {
        units.push({ text: part, start: partStart, end: partStart + part.length })
        partStart += part.length + 1
      }
      for (const unit of units) emit([unit])
      continue
    }

    // 段落累积：超上限且当前块已够小 → 在段落边界收块
    const gap = current.length > 0 ? 2 : 0
    if (currentLen + gap + item.text.length > maxChunkSize && currentLen >= minChunkSize) {
      emit(current)
      current = []
      currentLen = 0
    }
    current.push(item)
    currentLen += gap + item.text.length
  }

  // 尾部残余：过小且并入前块不超上限 → 并入；否则独立成块
  if (current.length > 0) {
    const trail: LocatedBlock[] = current
    const trailLen = currentLen
    if (chunks.length > 0 && trailLen < minChunkSize) {
      const last = chunks[chunks.length - 1]
      const mergedContent = last.content + '\n\n' + trail.map(u => u.text).join('\n\n')
      if (mergedContent.length <= maxChunkSize) {
        chunks[chunks.length - 1] = {
          ...last,
          content: mergedContent,
          endOffset: trail[trail.length - 1].end,
        }
        current = []
        currentLen = 0
      }
    }
    if (current.length > 0) emit(current)
  }

  return chunks
}