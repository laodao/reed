/**
 * 检索服务
 * @module services/retrieval.service
 * @description 实现混合检索（向量 + BM25 + RRF 融合）
 */

import { getDatabaseManager } from '../database'
import { EmbeddingService } from './embedding.service'
import type {
  SearchRequest,
  SearchResult,
  EmbeddingConfig
} from '../../shared/types/knowledge-base.types'

/**
 * 向量检索结果
 */
interface VectorSearchResult {
  chunkId: string
  score: number
}

/**
 * 关键词检索结果
 */
interface KeywordSearchResult {
  chunkId: string
  score: number
}

/**
 * 检索服务
 */
export class RetrievalService {
  private embeddingService: EmbeddingService
  private readonly rrfK = 60  // RRF 常数

  constructor() {
    this.embeddingService = new EmbeddingService()
  }

  /**
   * 混合检索
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const { knowledgeBaseId, query, topK = 5, vectorWeight = 0.7, threshold = 0.0 } = request

    try {
      // 1. 向量检索
      const vectorResults = await this.vectorSearch(knowledgeBaseId, query, topK * 2)

      // 2. 关键词检索
      const keywordResults = this.keywordSearch(knowledgeBaseId, query, topK * 2)

      // 3. RRF 融合
      const mergedResults = this.mergeResults(vectorResults, keywordResults, vectorWeight, topK)

      // 4. 过滤低分结果
      const filteredResults = mergedResults.filter(r => r.score >= threshold)

      // 5. 获取切片详情
      return await this.enrichResults(filteredResults)
    } catch (error: any) {
      console.error('[RetrievalService] 检索错误:', error)
      return []
    }
  }

  /**
   * 向量检索
   */
  async vectorSearch(
    knowledgeBaseId: string,
    query: string,
    topK: number
  ): Promise<VectorSearchResult[]> {
    try {
      const dbManager = getDatabaseManager()
      if (!dbManager.knowledgeBases || !dbManager.kbVectors) {
        return []
      }

      // 获取知识库信息
      const kb = dbManager.knowledgeBases.findById(knowledgeBaseId)
      if (!kb) {
        return []
      }

      // 获取 Embedding 配置
      const embeddingConfig: EmbeddingConfig = kb.embeddingConfig
        ? JSON.parse(kb.embeddingConfig)
        : { provider: kb.embeddingProvider as 'cloud' | 'local' }

      // 生成查询向量
      const embedResult = await this.embeddingService.embed(query, embeddingConfig)
      if (!embedResult.success || !embedResult.vector) {
        console.error('[RetrievalService] 向量化失败:', embedResult.error)
        return []
      }

      // 执行向量检索
      const results = dbManager.kbVectors.searchSimilar(knowledgeBaseId, embedResult.vector, topK)

      return results
    } catch (error: any) {
      console.error('[RetrievalService] 向量检索错误:', error)
      return []
    }
  }

  /**
   * BM25 关键词检索
   */
  keywordSearch(
    knowledgeBaseId: string,
    query: string,
    topK: number
  ): KeywordSearchResult[] {
    try {
      const dbManager = getDatabaseManager()
      if (!dbManager.kbInvertedIndex) {
        return []
      }

      // 分词
      const terms = this.tokenize(query)
      if (terms.length === 0) {
        return []
      }

      // 获取词项统计
      const docFreqs = dbManager.kbInvertedIndex.getDocumentFrequencies(knowledgeBaseId)
      const totalChunks = dbManager.kbInvertedIndex.getChunkCount(knowledgeBaseId)
      const avgChunkLength = dbManager.kbInvertedIndex.getAverageChunkLength(knowledgeBaseId)

      if (totalChunks === 0) {
        return []
      }

      // 获取每个词的倒排列表
      const invertedLists = dbManager.kbInvertedIndex.findByTerms(knowledgeBaseId, terms)

      // 计算 BM25 分数
      const scores = new Map<string, number>()
      const k1 = 1.5  // BM25 参数
      const b = 0.75  // BM25 参数

      for (const [term, items] of invertedLists) {
        const df = docFreqs.get(term) || 1
        const idf = Math.log((totalChunks - df + 0.5) / (df + 0.5) + 1)

        for (const item of items) {
          const tf = item.termFrequency
          // 假设每个切片平均长度
          const dl = avgChunkLength
          const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgChunkLength)))

          const currentScore = scores.get(item.chunkId) || 0
          scores.set(item.chunkId, currentScore + idf * tfNorm)
        }
      }

      // 排序并返回 Top-K
      const results = Array.from(scores.entries())
        .map(([chunkId, score]) => ({ chunkId, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)

      return results
    } catch (error: any) {
      console.error('[RetrievalService] 关键词检索错误:', error)
      return []
    }
  }

  /**
   * RRF 结果融合
   */
  mergeResults(
    vectorResults: VectorSearchResult[],
    keywordResults: KeywordSearchResult[],
    vectorWeight: number,
    topK: number
  ): Array<{ chunkId: string; score: number }> {
    const scores = new Map<string, number>()

    // 向量检索得分
    vectorResults.forEach((r, i) => {
      const current = scores.get(r.chunkId) || 0
      scores.set(r.chunkId, current + vectorWeight / (this.rrfK + i + 1))
    })

    // 关键词检索得分
    keywordResults.forEach((r, i) => {
      const current = scores.get(r.chunkId) || 0
      scores.set(r.chunkId, current + (1 - vectorWeight) / (this.rrfK + i + 1))
    })

    // 按得分排序，返回 Top-K
    return Array.from(scores.entries())
      .map(([chunkId, score]) => ({ chunkId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /**
   * 丰富结果（添加文档信息）
   */
  private async enrichResults(
    results: Array<{ chunkId: string; score: number }>
  ): Promise<SearchResult[]> {
    if (results.length === 0) return []

    const dbManager = getDatabaseManager()
    if (!dbManager.kbChunks || !dbManager.kbDocuments) {
      return []
    }

    const enrichedResults: SearchResult[] = []

    for (const result of results) {
      const chunk = dbManager.kbChunks.findById(result.chunkId)
      if (!chunk) continue

      const document = dbManager.kbDocuments.findById(chunk.documentId)
      if (!document) continue

      enrichedResults.push({
        chunkId: result.chunkId,
        documentId: chunk.documentId,
        documentName: document.name,
        content: chunk.content,
        score: result.score,
        metadata: chunk.metadata
      })
    }

    return enrichedResults
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    // 简单分词：中英文分词
    // 对于中文，按字符分割；对于英文，按单词分割
    const tokens: string[] = []

    // 英文单词
    const englishWords = text.toLowerCase().match(/[a-z]+/g) || []
    tokens.push(...englishWords.filter(w => w.length > 1))

    // 中文字符（每个字符作为一个词）
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || []
    tokens.push(...chineseChars)

    // 数字
    const numbers = text.match(/\d+/g) || []
    tokens.push(...numbers)

    return [...new Set(tokens)]  // 去重
  }
}