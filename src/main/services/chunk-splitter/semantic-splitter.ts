/**
 * 语义切分器
 * @module services/chunk-splitter/semantic-splitter
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
    const paragraphs = this.extractParagraphs(content)

    if (paragraphs.length === 0) {
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

    // 2. 分批获取 Embedding（API 限制每次最多 10 个）
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

      // 3. 计算相邻段落相似度
      const similarities = this.calculateSimilarities(paragraphs, embeddings)

      // 4. 在低相似度边界切分
      const threshold = config.similarityThreshold ?? DEFAULT_SPLIT_CONFIG.similarityThreshold!
      const boundaryIndices = this.findBoundaries(similarities, threshold)

      // 5. 根据边界切分段落
      const chunks = this.splitByBoundaries(paragraphs, boundaryIndices, parentInfo)

      // 6. 合并过小的 chunk
      const mergedChunks = this.chunkMerger.merge(chunks, config)

      // 7. 分割过大的 chunk（Embedding API 限制 8192 字符）
      const EMBEDDING_MAX_LENGTH = 8000 // 留一点余量
      const finalChunks = this.chunkMerger.splitLarge(mergedChunks, EMBEDDING_MAX_LENGTH)

      return finalChunks

    } catch (error: any) {
      // Embedding API 失败，抛出错误让上层处理
      throw new Error(`语义切分失败: Embedding API 调用错误 - ${error.message}`)
    }
  }

  /**
   * 提取段落
   */
  private extractParagraphs(content: string): ParagraphInfo[] {
    // 按连续换行分割段落
    const paragraphTexts = content
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0)

    // 计算每个段落的起始位置
    const paragraphs: ParagraphInfo[] = []
    let currentOffset = 0

    for (const text of paragraphTexts) {
      // 在原文中查找段落位置
      const startIndex = content.indexOf(text, currentOffset)
      const endIndex = startIndex + text.length

      paragraphs.push({
        content: text,
        index: paragraphs.length,
        startOffset: startIndex !== -1 ? startIndex : currentOffset,
        endOffset: endIndex
      })

      currentOffset = endIndex
    }

    return paragraphs
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