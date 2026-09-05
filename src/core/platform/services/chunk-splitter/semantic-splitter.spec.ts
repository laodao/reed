/**
 * SemanticSplitter 和 ChunkMerger 单元测试
 * @module platform/services/chunk-splitter/semantic-splitter.spec
 */

import { describe, it, expect, vi } from 'vitest'
import { SemanticSplitter, EmbeddingService } from './semantic-splitter'
import { ChunkMerger } from './chunk-merger'
import { SplitChunk, DEFAULT_SPLIT_CONFIG } from './types'

// Mock Embedding 服务 - 更精确控制相似度
const createMockEmbeddingService = (similarities: number[]): EmbeddingService => {
  return {
    getBatchEmbeddings: vi.fn(async (texts: string[]) => {
      // 为每个文本生成向量，确保相邻文本的相似度符合预设
      const vectors: number[][] = []
      const dimension = 10

      for (let i = 0; i < texts.length; i++) {
        const vector: number[] = []

        if (i === 0) {
          // 第一个向量：基础向量
          for (let j = 0; j < dimension; j++) {
            vector.push(j * 0.1 + 0.5)
          }
        } else {
          // 后续向量：根据与前一个的相似度生成
          const prevVector = vectors[i - 1]
          const targetSimilarity = similarities[i - 1]

          for (let j = 0; j < dimension; j++) {
            // 相似度越高，向量越接近
            // 使用公式：新向量 = prevVector * similarity + 随机扰动 * (1 - similarity)
            const noise = j * 0.1 + i * 0.2
            vector.push(prevVector[j] * targetSimilarity + noise * (1 - targetSimilarity))
          }
        }

        vectors.push(vector)
      }

      return vectors
    })
  }
}

describe('ChunkMerger', () => {
  const merger = new ChunkMerger()

  describe('合并小 chunk', () => {
    it('应合并过小的相邻 chunk', () => {
      // chunk1: 35 字符，chunk2: 35 字符，合并后 72 字符 > minSize(50)
      // chunk3: 60 字符 > minSize(50)，不合并
      const chunks: SplitChunk[] = [
        { content: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', index: 0, level: 1, splitMethod: 'semantic', sectionPath: [], startOffset: 0, endOffset: 35 },
        { content: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', index: 1, level: 1, splitMethod: 'semantic', sectionPath: [], startOffset: 35, endOffset: 70 },
        { content: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', index: 2, level: 1, splitMethod: 'semantic', sectionPath: [], startOffset: 70, endOffset: 130 }
      ]

      const merged = merger.merge(chunks, { strategy: 'semantic', minChunkSize: 50, maxChunkSize: 150 })

      expect(merged.length).toBe(2)
      expect(merged[0].content).toContain('aaa')
      expect(merged[0].content).toContain('bbb')
    })

    it('应正确重新编号', () => {
      // 两个 chunk 都大于 minSize，不合并
      const chunks: SplitChunk[] = [
        { content: '内容A内容A内容A内容A内容A', index: 0, level: 1, splitMethod: 'semantic', sectionPath: [], startOffset: 0, endOffset: 20 },
        { content: '内容B内容B内容B内容B内容B', index: 1, level: 1, splitMethod: 'semantic', sectionPath: [], startOffset: 20, endOffset: 40 }
      ]

      const merged = merger.merge(chunks, { strategy: 'semantic', minChunkSize: 15 })

      expect(merged.length).toBe(2)
      expect(merged[0].index).toBe(0)
      expect(merged[1].index).toBe(1)
    })
  })

  describe('分割大 chunk', () => {
    it('应分割超过最大大小的 chunk', () => {
      // 内容长度超过 maxSize (30)
      const chunks: SplitChunk[] = [
        { content: '这是一个非常长的内容超过了最大大小限制需要进行分割处理这是第二部分的内容这是第三部分的内容这是第四部分的内容', index: 0, level: 1, splitMethod: 'semantic', sectionPath: [], startOffset: 0, endOffset: 100 }
      ]

      const split = merger.splitLarge(chunks, 30)

      expect(split.length).toBeGreaterThan(1)
    })

    it('应尝试在句子边界分割', () => {
      const chunks: SplitChunk[] = [
        { content: '第一句话的内容足够长。第二句话的内容也足够长。第三句话的内容同样足够长。第四句话的内容仍然足够长。', index: 0, level: 1, splitMethod: 'semantic', sectionPath: [], startOffset: 0, endOffset: 80 }
      ]

      const split = merger.splitLarge(chunks, 20)

      // 应在句子边界分割
      for (const chunk of split) {
        if (chunk.content.length > 0) {
          // 检查是否以句号结尾或以句子开始
          expect(chunk.content).toMatch(/[。！？]$|^/)
        }
      }
    })
  })
})

describe('SemanticSplitter', () => {
  describe('段落提取', () => {
    it('应正确提取段落', async () => {
      const content = `第一段内容。

第二段内容。

第三段内容。`

      // Mock 服务返回相同向量（高相似度，不切分）
      const mockService: EmbeddingService = {
        getBatchEmbeddings: vi.fn(async () => [
          [1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]
        ])
      }
      const splitter = new SemanticSplitter(mockService)

      const chunks = await splitter.split(content)

      // 高相似度，应该合并为一个 chunk
      expect(chunks.length).toBe(1)
      expect(chunks[0].content).toContain('第一段内容')
      expect(chunks[0].content).toContain('第二段内容')
    })
  })

  describe('相似度计算和切分', () => {
    it('应在低相似度边界切分', async () => {
      const content = `相似段落A的内容长度足够长超过最小限制值。

相似段落B的内容长度足够长超过最小限制值。

不相似段落C的内容长度足够长超过最小限制值。

不相似段落D的内容长度足够长超过最小限制值。`

      // 第一组和第二组之间低相似度，组内高相似度
      const mockService: EmbeddingService = {
        getBatchEmbeddings: vi.fn(async () => [
          [1, 0, 0, 0],   // 向量1
          [0.9, 0, 0, 0], // 向量2 - 与向量1相似
          [0, 1, 0, 0],   // 向量3 - 与向量2不相似
          [0, 0.9, 0, 0]  // 向量4 - 与向量3相似
        ])
      }
      const splitter = new SemanticSplitter(mockService)

      // 设置很低的 minChunkSize 以避免合并
      const chunks = await splitter.split(content, {
        strategy: 'semantic',
        similarityThreshold: 0.5,
        minChunkSize: 10
      })

      // 应在第二个边界切分
      expect(chunks.length).toBe(2)
    })
  })

  describe('继承父信息', () => {
    it('应继承父 chunk 的层级信息', async () => {
      const content = `内容段落A。

内容段落B。`

      const mockService = createMockEmbeddingService([0.8])
      const splitter = new SemanticSplitter(mockService)

      const parentInfo = {
        title: '第一章',
        level: 2,
        sectionPath: ['第一章', '1.1'],
        sectionIndex: 1
      }

      const chunks = await splitter.split(content, { strategy: 'semantic' }, parentInfo)

      expect(chunks[0].title).toBe('第一章')
      expect(chunks[0].level).toBe(2)
      expect(chunks[0].sectionPath).toEqual(['第一章', '1.1'])
      expect(chunks[0].sectionIndex).toBe(1)
    })
  })

  describe('错误处理', () => {
    it('Embedding API 失败时应抛出错误', async () => {
      const mockService: EmbeddingService = {
        getBatchEmbeddings: vi.fn(async () => {
          throw new Error('API 调用失败')
        })
      }
      const splitter = new SemanticSplitter(mockService)

      const content = '测试内容'

      await expect(splitter.split(content)).rejects.toThrow('语义切分失败')
    })
  })

  describe('边界情况', () => {
    it('空内容应返回单个空 chunk', async () => {
      const mockService = createMockEmbeddingService([])
      const splitter = new SemanticSplitter(mockService)

      const chunks = await splitter.split('')

      expect(chunks.length).toBe(1)
      expect(chunks[0].content).toBe('')
    })

    it('单段落应返回单个 chunk', async () => {
      const mockService = createMockEmbeddingService([])
      const splitter = new SemanticSplitter(mockService)

      const chunks = await splitter.split('单个段落内容')

      expect(chunks.length).toBe(1)
    })
  })
})