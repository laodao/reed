/**
 * 结构化切分器
 * @module services/chunk-splitter/structure-splitter
 * @description 按文档章节结构进行切分（Markdown 标题、小说章节）
 */

import {
  StructureInfo,
  SplitChunk,
  SectionInfo,
  SplitConfig,
  DEFAULT_SPLIT_CONFIG
} from './types'

/**
 * 结构化切分器
 */
export class StructureSplitter {
  /**
   * 按章节结构切分文档
   * @param content 文档内容
   * @param structure 结构检测结果
   * @param config 切分配置
   * @returns 切分结果
   */
  split(content: string, structure: StructureInfo, config: SplitConfig = DEFAULT_SPLIT_CONFIG): SplitChunk[] {
    if (!structure.hasStructure || structure.sections.length === 0) {
      // 无结构：返回整个文档作为一个 chunk
      return [{
        content: content.trim(),
        index: 0,
        title: undefined,
        level: 1,
        splitMethod: 'structure',
        sectionPath: [],
        startOffset: 0,
        endOffset: content.length
      }]
    }

    const chunks: SplitChunk[] = []
    let globalIndex = 0

    for (let sectionIndex = 0; sectionIndex < structure.sections.length; sectionIndex++) {
      const section = structure.sections[sectionIndex]
      const sectionPath = this.buildSectionPath(section)

      // 为每个章节创建一个 chunk
      const chunk: SplitChunk = {
        content: section.content,
        index: globalIndex++,
        title: section.title,
        level: section.level,
        splitMethod: 'structure',
        sectionPath: sectionPath,
        startOffset: section.startIndex,
        endOffset: section.endIndex,
        sectionIndex: sectionIndex
      }

      chunks.push(chunk)
    }

    return chunks
  }

  /**
   * 构建层级路径
   * @param section 章节信息
   * @returns 层级路径数组
   */
  private buildSectionPath(section: SectionInfo): string[] {
    const path: string[] = []

    // 添加父章节标题（如果有）
    if (section.parentTitle) {
      path.push(section.parentTitle)
    }

    // 添加当前章节标题
    path.push(section.title)

    return path
  }

  /**
   * 过滤空白章节
   * @param chunks 切分结果
   * @param minSize 最小大小（字符数）
   * @returns 过滤后的结果
   */
  filterEmptySections(chunks: SplitChunk[], minSize: number = 50): SplitChunk[] {
    return chunks
      .filter(chunk => chunk.content.trim().length >= minSize)
      .map((chunk, index) => ({
        ...chunk,
        index // 重新编号
      }))
  }

  /**
   * 查找过长章节（需要内部语义切分）
   * @param chunks 切分结果
   * @param maxLength 最大长度（字符数）
   * @returns 过长章节列表
   */
  findLongSections(chunks: SplitChunk[], maxLength: number = 1000): SplitChunk[] {
    return chunks.filter(chunk => chunk.content.length > maxLength)
  }

  /**
   * 合并相邻的小章节
   * @param chunks 切分结果
   * @param minSize 最小大小（字符数）
   * @param maxSize 最大大小（字符数）
   * @returns 合并后的结果
   */
  mergeSmallSections(chunks: SplitChunk[], minSize: number = 200, maxSize: number = 1500): SplitChunk[] {
    const result: SplitChunk[] = []
    let currentChunk: SplitChunk | null = null

    for (const chunk of chunks) {
      if (!currentChunk) {
        currentChunk = { ...chunk }
        continue
      }

      // 如果当前 chunk 太小且合并后不超过最大大小，则合并
      if (currentChunk.content.length < minSize &&
          currentChunk.content.length + chunk.content.length <= maxSize &&
          currentChunk.level === chunk.level) {
        currentChunk = {
          ...currentChunk,
          content: currentChunk.content + '\n\n' + chunk.content,
          endOffset: chunk.endOffset,
          sectionPath: [...currentChunk.sectionPath, ...chunk.sectionPath.slice(currentChunk.sectionPath.length)]
        }
      } else {
        result.push(currentChunk)
        currentChunk = { ...chunk }
      }
    }

    if (currentChunk) {
      result.push(currentChunk)
    }

    // 重新编号
    return result.map((chunk, index) => ({
      ...chunk,
      index
    }))
  }
}