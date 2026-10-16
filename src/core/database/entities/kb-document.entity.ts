import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识库文档 Entity
 * 对齐 kb_documents DDL（FK CASCADE 到 knowledge_bases）。
 */
@Entity({ name: 'kb_documents' })
@Index('idx_kb_documents_knowledge_base_id', ['knowledgeBaseId'])
@Index('idx_kb_documents_status', ['status'])
@Index('idx_kb_documents_created_at', ['createdAt'])
export class KbDocumentEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'file_path', type: 'text' })
  filePath!: string

  @Column({ name: 'file_type', type: 'varchar' })
  fileType!: string

  @Column({ name: 'file_size', type: 'integer' })
  fileSize!: number

  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string

  @Column({ name: 'progress', type: 'integer', default: 0 })
  progress!: number

  @Column({ name: 'chunk_count', type: 'integer', default: 0 })
  chunkCount!: number

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null

  @Column({ name: 'metadata', type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null

  @Column({ name: 'source_type', type: 'varchar', nullable: true })
  sourceType!: string | null

  @Column({ name: 'source_id', type: 'varchar', nullable: true })
  sourceId!: string | null

  /** 知识大脑消化状态：pending|digesting|digested|failed|skipped（与 status/progress 并列不混用） */
  @Column({ name: 'brain_status', type: 'varchar', nullable: true })
  brainStatus!: string | null

  /** 消化进度 0-100 */
  @Column({ name: 'brain_progress', type: 'integer', nullable: true })
  brainProgress!: number | null

  @Column({ name: 'brain_error', type: 'text', nullable: true })
  brainError!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
