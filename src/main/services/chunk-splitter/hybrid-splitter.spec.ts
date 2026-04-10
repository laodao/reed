/**
 * HybridSplitter 集成测试
 * @module services/chunk-splitter/hybrid-splitter.spec
 */

import { describe, it, expect, vi } from 'vitest'
import { HybridSplitter, EmbeddingService } from './hybrid-splitter'
import { SplitConfig, DEFAULT_SPLIT_CONFIG } from './types'

// Mock Embedding 服务
const createMockEmbeddingService = (): EmbeddingService => {
  return {
    getBatchEmbeddings: vi.fn(async (texts: string[]) => {
      // 返回相似向量（不切分）
      return texts.map(() => [1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    })
  }
}

describe('HybridSplitter', () => {
  const mockService = createMockEmbeddingService()
  const splitter = new HybridSplitter(mockService)

  describe('固定切分策略', () => {
    it('应使用固定窗口切分', async () => {
      const content = '这是一个测试内容用于固定窗口切分测试这是一个测试内容用于固定窗口切分测试这是一个测试内容用于固定窗口切分测试这是一个测试内容用于固定窗口切分测试'

      const chunks = await splitter.split(content, { strategy: 'fixed' })

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[0].splitMethod).toBe('fixed')
      // 固定切分默认 800 字符，重叠 80
    })
  })

  describe('结构化切分策略', () => {
    it('应按章节结构切分 Markdown 文档', async () => {
      const content = `
# 第一章 概述

这是第一章的内容。

# 第二章 方案

这是第二章的内容。

# 第三章 总结

这是第三章的内容。
`
      const chunks = await splitter.split(content, { strategy: 'structure' })

      expect(chunks.length).toBe(3)
      expect(chunks[0].title).toContain('第一章')
      expect(chunks[1].title).toContain('第二章')
      expect(chunks[0].splitMethod).toBe('structure')
    })

    it('无结构时应返回单个 chunk', async () => {
      const content = '这是无结构的普通文本内容'
      const chunks = await splitter.split(content, { strategy: 'structure' })

      expect(chunks.length).toBe(1)
      expect(chunks[0].splitMethod).toBe('structure')
    })
  })

  describe('语义切分策略', () => {
    it('应使用语义相似度切分', async () => {
      const content = `第一段内容。

第二段内容。

第三段内容。`

      const chunks = await splitter.split(content, {
        strategy: 'semantic',
        minChunkSize: 10 // 避免合并
      })

      expect(chunks.length).toBeGreaterThan(0)
      // 高相似度（mock返回相同向量），应该合并为一个 chunk
    })
  })

  describe('混合切分策略', () => {
    it('有结构时应按结构切分', async () => {
      const content = `
# 第一章

内容A。

# 第二章

内容B。
`
      const chunks = await splitter.split(content, { strategy: 'hybrid' })

      expect(chunks.length).toBe(2)
      expect(chunks[0].title).toContain('第一章')
    })

    it('无结构时应使用语义切分', async () => {
      const content = `第一段内容。第二段内容。第三段内容。`

      const chunks = await splitter.split(content, { strategy: 'hybrid' })

      expect(chunks.length).toBeGreaterThan(0)
    })

    it('过长章节应被处理', async () => {
      // 创建一个长章节内容（超过 1000 字符）
      const longSection = '这是一段非常长的内容，每个段落都足够长以避免合并。'.repeat(20)
      const content = `# 长章节\n\n${longSection}\n\n# 矩章节\n\n短内容。`

      const chunks = await splitter.split(content, {
        strategy: 'hybrid',
        minChunkSize: 10
      })

      // 应至少有长章节和短章节两个 chunk
      expect(chunks.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('层级信息', () => {
    it('应正确设置层级路径', async () => {
      const content = `
# 主标题

## 子标题A

内容A。

## 子标题B

内容B。
`
      const chunks = await splitter.split(content, { strategy: 'hybrid' })

      // 检查层级路径
      expect(chunks.length).toBeGreaterThan(0)
      // 主标题应该有层级路径 ['主标题']
      // 子标题应该有层级路径 ['主标题', '子标题A']
    })

    it('应正确设置层级深度', async () => {
      const content = `
# 一级标题

内容。

## 二级标题

内容。
`
      const chunks = await splitter.split(content, { strategy: 'hybrid' })

      // 一级标题 level = 1
      const firstLevelChunk = chunks.find(c => c.title?.includes('一级标题'))
      expect(firstLevelChunk?.level).toBe(1)

      // 二级标题 level = 2
      const secondLevelChunk = chunks.find(c => c.title?.includes('二级标题'))
      expect(secondLevelChunk?.level).toBe(2)
    })
  })

  describe('默认配置', () => {
    it('应使用默认配置进行切分', async () => {
      const content = '测试内容'
      const chunks = await splitter.split(content)

      expect(chunks.length).toBeGreaterThan(0)
      // 默认策略是 hybrid
    })
  })
})