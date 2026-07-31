/**
 * 向量存储抽象接口
 * @module core/services/vector/vector-store.interface
 *
 * 双端共用接口：PC 端用 LanceDBVectorStore（本地文件），Web 端可在 LanceDB / pgvector
 * 之间切换（env VECTOR_STORE）。所有 KB 向量操作都走此接口，与具体后端解耦。
 *
 * 选 pgvector 的核心理由：
 * - Web 容器无状态化（OSS 抽象 + pgvector 替换 LanceDB 文件锁），可水平扩展
 * - PG halfvec(8192) 支持 8192 维（DashScope text-embedding-v4），fp16 精度损失 <1%
 * - HNSW 索引兼容 halfvec，KNN 查询性能可控
 */

export interface VectorRecord {
  /** 向量记录 ID（uuid） */
  id: string
  /** 关联 kb_chunks.id */
  chunkId: string
  /** 知识库 ID（隔离键） */
  knowledgeBaseId: string
  /** 多租户 user ID（可空，按上层 KB.user_id 兜底） */
  userId?: string | null
  /** 向量数据（float32，长度 = dim） */
  vector: number[]
  /** 维度（8192 / 1536 / ...） */
  dim?: number
  /** embedding 模型标识（'text-embedding-v4' 等，可选） */
  model?: string
  /** ISO 字符串或 Date */
  createdAt: Date | string
  // ===== 长文写作向量元数据（步骤0 新增，均可选 → 旧 KB 数据天然兼容）=====
  /** 所属项目 ID（长文模块隔离键；旧 KB 数据为空） */
  projectId?: string
  /** 实体类型（character/location/item/chapter/memory/...） */
  entityType?: string
  /** 实体 ID（对应 lw_* 表的 id；chapter 切片时为 outlineId） */
  entityId?: string
  /** 章节号（chapter 切片用，检索历史章节 chapterNumberLte） */
  chapterNumber?: number | null
}

export interface VectorSearchResult {
  /** 命中的 chunk ID */
  chunkId: string
  /** 0-1，越接近 1 越相似（cosine：1 - distance） */
  score: number
}

/**
 * 元数据过滤条件（长文模块专用，步骤0 新增）
 * 用于 searchByMetadata
 */
export interface VectorMetadataFilter {
  projectId?: string
  entityType?: string
  entityId?: string
  /** 章节号精确匹配 */
  chapterNumber?: number
  /** 章节号 <= 该值（检索历史章节片段） */
  chapterNumberLte?: number
  /** 章节号 >= 该值 */
  chapterNumberGte?: number
}

/**
 * 元数据删除条件（步骤0 新增）
 * 字段含义同 VectorMetadataFilter，但不含范围（删除按精确匹配）
 */
export interface VectorDeleteByFilter {
  projectId?: string
  entityType?: string
  entityId?: string
  chapterNumber?: number
}

/**
 * 带元数据的检索结果（searchByMetadata 用，步骤0 新增）
 */
export interface VectorMetadataSearchResult {
  chunkId: string
  score: number
  metadata: {
    projectId?: string
    entityType?: string
    entityId?: string
    chapterNumber?: number | null
    knowledgeBaseId?: string
  }
}

export type VectorDistanceMetric = 'cosine' | 'l2' | 'inner_product'

/**
 * 向量存储统一接口
 * 实现方：LanceDBVectorStore（PC 默认） / PgVectorStore（Web 可选）
 */
export interface IVectorStore {
  /** 是否已就绪（initialize 完成） */
  isReady(): boolean

  /** 单条插入 */
  insert(record: VectorRecord): Promise<void>

  /** 批量插入（一次 round trip） */
  insertBatch(records: VectorRecord[]): Promise<void>

  /** 按 chunk ID 取单条 */
  getByChunkId(chunkId: string): Promise<VectorRecord | null>

  /** 按 KB + 查询向量 KNN 检索 topK */
  searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number,
    opts?: { distanceMetric?: VectorDistanceMetric },
  ): Promise<VectorSearchResult[]>

  /** 按 chunk ID 删（删 chunk 时级联） */
  deleteByChunkId(chunkId: string): Promise<void>

  /** 按 chunk ID 列表批量删 */
  deleteByChunkIds(chunkIds: string[]): Promise<void>

  /** 按 KB 删整个知识库的向量 */
  deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void>

  /** 统计某 KB 的向量数量 */
  countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number>

  // ===== 长文模块专用方法（步骤0 新增，不影响旧 KB 接口）=====

  /**
   * 按元数据过滤的语义检索（长文模块用）
   * 与 searchSimilar 的区别：按 projectId/entityType/chapterNumber 过滤，而非 knowledgeBaseId。
   * 旧 KB 数据 projectId 为空，长文检索 projectId 非空 → 天然隔离。
   * @param queryVector 查询向量
   * @param filter 元数据过滤条件（projectId 通常必传以保证隔离）
   * @param topK 返回条数
   * @param scoreThreshold 相关性阈值 0-1，低于此值过滤（可选）
   */
  searchByMetadata(
    queryVector: number[],
    filter: VectorMetadataFilter,
    topK: number,
    scoreThreshold?: number,
  ): Promise<VectorMetadataSearchResult[]>

  /**
   * 按元数据批量删除（返回删除条数）
   */
  deleteByMetadata(filter: VectorDeleteByFilter): Promise<number>

  /**
   * 按 projectId 统计向量数量
   */
  countByProject(projectId: string): Promise<number>
}

let _accessor: (() => IVectorStore) | null = null

/**
 * 注册全局访问器：启动时由 PC / Web 各自的入口调用。
 */
export function registerVectorStore(fn: () => IVectorStore): void {
  _accessor = fn
}

/**
 * 获取已注册的 vector store 实例。未注册时抛错。
 */
export function getVectorStore(): IVectorStore {
  if (!_accessor) {
    throw new Error('[IVectorStore] 未注册：请在启动时 registerVectorStore()')
  }
  return _accessor()
}
