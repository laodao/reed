/**
 * 知识库模块类型定义
 * @module shared/types/knowledge-base.types
 */

// ==================== 知识库 ====================

/**
 * 知识库实体
 */
export interface KnowledgeBase {
  /** 知识库 ID */
  id: string
  /** 知识库名称 */
  name: string
  /** 描述 */
  description?: string
  /** Embedding 模型 ID */
  embeddingModel: string
  /** 向量维度 */
  embeddingDimension: number
  /** Embedding 配置（JSON） */
  embeddingConfig?: string
  /** 文档数量 */
  documentCount: number
  /** 向量条数 */
  vectorCount: number
  /** 总大小（字节） */
  totalSize: number
  /** 创建时间 */
  createdAt: Date | string
  /** 更新时间 */
  updatedAt: Date | string
}

/**
 * 创建知识库请求
 */
export interface CreateKnowledgeBaseRequest {
  /** 知识库名称 */
  name: string
  /** 描述 */
  description?: string
  /** Embedding 模型 ID */
  embeddingModel: string
  /** 向量维度 */
  embeddingDimension: number
  /** Embedding 配置 */
  embeddingConfig?: EmbeddingConfig
}

/**
 * 更新知识库请求
 */
export interface UpdateKnowledgeBaseRequest {
  /** 知识库名称 */
  name?: string
  /** 描述 */
  description?: string
}

/**
 * Embedding 配置
 */
export interface EmbeddingConfig {
  /** 提供商类型：云端 或 本地 */
  provider?: 'cloud' | 'local'
  /** Embedding 模型 ID */
  modelId?: string
  /** 云端提供商配置 ID */
  providerConfigId?: string
  /** 提供商模板 ID */
  providerTemplateId?: string
  /** Ollama 服务地址（本地模型） */
  ollamaBaseUrl?: string
}

// ==================== 文档 ====================

/**
 * 文档状态
 */
export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * 文档实体
 */
export interface KbDocument {
  /** 文档 ID */
  id: string
  /** 所属知识库 ID */
  knowledgeBaseId: string
  /** 文件名 */
  name: string
  /** 本地存储路径 */
  filePath: string
  /** 文件类型 */
  fileType: FileType
  /** 文件大小（字节） */
  fileSize: number
  /** 处理状态 */
  status: DocumentStatus
  /** 处理进度（0-100） */
  progress: number
  /** 切片数量 */
  chunkCount: number
  /** 错误信息 */
  errorMessage?: string
  /** 元数据（JSON） */
  metadata?: DocumentMetadata
  /** 创建时间 */
  createdAt: Date | string
  /** 更新时间 */
  updatedAt: Date | string
}

/**
 * 文件类型
 */
export type FileType = 'pdf' | 'docx' | 'doc' | 'txt' | 'md' | 'epub' | 'xlsx' | 'xls' | 'webpage'

/**
 * 文档元数据
 */
export interface DocumentMetadata {
  /** 标题 */
  title?: string
  /** 作者 */
  author?: string
  /** 页数 */
  pageCount?: number
  /** 章节 */
  sections?: Array<{ title: string; startIndex: number }>
}

/**
 * 创建文档请求
 */
export interface CreateDocumentRequest {
  /** 所属知识库 ID */
  knowledgeBaseId: string
  /** 文件名 */
  name: string
  /** 本地存储路径 */
  filePath: string
  /** 文件类型 */
  fileType: FileType
  /** 文件大小 */
  fileSize: number
}

// ==================== 切片 ====================

/**
 * 文档切片实体
 */
export interface KbChunk {
  /** 切片 ID */
  id: string
  /** 所属文档 ID */
  documentId: string
  /** 所属知识库 ID */
  knowledgeBaseId: string
  /** 切片内容 */
  content: string
  /** 切片序号 */
  chunkIndex: number
  /** 原文起始位置 */
  startOffset?: number
  /** 原文结束位置 */
  endOffset?: number
  /** 元数据 */
  metadata?: ChunkMetadata
  /** 创建时间 */
  createdAt: Date | string
}

/**
 * 切片元数据
 */
export interface ChunkMetadata {
  /** 页码 */
  page?: number
  /** 章节 */
  section?: string
}

/**
 * 文档切片（解析时使用的临时结构）
 */
export interface Chunk {
  /** 切片内容 */
  content: string
  /** 切片序号 */
  index: number
  /** 原文起始位置 */
  startOffset?: number
  /** 原文结束位置 */
  endOffset?: number
  /** 元数据 */
  metadata?: ChunkMetadata
}

/**
 * 创建切片请求
 */
export interface CreateChunkRequest {
  /** 所属文档 ID */
  documentId: string
  /** 所属知识库 ID */
  knowledgeBaseId: string
  /** 切片内容 */
  content: string
  /** 切片序号 */
  chunkIndex: number
  /** 原文起始位置 */
  startOffset?: number
  /** 原文结束位置 */
  endOffset?: number
  /** 元数据 */
  metadata?: ChunkMetadata
}

// ==================== 向量 ====================

/**
 * 向量实体
 */
export interface KbVector {
  /** 向量 ID */
  id: string
  /** 关联切片 ID */
  chunkId: string
  /** 所属知识库 ID */
  knowledgeBaseId: string
  /** 向量数据（Float32 数组） */
  vector: number[]
  /** 创建时间 */
  createdAt: Date | string
}

// ==================== 检索 ====================

/**
 * 检索请求
 */
export interface SearchRequest {
  /** 知识库 ID */
  knowledgeBaseId: string
  /** 查询文本 */
  query: string
  /** 返回结果数量 */
  topK?: number
  /** 向量检索权重 */
  vectorWeight?: number
  /** 相似度阈值 */
  threshold?: number
}

/**
 * 检索结果
 */
export interface SearchResult {
  /** 切片 ID */
  chunkId: string
  /** 文档 ID */
  documentId: string
  /** 文档名称 */
  documentName: string
  /** 切片内容 */
  content: string
  /** 相似度得分 */
  score: number
  /** 元数据 */
  metadata?: ChunkMetadata
}

// ==================== Embedding 模型 ====================

/**
 * Embedding 模型
 */
export interface EmbeddingModel {
  /** 模型 ID */
  id: string
  /** 模型名称 */
  name: string
  /** 提供商类型 */
  provider: 'cloud' | 'local'
  /** 向量维度 */
  dimension: number
  /** 最大 Token 数 */
  maxTokens: number
  /** 提供商配置 ID（云端模型） */
  providerConfigId?: string
  /** 提供商模板 ID */
  providerTemplateId?: string
  /** Ollama 服务地址（本地模型） */
  ollamaBaseUrl?: string
}

// ==================== IPC 响应 ====================

/**
 * IPC 统一响应格式
 */
export interface KbResponse<T = unknown> {
  /** 是否成功 */
  success: boolean
  /** 返回数据 */
  data?: T
  /** 错误信息 */
  error?: string
}

/**
 * 文件信息（用于上传）
 */
export interface FileInfo {
  /** 文件路径 */
  path: string
  /** 文件名 */
  name: string
  /** 文件大小 */
  size: number
}

/**
 * 知识库统计信息
 */
export interface KnowledgeBaseStats {
  /** 文档数量 */
  documentCount: number
  /** 向量条数 */
  vectorCount: number
  /** 总大小（字节） */
  totalSize: number
}