/**
 * 语义切分器
 * @module platform/services/chunk-splitter/semantic-splitter
 * @description 按段落语义相似度进行切分
 */

import {
  SplitChunk,
  SplitConfig,
  DEFAULT_SPLIT_CONFIG,
  ParagraphInfo,
  SimilarityResult
} from './types'
import { ChunkMerger } from './chunk-merger'

/**
 * Embedding 服务接口
 */
export interface EmbeddingService {
  /**
   * 批量获取向量
   * @param texts 文本数组
   * @returns 向量数组
   */
  getBatchEmbeddings(texts: string[]): Promise<number[][]>
}

/**
 * 语义切分器
 */
export class SemanticSplitter {
  private chunkMerger: ChunkMerger
  private embeddingService: EmbeddingService

  constructor(embeddingService: EmbeddingService) {
    this.chunkMerger = new ChunkMerger()
    this.embeddingService = embeddingService
  }

  /**
   * 按语义相似度切分内容
   * @param content 文档内容
   * @param config 切分配置
   * @param parentInfo 父 chunk 信息（用于继承层级）
   * @returns 切分结果
   */
  async split(
    content: string,
    config: SplitConfig = DEFAULT_SPLIT_CONFIG,
    parentInfo?: { title?: string; level: number; sectionPath: string[]; sectionIndex?: number }
  ): Promise<SplitChunk[]> {
    // 1. 按段落分割
    const rawParagraphs = this.extractParagraphs(content)

    if (rawParagraphs.length === 0) {
      return [{
        content: content.trim(),
        index: 0,
        title: parentInfo?.title,
        level: parentInfo?.level ?? 1,
        splitMethod: 'semantic',
        sectionPath: parentInfo?.sectionPath ?? [],
        startOffset: 0,
        endOffset: content.length,
        sectionIndex: parentInfo?.sectionIndex
      }]
    }

    // 2. 预合并过短段落（减少 Embedding API 调用，提升语义质量）
    const minParagraphSize = (config.minChunkSize ?? DEFAULT_SPLIT_CONFIG.minChunkSize!) / 2 // 约一半的 minChunkSize
    const paragraphs = this.mergeShortParagraphs(rawParagraphs, minParagraphSize)

    // 3. 分批获取 Embedding（API 限制每次最多 10 个）
    const EMBEDDING_BATCH_SIZE = 10
    try {
      let embeddings: number[][] = []
      const paragraphContents = paragraphs.map(p => p.content)

      // 分批调用 Embedding API
      for (let i = 0; i < paragraphContents.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = paragraphContents.slice(i, i + EMBEDDING_BATCH_SIZE)
        const batchEmbeddings = await this.embeddingService.getBatchEmbeddings(batch)
        embeddings.push(...batchEmbeddings)
      }

      // 4. 计算相邻段落相似度
      const similarities = this.calculateSimilarities(paragraphs, embeddings)

      // 5. 在低相似度边界切分
      const threshold = config.similarityThreshold ?? DEFAULT_SPLIT_CONFIG.similarityThreshold!
      const boundaryIndices = this.findBoundaries(similarities, threshold)

      // 6. 根据边界切分段落
      const chunks = this.splitByBoundaries(paragraphs, boundaryIndices, parentInfo)

      // 7. 合并过小的 chunk（二次合并）
      const mergedChunks = this.chunkMerger.merge(chunks, config)

      // 8. 分割过大的 chunk（Embedding API 限制 8192 字符）
      const EMBEDDING_MAX_LENGTH = 8000 // 留一点余量
      const finalChunks = this.chunkMerger.splitLarge(mergedChunks, EMBEDDING_MAX_LENGTH)

      return finalChunks

    } catch (error: any) {
      // Embedding API 失败，抛出错误让上层处理
      throw new Error(`语义切分失败: Embedding API 调用错误 - ${error.message}`)
    }
  }

  /**
   * 提取段落（长段落会被分割）
   */
  private extractParagraphs(content: string): ParagraphInfo[] {
    // 按连续换行分割段落
    const rawParagraphs = content
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0)

    // 如果没有段落分隔，按单换行分割
    if (rawParagraphs.length === 1 && rawParagraphs[0].length > 8000) {
      rawParagraphs.splice(0, 1)
      const lines = content.split(/\n/).map(p => p.trim()).filter(p => p.length > 0)
      rawParagraphs.push(...lines)
    }

    // 分割过长段落（Embedding API 限制约 8000 字符）
    const MAX_PARAGRAPH_LENGTH = 8000
    const paragraphs: ParagraphInfo[] = []
    let currentOffset = 0

    for (const text of rawParagraphs) {
      if (text.length > MAX_PARAGRAPH_LENGTH) {
        // 分割过长段落
        const subParagraphs = this.splitLongParagraph(text, MAX_PARAGRAPH_LENGTH)
        for (const subText of subParagraphs) {
          const startIndex = content.indexOf(subText, currentOffset)
          const endIndex = startIndex !== -1 ? startIndex + subText.length : currentOffset + subText.length
          paragraphs.push({
            content: subText,
            index: paragraphs.length,
            startOffset: startIndex !== -1 ? startIndex : currentOffset,
            endOffset: endIndex
          })
          currentOffset = endIndex
        }
      } else {
        // 正常段落
        const startIndex = content.indexOf(text, currentOffset)
        const endIndex = startIndex !== -1 ? startIndex + text.length : currentOffset + text.length
        paragraphs.push({
          content: text,
          index: paragraphs.length,
          startOffset: startIndex !== -1 ? startIndex : currentOffset,
          endOffset: endIndex
        })
        currentOffset = endIndex
      }
    }

    return paragraphs
  }

  /**
   * 分割过长段落
   */
  private splitLongParagraph(text: string, maxLength: number): string[] {
    const result: string[] = []
    let start = 0

    while (start < text.length) {
      let end = Math.min(start + maxLength, text.length)

      // 尝试在句子边界分割
      if (end < text.length) {
        const segment = text.slice(start, end)
        const boundaries = ['。', '！', '？', '\n', '.', '!', '?']
        let lastBoundary = -1
        for (const boundary of boundaries) {
          const index = segment.lastIndexOf(boundary)
          if (index > lastBoundary) {
            lastBoundary = index
          }
        }
        if (lastBoundary > start + 100) { // 至少保留 100 字符
          end = start + lastBoundary + 1
        }
      }

      result.push(text.slice(start, end).trim())
      start = end
    }

    return result
  }

  /**
   * 预合并过短段落
   * 在 Embedding API 调用之前合并，减少 API 调用次数并提升语义质量
   */
  private mergeShortParagraphs(paragraphs: ParagraphInfo[], minSize: number): ParagraphInfo[] {
    if (paragraphs.length === 0) return []

    const MAX_MERGE_LENGTH = 8000 // Embedding API 限制
    const result: ParagraphInfo[] = []
    let current: ParagraphInfo | null = null

    for (const para of paragraphs) {
      if (!current) {
        current = { ...para }
        continue
      }

      // 如果当前段落过短，尝试与下一个段落合并
      if (current.content.length < minSize) {
        const mergedLength = current.content.length + para.content.length + 1 // +1 for '\n'
        // 只有合并后不超过最大长度才合并
        if (mergedLength <= MAX_MERGE_LENGTH) {
          current = {
            content: current.content + '\n' + para.content,
            index: current.index,
            startOffset: current.startOffset,
            endOffset: para.endOffset
          }
        } else {
          // 合并后超长，保存当前并开始新段落
          result.push(current)
          current = { ...para }
        }
      } else {
        // 当前段落够长，保存并开始新段落
        result.push(current)
        current = { ...para }
      }
    }

    // 保存最后一个段落
    if (current) {
      result.push(current)
    }

    // 重新编号
    return result.map((p, i) => ({ ...p, index: i }))
  }

  /**
   * 计算相邻段落相似度
   */
  private calculateSimilarities(paragraphs: ParagraphInfo[], embeddings: number[][]): SimilarityResult[] {
    const similarities: SimilarityResult[] = []

    for (let i = 0; i < paragraphs.length - 1; i++) {
      const similarity = this.cosineSimilarity(embeddings[i], embeddings[i + 1])
      similarities.push({
        index1: i,
        index2: i + 1,
        similarity,
        isBoundary: false // 后面根据阈值判断
      })
    }

    return similarities
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('向量长度不一致')
    }

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i]
      norm1 += vec1[i] * vec1[i]
      norm2 += vec2[i] * vec2[i]
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }

  /**
   * 查找切分边界（相似度低于阈值的位置）
   */
  private findBoundaries(similarities: SimilarityResult[], threshold: number): number[] {
    const boundaries: number[] = []

    for (const sim of similarities) {
      if (sim.similarity < threshold) {
        sim.isBoundary = true
        // 边界位置是 index2（段落 index2 是新 chunk 的开始）
        boundaries.push(sim.index2)
      }
    }

    return boundaries
  }

  /**
   * 根据边界切分段落
   */
  private splitByBoundaries(
    paragraphs: ParagraphInfo[],
    boundaries: number[],
    parentInfo?: { title?: string; level: number; sectionPath: string[]; sectionIndex?: number }
  ): SplitChunk[] {
    const chunks: SplitChunk[] = []

    // 如果没有边界，整个内容作为一个 chunk
    if (boundaries.length === 0) {
      const allContent = paragraphs.map(p => p.content).join('\n\n')
      return [{
        content: allContent,
        index: 0,
        title: parentInfo?.title,
        level: parentInfo?.level ?? 1,
        splitMethod: 'semantic',
        sectionPath: parentInfo?.sectionPath ?? [],
        startOffset: paragraphs[0].startOffset,
        endOffset: paragraphs[paragraphs.length - 1].endOffset,
        sectionIndex: parentInfo?.sectionIndex
      }]
    }

    // 根据边界切分
    let chunkStart = 0
    let globalIndex = 0

    for (const boundary of boundaries) {
      // 从 chunkStart 到 boundary 的段落组成一个 chunk
      const chunkParagraphs = paragraphs.slice(chunkStart, boundary)
      const chunkContent = chunkParagraphs.map(p => p.content).join('\n\n')

      chunks.push({
        content: chunkContent,
        index: globalIndex++,
        title: chunkStart === 0 ? parentInfo?.title : undefined,
        level: parentInfo?.level ?? 1,
        splitMethod: 'semantic',
        sectionPath: parentInfo?.sectionPath ?? [],
        startOffset: chunkParagraphs[0].startOffset,
        endOffset: chunkParagraphs[chunkParagraphs.length - 1].endOffset,
        sectionIndex: parentInfo?.sectionIndex
      })

      chunkStart = boundary
    }

    // 最后一个 chunk（从最后一个边界到结尾）
    const lastParagraphs = paragraphs.slice(chunkStart)
    if (lastParagraphs.length > 0) {
      const lastContent = lastParagraphs.map(p => p.content).join('\n\n')
      chunks.push({
        content: lastContent,
        index: globalIndex++,
        title: undefined,
        level: parentInfo?.level ?? 1,
        splitMethod: 'semantic',
        sectionPath: parentInfo?.sectionPath ?? [],
        startOffset: lastParagraphs[0].startOffset,
        endOffset: lastParagraphs[lastParagraphs.length - 1].endOffset,
        sectionIndex: parentInfo?.sectionIndex
      })
    }

    return chunks
  }
}