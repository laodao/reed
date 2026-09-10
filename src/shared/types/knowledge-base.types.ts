/**
 * 知识库模块类型定义
 * @module shared/types/knowledge-base.types
 */

// ==================== 切分策略 ====================

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
  /** D2 重排序配置 JSON 字符串（{ providerConfigId, modelId }）；null/空 = 未启用 */
  rerankConfig?: string | null
  /** 所属目录 id（kb_folders；null = 未分类） */
  folderId?: string | null
  /** 切分策略 */
  splitStrategy?: SplitStrategy
  /** 切分配置（JSON） */
  splitConfig?: string
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
  /** 所属目录 id（可空 = 未分类） */
  folderId?: string | null
}

/**
 * 更新知识库请求
 */
export interface UpdateKnowledgeBaseRequest {
  /** 知识库名称 */
  name?: string
  /** 描述 */
  description?: string
  /** D2 重排序配置 JSON（null = 关闭 rerank） */
  rerankConfig?: string | null
  /** 所属目录 id（null = 移到未分类） */
  folderId?: string | null
}

/**
 * 知识库目录（kb_folders；分组/分类，如 it 行业、能源行业）
 */
export interface KnowledgeBaseFolder {
  id: string
  name: string
  /** 父目录 id（预留多级；null = 一级目录） */
  parentId?: string | null
  sortOrder?: number
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
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
  /** 文档来源（DTO 由 sourceType/sourceId 还原） */
  source?: DocumentSource
  /** 创建时间 */
  createdAt: Date | string
  /** 更新时间 */
  updatedAt: Date | string
}

/**
 * 文件类型
 */
export type FileType = 'pdf' | 'docx' | 'doc' | 'txt' | 'md' | 'epub' | 'mobi' | 'azw3' | 'xlsx' | 'xls' | 'webpage'

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
  /** 文档来源（跨模块导入用），默认 NULL（用户手动上传） */
  source?: DocumentSource
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
  /** 章节标题 */
  title?: string
  /** 层级深度（1=章，2=节，3=段） */
  level?: number
  /** 父 chunk ID（用于层级导航） */
  parentChunkId?: string
  /** 切分方法 */
  splitMethod?: string
  /** 层级路径（JSON 数组） */
  sectionPath?: string
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
  /** 章节标题 */
  title?: string
  /** 层级深度 */
  level?: number
  /** 父 chunk ID */
  parentChunkId?: string
  /** 切分方法 */
  splitMethod?: string
  /** 层级路径（JSON 数组） */
  sectionPath?: string[]
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
  /** 取消信号（透传到嵌入 HTTP 调用，向后兼容可选） */
  signal?: AbortSignal
  /** 返回结果数量 */
  topK?: number
  /** 向量检索权重 */
  vectorWeight?: number
  /** 相似度阈值 */
  threshold?: number
  /** D2 是否启用 rerank 重排（缺省跟随 KB 配置；false = 强制关闭） */
  useRerank?: boolean
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

// ==================== 文档来源 ====================

/**
 * 文档来源标识。
 * 同一 KB 中 (type, id) 二元组唯一对应一篇文档；用于跨模块导入（如日记）的去重 upsert。
 */
export interface DocumentSource {
  /** 来源类型；'diary'=日记导入；'workflow'=工作流节点保存（按 sourceKey 幂等覆盖） */
  type: 'diary' | 'workflow'
  /** 来源在所属模块内的稳定 ID（如 diaryEntry.id / 工作流 sourceKey） */
  id: string
}

/**
 * addDocument 返回数据：upsert 语义下需要让前端区分新建与更新。
 */
export interface AddDocumentResult {
  /** 文档 DTO */
  doc: KbDocument
  /** 是否走的 upsert 更新路径（命中已有 source） */
  isUpdate: boolean
}
