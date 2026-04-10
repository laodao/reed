/**
 * 文档结构检测器
 * @module services/chunk-splitter/structure-detector
 * @description 检测文档是否有章节结构（Markdown 标题、小说章节、纯文本模式）
 */

import {
  StructureInfo,
  StructureType,
  SectionInfo,
  MarkdownHeading,
  NovelChapter
} from './types'

/**
 * 文档结构检测器
 */
export class StructureDetector {
  // Markdown 标题正则：匹配 # ## ### 等
  private readonly markdownHeadingRegex = /^(#{1,6})\s+(.+)$/gm

  // 小说章节正则（中文）：匹配 第一章、第二章等
  private readonly novelChapterChineseRegex = /^第[一二三四五六七八九十百千万\d]+[章节回]\s*[：:\s]*(.*)$/gm

  // 小说章节正则（英文）：匹配 Chapter 1, Chapter 2 等
  private readonly novelChapterEnglishRegex = /^Chapter\s+(\d+)[：:\s]*(.*)$/gm

  // 最小章节数（少于此数量认为无结构）
  private readonly minSectionsCount = 2

  /**
   * 检测文档结构
   * @param content 文档内容
   * @returns 结构检测结果
   */
  detect(content: string): StructureInfo {
    // 1. 尝试检测 Markdown 结构
    const markdownStructure = this.detectMarkdownStructure(content)
    if (markdownStructure.sections.length >= this.minSectionsCount) {
      return markdownStructure
    }

    // 2. 尝试检测小说章节结构
    const novelStructure = this.detectNovelStructure(content)
    if (novelStructure.sections.length >= this.minSectionsCount) {
      return novelStructure
    }

    // 3. 无明显结构
    return {
      hasStructure: false,
      structureType: 'none',
      sections: []
    }
  }

  /**
   * 检测 Markdown 标题结构
   */
  private detectMarkdownStructure(content: string): StructureInfo {
    const headings: MarkdownHeading[] = []
    let match: RegExpExecArray | null

    // 重置正则状态
    this.markdownHeadingRegex.lastIndex = 0

    while ((match = this.markdownHeadingRegex.exec(content)) !== null) {
      headings.push({
        level: match[1].length, // # 的数量决定层级
        title: match[2].trim(),
        startIndex: match.index
      })
    }

    if (headings.length < this.minSectionsCount) {
      return {
        hasStructure: false,
        structureType: 'markdown',
        sections: []
      }
    }

    // 构建章节信息
    const sections: SectionInfo[] = this.buildMarkdownSections(content, headings)

    return {
      hasStructure: true,
      structureType: 'markdown',
      sections
    }
  }

  /**
   * 构建 Markdown 章节信息
   */
  private buildMarkdownSections(content: string, headings: MarkdownHeading[]): SectionInfo[] {
    const sections: SectionInfo[] = []

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i]
      const startIndex = heading.startIndex
      const endIndex = i < headings.length - 1 ? headings[i + 1].startIndex : content.length

      // 提取章节内容（不包含标题行）
      const titleLineEnd = content.indexOf('\n', startIndex)
      const contentStart = titleLineEnd !== -1 ? titleLineEnd + 1 : startIndex + heading.title.length + heading.level + 1
      const sectionContent = content.slice(contentStart, endIndex).trim()

      // 计算父章节标题
      const parentTitle = this.findParentTitle(headings, i)

      sections.push({
        title: heading.title,
        level: heading.level,
        content: sectionContent,
        startIndex: startIndex,
        endIndex: endIndex,
        parentTitle
      })
    }

    return sections
  }

  /**
   * 查找父章节标题
   */
  private findParentTitle(headings: MarkdownHeading[], currentIndex: number): string | undefined {
    const currentLevel = headings[currentIndex].level

    // 向前查找层级更低的标题（更高级别的标题）
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (headings[i].level < currentLevel) {
        return headings[i].title
      }
    }

    return undefined
  }

  /**
   * 检测小说章节结构
   */
  private detectNovelStructure(content: string): StructureInfo {
    const chapters: NovelChapter[] = []
    let match: RegExpExecArray | null

    // 检测中文章节
    this.novelChapterChineseRegex.lastIndex = 0
    while ((match = this.novelChapterChineseRegex.exec(content)) !== null) {
      const numberStr = match[0].match(/第([一二三四五六七八九十百千万\d]+)[章节回]/)?.[1] || '0'
      const number = this.parseChineseNumber(numberStr)
      chapters.push({
        title: match[0].trim(),
        number,
        startIndex: match.index
      })
    }

    // 如果中文章节不够，尝试英文章节
    if (chapters.length < this.minSectionsCount) {
      this.novelChapterEnglishRegex.lastIndex = 0
      while ((match = this.novelChapterEnglishRegex.exec(content)) !== null) {
        chapters.push({
          title: match[0].trim(),
          number: parseInt(match[1], 10),
          startIndex: match.index
        })
      }
    }

    if (chapters.length < this.minSectionsCount) {
      return {
        hasStructure: false,
        structureType: 'novel',
        sections: []
      }
    }

    // 按位置排序
    chapters.sort((a, b) => a.startIndex - b.startIndex)

    // 构建章节信息
    const sections: SectionInfo[] = this.buildNovelSections(content, chapters)

    return {
      hasStructure: true,
      structureType: 'novel',
      sections
    }
  }

  /**
   * 构建小说章节信息
   */
  private buildNovelSections(content: string, chapters: NovelChapter[]): SectionInfo[] {
    const sections: SectionInfo[] = []

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]
      const startIndex = chapter.startIndex
      const endIndex = i < chapters.length - 1 ? chapters[i + 1].startIndex : content.length

      // 提取章节内容（包含标题行）
      const sectionContent = content.slice(startIndex, endIndex).trim()

      sections.push({
        title: chapter.title,
        level: 1, // 小说章节只有一级
        content: sectionContent,
        startIndex: startIndex,
        endIndex: endIndex
      })
    }

    return sections
  }

  /**
   * 解析中文数字
   */
  private parseChineseNumber(str: string): number {
    const chineseNumbers: Record<string, number> = {
      '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
      '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
      '十': 10, '百': 100, '千': 1000, '万': 10000
    }

    // 简单情况：纯数字字符串
    if (/^\d+$/.test(str)) {
      return parseInt(str, 10)
    }

    // 复杂情况：中文数字（简化处理，只支持基本格式）
    let result = 0
    let temp = 0

    for (const char of str) {
      const num = chineseNumbers[char]
      if (num === undefined) continue

      if (num >= 10) {
        // 十、百、千、万
        result += (temp || 1) * num
        temp = 0
      } else {
        // 个位数字
        temp = num
      }
    }

    return result + temp
  }
}