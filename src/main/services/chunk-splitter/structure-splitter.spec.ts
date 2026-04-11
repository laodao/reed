/**
 * StructureSplitter 单元测试
 * @module services/chunk-splitter/structure-splitter.spec
 */

import { describe, it, expect } from 'vitest'
import { StructureSplitter } from './structure-splitter'
import { StructureInfo, SplitChunk } from './types'

describe('StructureSplitter', () => {
  const splitter = new StructureSplitter()

  describe('基本切分功能', () => {
    it('应正确切分 Markdown 结构', () => {
      const content = `# 第一章\n\n内容A\n\n# 第二章\n\n内容B\n\n# 第三章\n\n内容C`
      const structure: StructureInfo = {
        hasStructure: true,
        structureType: 'markdown',
        sections: [
          { title: '第一章', level: 1, content: '内容A', startIndex: 0, endIndex: 15 },
          { title: '第二章', level: 1, content: '内容B', startIndex: 15, endIndex: 30 },
          { title: '第三章', level: 1, content: '内容C', startIndex: 30, endIndex: 45 }
        ]
      }

      const chunks = splitter.split(content, structure)

      expect(chunks.length).toBe(3)
      expect(chunks[0].title).toBe('第一章')
      expect(chunks[0].content).toBe('内容A')
      expect(chunks[0].level).toBe(1)
      expect(chunks[0].splitMethod).toBe('structure')
    })

    it('应正确构建层级路径', () => {
      const structure: StructureInfo = {
        hasStructure: true,
        structureType: 'markdown',
        sections: [
          { title: '第一章', level: 1, content: '内容A', startIndex: 0, endIndex: 10 },
          { title: '1.1 小节', level: 2, content: '内容B', startIndex: 10, endIndex: 20, parentTitle: '第一章' }
        ]
      }

      const chunks = splitter.split('', structure)

      expect(chunks[0].sectionPath).toEqual(['第一章'])
      expect(chunks[1].sectionPath).toEqual(['第一章', '1.1 小节'])
    })

    it('无结构时应返回单个 chunk', () => {
      const content = '这是无结构的文本内容'
      const structure: StructureInfo = {
        hasStructure: false,
        structureType: 'none',
        sections: []
      }

      const chunks = splitter.split(content, structure)

      expect(chunks.length).toBe(1)
      expect(chunks[0].content).toBe(content)
      expect(chunks[0].title).toBeUndefined()
      expect(chunks[0].level).toBe(1)
    })
  })

  describe('过滤空白章节', () => {
    it('应过滤掉内容过少的章节', () => {
      const chunks: SplitChunk[] = [
        { content: '短', index: 0, level: 1, splitMethod: 'structure', sectionPath: ['A'], startOffset: 0, endOffset: 1 },
        { content: '这是足够长的内容超过十个字符', index: 1, level: 1, splitMethod: 'structure', sectionPath: ['B'], startOffset: 1, endOffset: 20 }
      ]

      const filtered = splitter.filterEmptySections(chunks, 10)

      expect(filtered.length).toBe(1)
      expect(filtered[0].content).toBe('这是足够长的内容超过十个字符')
      expect(filtered[0].index).toBe(0) // 重新编号
    })

    it('应过滤分隔线等无意义内容', () => {
      const chunks: SplitChunk[] = [
        { content: '这是有效内容长度超过十个字符以上', index: 0, level: 1, splitMethod: 'structure', sectionPath: [], startOffset: 0, endOffset: 20 },
        { content: '---', index: 1, level: 1, splitMethod: 'structure', sectionPath: [], startOffset: 20, endOffset: 23 },
        { content: '***', index: 2, level: 1, splitMethod: 'structure', sectionPath: [], startOffset: 23, endOffset: 26 },
        { content: '___', index: 3, level: 1, splitMethod: 'structure', sectionPath: [], startOffset: 26, endOffset: 29 },
        { content: '====', index: 4, level: 1, splitMethod: 'structure', sectionPath: [], startOffset: 29, endOffset: 33 },
        { content: '另一个有效内容长度也超过十个字符', index: 5, level: 1, splitMethod: 'structure', sectionPath: [], startOffset: 33, endOffset: 60 }
      ]

      const filtered = splitter.filterEmptySections(chunks, 10)

      expect(filtered.length).toBe(2)
      expect(filtered[0].content).toBe('这是有效内容长度超过十个字符以上')
      expect(filtered[1].content).toBe('另一个有效内容长度也超过十个字符')
    })

    it('应保留有标题的短内容', () => {
      const chunks: SplitChunk[] = [
        { content: '短', index: 0, level: 1, splitMethod: 'structure', sectionPath: [], title: '短标题', startOffset: 0, endOffset: 1 }
      ]

      const filtered = splitter.filterEmptySections(chunks, 50)

      expect(filtered.length).toBe(1)
      expect(filtered[0].title).toBe('短标题')
    })
  })

  describe('查找过长章节', () => {
    it('应正确识别过长章节', () => {
      const chunks: SplitChunk[] = [
        { content: '短内容', index: 0, level: 1, splitMethod: 'structure', sectionPath: ['A'], startOffset: 0, endOffset: 5 },
        { content: '这是一个非常长的章节内容，超过了1000字符的限制...' + 'x'.repeat(1000), index: 1, level: 1, splitMethod: 'structure', sectionPath: ['B'], startOffset: 5, endOffset: 1005 }
      ]

      const longSections = splitter.findLongSections(chunks, 500)

      expect(longSections.length).toBe(1)
      expect(longSections[0].content.length).toBeGreaterThan(500)
    })
  })

  describe('合并小章节', () => {
    it('应合并相邻的同级小章节', () => {
      // 设置一个场景：前两个小，合并后刚好超过 minSize 但不超过 maxSize
      // 第三个足够长，保持独立
      const chunks: SplitChunk[] = [
        { content: '这是第一个短章节的内容，长度适中', index: 0, level: 1, splitMethod: 'structure', sectionPath: ['第一章'], startOffset: 0, endOffset: 20 },
        { content: '这是第二个短章节的内容，长度适中', index: 1, level: 1, splitMethod: 'structure', sectionPath: ['第二章'], startOffset: 20, endOffset: 40 },
        { content: '这是第三个章节的内容，这是一个非常长的内容，超过了最大大小限制，所以不会被合并到前面的chunk中，因为合并后会超过maxSize的限制值', index: 2, level: 1, splitMethod: 'structure', sectionPath: ['第三章'], startOffset: 40, endOffset: 100 }
      ]

      // minSize = 50，maxSize = 100
      // 前两个各约 30 字符，合并后约 60 字符，超过 minSize
      // 第三个约 80 字符，与前面合并后超过 maxSize，不合并
      const merged = splitter.mergeSmallSections(chunks, 50, 100)

      // 前两个小章节应该被合并，第三个保持独立
      expect(merged.length).toBe(2)
      expect(merged[0].content).toContain('第一个短章节')
      expect(merged[0].content).toContain('第二个短章节')
    })

    it('不应合并不同级别的章节', () => {
      const chunks: SplitChunk[] = [
        { content: '短内容A', index: 0, level: 1, splitMethod: 'structure', sectionPath: ['第一章'], startOffset: 0, endOffset: 5 },
        { content: '短内容B', index: 1, level: 2, splitMethod: 'structure', sectionPath: ['第一章', '1.1'], startOffset: 5, endOffset: 10 }
      ]

      const merged = splitter.mergeSmallSections(chunks, 50, 200)

      expect(merged.length).toBe(2) // 不同级别，不合并
    })

    it('不应合并超过最大大小的章节', () => {
      const chunks: SplitChunk[] = [
        { content: '内容A', index: 0, level: 1, splitMethod: 'structure', sectionPath: ['A'], startOffset: 0, endOffset: 5 },
        { content: '内容B', index: 1, level: 1, splitMethod: 'structure', sectionPath: ['B'], startOffset: 5, endOffset: 10 }
      ]

      // 设置最小大小很小，最大大小也很小
      const merged = splitter.mergeSmallSections(chunks, 1, 5)

      expect(merged.length).toBe(2) // 合并后超过最大大小，不合并
    })
  })

  describe('全局索引', () => {
    it('应正确分配全局索引', () => {
      const structure: StructureInfo = {
        hasStructure: true,
        structureType: 'markdown',
        sections: [
          { title: 'A', level: 1, content: '内容', startIndex: 0, endIndex: 10 },
          { title: 'B', level: 1, content: '内容', startIndex: 10, endIndex: 20 },
          { title: 'C', level: 1, content: '内容', startIndex: 20, endIndex: 30 }
        ]
      }

      const chunks = splitter.split('', structure)

      expect(chunks[0].index).toBe(0)
      expect(chunks[1].index).toBe(1)
      expect(chunks[2].index).toBe(2)
    })
  })
})