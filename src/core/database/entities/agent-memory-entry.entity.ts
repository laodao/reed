import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * agent 知识飞轮条目 Entity（agent_memory_entries，26 号 M3 批1 / 01 号 §4.3）。
 *
 * 一行 = 一条跨任务沉淀的记忆。闸门纪律：distiller 产出一律 pending_review，
 * 人工批准才 active（宁可慢不可脏——01 号 §M3 风险注记）。版本链经
 * supersedes_id；被采用且任务通过验收的次数记 success_count（哪类做法能
 * 通过验收是最有价值的记忆——支柱二与支柱四在此闭环）。
 */
@Entity({ name: 'agent_memory_entries' })
@Index('idx_agent_memory_user', ['userId'])
@Index('idx_agent_memory_status', ['status'])
@Index('idx_agent_memory_kind', ['kind'])
@Index('idx_agent_memory_scope', ['userId', 'status', 'bizModule', 'projectId'])
export class AgentMemoryEntryEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 单用户为 null。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** fact / sop / preference / skill / episode-ref */
  @Column({ name: 'kind', type: 'varchar' })
  kind!: string

  /** 内容 JSON：{ title, content, tags? } */
  @Column({ name: 'content_json', type: 'text' })
  contentJson!: string

  /** LanceDB 向量引用（01 号 §4.4 复用位；M3 最小闭环关键词检索，向量后置） */
  @Column({ name: 'embedding_id', type: 'varchar', nullable: true })
  embeddingId!: string | null

  @Column({ name: 'source_run_id', type: 'varchar', nullable: true })
  sourceRunId!: string | null

  @Column({ name: 'source_task_id', type: 'varchar', nullable: true })
  sourceTaskId!: string | null

  /** 蒸馏自评置信度（0-1；闸门阈值 0.7） */
  @Column({ name: 'confidence', type: 'real', nullable: true })
  confidence!: number | null

  /** pending_review / active / archived / superseded */
  @Column({ name: 'status', type: 'varchar' })
  status!: string

  @Column({ name: 'use_count', type: 'integer', nullable: true })
  useCount!: number | null

  @Column({ name: 'success_count', type: 'integer', nullable: true })
  successCount!: number | null

  /** 版本链：被哪条新条目取代 */
  @Column({ name: 'supersedes_id', type: 'varchar', nullable: true })
  supersedesId!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null

  // ==================== KE-1 分层知识（34 号 v2） ====================

  /** 业务模块（如 longwriting / episode-production）；NULL=用户级 L1 */
  @Column({ name: 'biz_module', type: 'varchar', nullable: true })
  bizModule!: string | null

  /** 项目 id（与 bizModule 联用；NULL 且 bizModule NULL=用户级） */
  @Column({ name: 'project_id', type: 'varchar', nullable: true })
  projectId!: string | null

  /** 内容哈希（M-Ke2 向量增量嵌入判据：变了才重嵌入） */
  @Column({ name: 'content_hash', type: 'varchar', nullable: true })
  contentHash!: string | null

  /** 嵌入模型指纹（换提供商后旧向量失配——漂移检测触发重嵌入） */
  @Column({ name: 'embed_model', type: 'varchar', nullable: true })
  embedModel!: string | null
}
