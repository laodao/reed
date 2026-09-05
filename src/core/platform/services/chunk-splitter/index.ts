/**
 * RAG 知识库切分策略模块
 * @module platform/services/chunk-splitter
 * @description 提供层级混合切分策略，优化知识库检索效果
 */

// 类型定义
export * from './types'

// 核心组件
export { StructureDetector } from './structure-detector'
export { StructureSplitter } from './structure-splitter'
export { SemanticSplitter, EmbeddingService } from './semantic-splitter'
export { ChunkMerger } from './chunk-merger'
export { HierarchyBuilder } from './hierarchy-builder'
export { HybridSplitter } from './hybrid-splitter'

// 默认配置
import { DEFAULT_SPLIT_CONFIG } from './types'
export { DEFAULT_SPLIT_CONFIG }