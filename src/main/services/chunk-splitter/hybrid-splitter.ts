/**
 * 混合切分器
 * @module services/chunk-splitter/hybrid-splitter
 * @description 整合所有切分策略，根据文档结构和配置选择最佳切分方式
 */

import {
  SplitChunk,
  SplitConfig,
  DEFAULT_SPLIT_CONFIG,
  StructureInfo
} from './types'
import { StructureDetector } from './structure-detector'
import { StructureSplitter } from './structure-splitter'
import { SemanticSplitter, EmbeddingService } from './semantic-splitter'
import { HierarchyBuilder } from './hierarchy-builder'

/**
 * 混合切分器
 */
export class HybridSplitter {
  private structureDetector: StructureDetector
  private structureSplitter: StructureSplitter
  private semanticSplitter: SemanticSplitter
  private hierarchyBuilder: HierarchyBuilder

  /**
   * 章节长度阈值（超过此值进行内部语义切分）
   */
  private readonly SECTION_LENGTH_THRESHOLD = 1000

  constructor(embeddingService: EmbeddingService) {
    this.structureDetector = new StructureDetector()
    this.structureSplitter = new StructureSplitter()
    this.semanticSplitter = new SemanticSplitter(embeddingService)
    this.hierarchyBuilder = new HierarchyBuilder()
  }

  /**
   * 智能切分文档
   * @param content 文档内容
   * @param config 切分配置
   * @returns 切分结果
   */
  async split(content: string, config: SplitConfig = DEFAULT_SPLIT_CONFIG): Promise<SplitChunk[]> {
    const effectiveConfig = {
      ...DEFAULT_SPLIT_CONFIG,
      ...config
    }

    // 根据策略选择切分方式
    switch (effectiveConfig.strategy) {
      case 'fixed':
        return this.fixedSplit(content)

      case 'structure':
        return this.structureOnlySplit(content, effectiveConfig)

      case 'semantic':
        return await this.semanticOnlySplit(content, effectiveConfig)

      case 'hybrid':
        return await this.hybridSplit(content, effectiveConfig)

      default:
        return await this.hybridSplit(content, effectiveConfig)
    }
  }

  /**
   * 固定窗口切分（兼容旧版）
   */
  private fixedSplit(content: string): SplitChunk[] {
    const CHUNK_SIZE = 800
    const OVERLAP = 80
    const chunks: SplitChunk[] = []
    let start = 0
    let index = 0

    while (start < content.length) {
      let end = Math.min(start + CHUNK_SIZE, content.length)

      // 尝试在句子边界切分
      if (end < content.length) {
        const boundary = Math.max(
          content.lastIndexOf('。', end),
          content.lastIndexOf('\n', end)
        )
        if (boundary > start + CHUNK_SIZE / 2) {
          end = boundary + 1
        }
      }

      const chunkContent = content.slice(start, end).trim()
      if (chunkContent) {
        chunks.push({
          content: chunkContent,
          index: index++,
          level: 1,
          splitMethod: 'fixed',
          sectionPath: [],
          startOffset: start,
          endOffset: end
        })
      }

      const nextStart = end - OVERLAP
      start = (nextStart <= start) ? end : nextStart
    }

    return chunks
  }

  /**
   * 仅结构化切分
   */
  private structureOnlySplit(content: string, config: SplitConfig): SplitChunk[] {
    const structure = this.structureDetector.detect(content)
    return this.structureSplitter.split(content, structure, config)
  }

  /**
   * 仅语义切分
   */
  private async semanticOnlySplit(content: string, config: SplitConfig): Promise<SplitChunk[]> {
    return await this.semanticSplitter.split(content, config)
  }

  /**
   * 混合切分（智能选择）
   */
  private async hybridSplit(content: string, config: SplitConfig): Promise<SplitChunk[]> {
    // 1. 检测文档结构
    const structure = this.structureDetector.detect(content)

    // 2. 如果有结构，按结构切分
    if (structure.hasStructure && structure.sections.length > 0) {
      return await this.splitByStructure(content, structure, config)
    }

    // 3. 无结构，直接语义切分
    return await this.semanticSplitter.split(content, config)
  }

  /**
   * 按结构切分，对过长章节进行内部语义切分
   */
  private async splitByStructure(
    content: string,
    structure: StructureInfo,
    config: SplitConfig
  ): Promise<SplitChunk[]> {
    // 首先按结构切分
    const structureChunks = this.structureSplitter.split(content, structure, config)

    // 检查是否需要对过长章节进行内部语义切分
    if (config.structureOnly) {
      return structureChunks
    }

    const finalChunks: SplitChunk[] = []

    for (const chunk of structureChunks) {
      // 如果章节过长，进行内部语义切分
      if (chunk.content.length > this.SECTION_LENGTH_THRESHOLD) {
        try {
          const subChunks = await this.semanticSplitter.split(chunk.content, config)
          // 继承父 chunk 的层级信息
          const hierarchyChunks = this.hierarchyBuilder.build(subChunks, chunk)
          finalChunks.push(...hierarchyChunks)
        } catch (error) {
          // 语义切分失败，保留原结构 chunk
          finalChunks.push(chunk)
        }
      } else {
        finalChunks.push(chunk)
      }
    }

    // 重新编号
    return finalChunks.map((chunk, index) => ({
      ...chunk,
      index
    }))
  }
}