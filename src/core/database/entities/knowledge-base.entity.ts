import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识库 Entity
 * 对齐 knowledge_bases DDL：
 *   id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
 *   embedding_model TEXT NOT NULL, embedding_provider TEXT NOT NULL,
 *   embedding_dimension INTEGER NOT NULL DEFAULT 1536,
 *   embedding_config TEXT,
 *   document_count INTEGER DEFAULT 0,
 *   vector_count INTEGER DEFAULT 0,
 *   total_size INTEGER DEFAULT 0,
 *   created_at DATETIME, updated_at DATETIME
 */
@Entity({ name: 'knowledge_bases' })
@Index('idx_knowledge_bases_created_at', ['createdAt'])
export class KnowledgeBaseEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'embedding_model', type: 'varchar' })
  embeddingModel!: string

  @Column({ name: 'embedding_provider', type: 'varchar' })
  embeddingProvider!: string

  @Column({ name: 'embedding_dimension', type: 'integer', default: 1536 })
  embeddingDimension!: number

  /** embedding_config 存为 TEXT/JSON 字符串（DTO 字段是 string，按原始 Repo 行为）*/
  @Column({ name: 'embedding_config', type: 'text', nullable: true })
  embeddingConfig!: string | null

  /** D2 重排序配置 JSON：{ providerConfigId, modelId }；null = 未启用 rerank */
  @Column({ name: 'rerank_config', type: 'text', nullable: true })
  rerankConfig!: string | null

  /** 知识大脑配置 JSON（KbBrainConfig）；null = 大脑关闭（一切入口早退） */
  @Column({ name: 'brain_config', type: 'text', nullable: true })
  brainConfig!: string | null

  /** 知识大脑运行态 JSON（KbBrainState：重要性账户/品味侧写/上次提炼时间） */
  @Column({ name: 'brain_state', type: 'text', nullable: true })
  brainState!: string | null

  /** 所属目录 id（kb_folders；null = 未分类） */
  @Column({ name: 'folder_id', type: 'varchar', nullable: true })
  folderId!: string | null

  @Column({ name: 'document_count', type: 'integer', default: 0 })
  documentCount!: number

  @Column({ name: 'vector_count', type: 'integer', default: 0 })
  vectorCount!: number

  @Column({ name: 'total_size', type: 'integer', default: 0 })
  totalSize!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
