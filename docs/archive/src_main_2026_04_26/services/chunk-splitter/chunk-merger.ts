/**
 * Chunk 合并器
 * @module services/chunk-splitter/chunk-merger
 * @description 合并过小的 chunk，确保每个 chunk 达到最小大小要求
 */

import { SplitChunk, SplitConfig, DEFAULT_SPLIT_CONFIG } from './types'

/**
 * Chunk 合并器
 */
export class ChunkMerger {
  /**
   * 合并过小的 chunk
   * @param chunks 待合并的 chunks
   * @param config 切分配置
   * @returns 合并后的 chunks
   */
  merge(chunks: SplitChunk[], config: SplitConfig = DEFAULT_SPLIT_CONFIG): SplitChunk[] {
    const minSize = config.minChunkSize ?? DEFAULT_SPLIT_CONFIG.minChunkSize!
    const maxSize = config.maxChunkSize ?? DEFAULT_SPLIT_CONFIG.maxChunkSize!

    if (chunks.length === 0) return []

    const result: SplitChunk[] = []
    let currentChunk: SplitChunk | null = null

    for (const chunk of chunks) {
      // 初始化当前 chunk
      if (!currentChunk) {
        currentChunk = { ...chunk }
        continue
      }

      // 判断是否需要合并
      const shouldMerge = this.shouldMerge(currentChunk, chunk, minSize, maxSize)

      if (shouldMerge) {
        // 合并 chunk
        currentChunk = this.mergeChunks(currentChunk, chunk)
      } else {
        // 保存当前 chunk，开始新的 chunk
        result.push(currentChunk)
        currentChunk = { ...chunk }
      }
    }

    // 保存最后一个 chunk
    if (currentChunk) {
      result.push(currentChunk)
    }

    // 重新编号
    return this.reindex(result)
  }

  /**
   * 判断是否应该合并两个 chunk
   */
  private shouldMerge(chunk1: SplitChunk, chunk2: SplitChunk, minSize: number, maxSize: number): boolean {
    // 如果第一个 chunk 太小，考虑合并
    if (chunk1.content.length < minSize) {
      // 合并后不超过最大大小
      const mergedLength = chunk1.content.length + chunk2.content.length + 2 // 加上 '\n\n' 分隔符
      if (mergedLength <= maxSize) {
        return true
      }
    }

    return false
  }

  /**
   * 合并两个 chunk
   */
  private mergeChunks(chunk1: SplitChunk, chunk2: SplitChunk): SplitChunk {
    return {
      content: chunk1.content + '\n\n' + chunk2.content,
      index: chunk1.index, // 保持第一个 chunk 的索引，后面会重新编号
      title: chunk1.title || chunk2.title, // 优先使用第一个 chunk 的标题
      level: Math.min(chunk1.level, chunk2.level), // 使用较小的层级
      parentChunkId: chunk1.parentChunkId,
      splitMethod: chunk1.splitMethod,
      sectionPath: this.mergeSectionPath(chunk1.sectionPath, chunk2.sectionPath),
      startOffset: chunk1.startOffset,
      endOffset: chunk2.endOffset,
      sectionIndex: chunk1.sectionIndex
    }
  }

  /**
   * 合并层级路径
   */
  private mergeSectionPath(path1: string[], path2: string[]): string[] {
    // 如果路径相同，返回原路径
    if (path1.length === path2.length && path1.every((p, i) => p === path2[i])) {
      return path1
    }

    // 否则合并路径（保留第一个 chunk 的路径）
    return path1
  }

  /**
   * 重新编号 chunks
   */
  private reindex(chunks: SplitChunk[]): SplitChunk[] {
    return chunks.map((chunk, index) => ({
      ...chunk,
      index
    }))
  }

  /**
   * 分割过大的 chunk（超过 maxSize）
   * @param chunks 待分割的 chunks
   * @param maxSize 最大大小
   * @returns 分割后的 chunks
   */
  splitLarge(chunks: SplitChunk[], maxSize: number = 1500): SplitChunk[] {
    const result: SplitChunk[] = []

    for (const chunk of chunks) {
      if (chunk.content.length <= maxSize) {
        result.push(chunk)
      } else {
        // 分割大 chunk
        const splitChunks = this.splitChunk(chunk, maxSize)
        result.push(...splitChunks)
      }
    }

    return this.reindex(result)
  }

  /**
   * 分割单个 chunk
   */
  private splitChunk(chunk: SplitChunk, maxSize: number): SplitChunk[] {
    const content = chunk.content
    const chunks: SplitChunk[] = []

    let start = 0
    let subIndex = 0

    while (start < content.length) {
      let end = Math.min(start + maxSize, content.length)

      // 尝试在句子边界分割
      if (end < content.length) {
        const boundary = this.findSplitBoundary(content, start, end)
        if (boundary > start) {
          end = boundary
        }
      }

      chunks.push({
        content: content.slice(start, end).trim(),
        index: chunk.index + subIndex, // 临时索引，后面会重新编号
        title: subIndex === 0 ? chunk.title : undefined, // 只有第一个子 chunk 保留标题
        level: chunk.level,
        parentChunkId: chunk.parentChunkId,
        splitMethod: 'sub-semantic',
        sectionPath: chunk.sectionPath,
        startOffset: chunk.startOffset + start,
        endOffset: chunk.startOffset + end,
        sectionIndex: chunk.sectionIndex
      })

      start = end
      subIndex++
    }

    return chunks
  }

  /**
   * 查找分割边界（句子边界）
   */
  private findSplitBoundary(content: string, start: number, end: number): number {
    // 在 [start, end] 范围内查找最后一个句子边界
    const segment = content.slice(start, end)
    const boundaries = ['。', '！', '？', '\n', '.', '!', '?']

    let lastBoundary = -1
    for (const boundary of boundaries) {
      const index = segment.lastIndexOf(boundary)
      if (index > lastBoundary) {
        lastBoundary = index
      }
    }

    if (lastBoundary > start + 100) { // 至少保留 100 字符
      return start + lastBoundary + 1
    }

    return end
  }
}