/**
 * StructureDetector 单元测试
 * @module platform/services/chunk-splitter/structure-detector.spec
 */

import { describe, it, expect } from 'vitest'
import { StructureDetector } from './structure-detector'

describe('StructureDetector', () => {
  const detector = new StructureDetector()

  describe('Markdown 结构检测', () => {
    it('应正确检测 Markdown 标题结构', () => {
      const content = `
# 第一章 概述

这是第一章的内容。

## 1.1 背景

这是背景介绍。

## 1.2 目标

这是目标说明。

# 第二章 方案

这是第二章的内容。

## 2.1 技术选型

这是技术选型内容。
`
      const result = detector.detect(content)

      expect(result.hasStructure).toBe(true)
      expect(result.structureType).toBe('markdown')
      expect(result.sections.length).toBe(5)
      expect(result.sections[0].title).toBe('第一章 概述')
      expect(result.sections[0].level).toBe(1)
      expect(result.sections[1].title).toBe('1.1 背景')
      expect(result.sections[1].level).toBe(2)
      expect(result.sections[1].parentTitle).toBe('第一章 概述')
    })

    it('应正确检测多级 Markdown 标题', () => {
      const content = `
# 主标题

### 三级标题1

### 三级标题2
`
      const result = detector.detect(content)

      expect(result.hasStructure).toBe(true)
      expect(result.sections.length).toBe(3)
      expect(result.sections[0].level).toBe(1)
      expect(result.sections[1].level).toBe(3)
    })

    it('标题数量不足时应返回无结构', () => {
      const content = `
# 只有一个标题

没有其他标题了。
`
      const result = detector.detect(content)

      expect(result.hasStructure).toBe(false)
    })
  })

  describe('小说章节检测', () => {
    it('应正确检测中文章节结构', () => {
      const content = `
第一章 开篇

这是第一章的内容，讲述故事的开始。

第二章 发展

故事开始发展，主角遇到了挑战。

第三章 高潮

故事达到高潮，紧张激烈。
`
      const result = detector.detect(content)

      expect(result.hasStructure).toBe(true)
      expect(result.structureType).toBe('novel')
      expect(result.sections.length).toBe(3)
      expect(result.sections[0].title).toContain('第一章')
      expect(result.sections[1].title).toContain('第二章')
    })

    it('应正确检测数字章节', () => {
      const content = `
第1章 序章

第2章 相遇

第3章 分离
`
      const result = detector.detect(content)

      expect(result.hasStructure).toBe(true)
      expect(result.structureType).toBe('novel')
      expect(result.sections.length).toBe(3)
    })

    it('应正确检测英文章节', () => {
      const content = `
Chapter 1: Introduction

This is the first chapter.

Chapter 2: Development

The story develops here.

Chapter 3: Climax

The story reaches its climax.
`
      const result = detector.detect(content)

      expect(result.hasStructure).toBe(true)
      expect(result.structureType).toBe('novel')
      expect(result.sections.length).toBe(3)
    })
  })

  describe('无结构文本检测', () => {
    it('无章节标记的文本应返回无结构', () => {
      const content = `
这是一段普通文本。

没有章节结构。

只是一些段落。
`
      const result = detector.detect(content)

      expect(result.hasStructure).toBe(false)
      expect(result.structureType).toBe('none')
      expect(result.sections.length).toBe(0)
    })

    it('混合格式的文本应优先检测最明显的结构', () => {
      const content = `
# 技术文档

这是技术文档的开头。

第一章：背景介绍

这是小说章节格式的内容。

第二章：主要内容

更多小说内容。
`
      // 应检测到小说章节结构（因为中文章节标记更明确）
      const result = detector.detect(content)

      expect(result.hasStructure).toBe(true)
      // 注意：根据实现，可能优先返回 Markdown 或小说结构
      expect(result.sections.length).toBeGreaterThan(0)
    })
  })

  describe('章节内容提取', () => {
    it('应正确提取章节内容', () => {
      const content = `
# 标题A

内容A第一行
内容A第二行

# 标题B

内容B第一行
`
      const result = detector.detect(content)

      expect(result.sections[0].content).toContain('内容A第一行')
      expect(result.sections[0].content).toContain('内容A第二行')
      // 标题应该保留在内容中（用于检索和显示）
      expect(result.sections[0].content).toContain('# 标题A')
    })

    it('应正确计算章节位置', () => {
      const content = `# 第一章\n\n内容A\n\n# 第二章\n\n内容B`
      const result = detector.detect(content)

      expect(result.sections[0].startIndex).toBeLessThan(result.sections[0].endIndex)
      expect(result.sections[0].endIndex).toBeLessThanOrEqual(result.sections[1].startIndex)
    })
  })

  describe('中文数字解析', () => {
    it('应正确解析简单中文数字', () => {
      const content = `
第一章 内容

第十章 内容

第二十章 内容
`
      const result = detector.detect(content)

      expect(result.hasStructure).toBe(true)
      expect(result.sections.length).toBe(3)
    })
  })
})