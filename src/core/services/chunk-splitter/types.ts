/**
 * RAG 知识库切分策略类型定义
 * @module services/chunk-splitter/types
 */

/**
 * 切分策略枚举
 */
export type SplitStrategy = 'hybrid' | 'structure' | 'semantic' | 'fixed'

/**
 * 切分配置
 */
export interface SplitConfig {
  /** 切分策略 */
  strategy: SplitStrategy
  /** 语义切分相似度阈值（低于此值时切分），默认 0.5 */
  similarityThreshold?: number
  /** 最小 chunk 大小（字符数），默认 200 */
  minChunkSize?: number
  /** 最大 chunk 大小（字符数），默认 1500 */
  maxChunkSize?: number
  /** 仅结构切分，不做语义切分 */
  structureOnly?: boolean
}

/**
 * 默认切分配置
 */
export const DEFAULT_SPLIT_CONFIG: SplitConfig = {
  strategy: 'hybrid',
  similarityThreshold: 0.5,
  minChunkSize: 200,
  maxChunkSize: 1500,
  structureOnly: false
}

/**
 * 文档结构类型
 */
export type StructureType = 'markdown' | 'novel' | 'pdf-outline' | 'none'

/**
 * 章节信息
 */
export interface SectionInfo {
  /** 章节标题 */
  title: string
  /** 层级深度（1=章，2=节，3=段） */
  level: number
  /** 章节内容 */
  content: string
  /** 起始位置 */
  startIndex: number
  /** 结束位置 */
  endIndex: number
  /** 父章节标题 */
  parentTitle?: string
}

/**
 * 结构检测结果
 */
export interface StructureInfo {
  /** 是否有结构 */
  hasStructure: boolean
  /** 结构类型 */
  structureType: StructureType
  /** 章节列表 */
  sections: SectionInfo[]
}

/**
 * 切分后的 chunk（包含层级信息）
 */
export interface SplitChunk {
  /** 切片内容 */
  content: string
  /** 切片序号（全局） */
  index: number
  /** 章节标题 */
  title?: string
  /** 层级深度 */
  level: number
  /** 父 chunk ID（用于层级导航） */
  parentChunkId?: string
  /** 切分方法 */
  splitMethod: SplitStrategy | 'sub-semantic'
  /** 层级路径（JSON 数组） */
  sectionPath: string[]
  /** 原文起始位置 */
  startOffset: number
  /** 原文结束位置 */
  endOffset: number
  /** 所属章节序号（用于内部排序） */
  sectionIndex?: number
}

/**
 * 段落信息（用于语义切分）
 */
export interface ParagraphInfo {
  /** 段落内容 */
  content: string
  /** 段落索引 */
  index: number
  /** 原文起始位置 */
  startOffset: number
  /** 原文结束位置 */
  endOffset: number
  /** 向量（Embedding） */
  embedding?: number[]
}

/**
 * 相似度计算结果
 */
export interface SimilarityResult {
  /** 段落索引 i */
  index1: number
  /** 段落索引 i+1 */
  index2: number
  /** 余弦相似度 */
  similarity: number
  /** 是否为切分边界 */
  isBoundary: boolean
}

/**
 * Markdown 标题正则匹配结果
 */
export interface MarkdownHeading {
  /** 标题级别（# 数量） */
  level: number
  /** 标题文本 */
  title: string
  /** 标题起始位置 */
  startIndex: number
}

/**
 * 小说章节正则匹配结果
 */
export interface NovelChapter {
  /** 章节标题 */
  title: string
  /** 章节序号 */
  number: number
  /** 标题起始位置 */
  startIndex: number
}