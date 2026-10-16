import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 文档切片 Entity
 * 对齐 kb_chunks DDL + ALTER TABLE 添加的扩展列：
 *   title / level / parent_chunk_id / split_method / section_path
 */
@Entity({ name: 'kb_chunks' })
@Index('idx_kb_chunks_document_id', ['documentId'])
@Index('idx_kb_chunks_knowledge_base_id', ['knowledgeBaseId'])
export class KbChunkEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'document_id', type: 'varchar' })
  documentId!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  @Column({ name: 'content', type: 'text' })
  content!: string

  @Column({ name: 'chunk_index', type: 'integer' })
  chunkIndex!: number

  @Column({ name: 'start_offset', type: 'integer', nullable: true })
  startOffset!: number | null

  @Column({ name: 'end_offset', type: 'integer', nullable: true })
  endOffset!: number | null

  // 以下 5 列由 ALTER TABLE 添加
  @Column({ name: 'title', type: 'text', nullable: true })
  title!: string | null

  @Column({ name: 'level', type: 'integer', nullable: true, default: 1 })
  level!: number | null

  @Column({ name: 'parent_chunk_id', type: 'text', nullable: true })
  parentChunkId!: string | null

  @Column({ name: 'split_method', type: 'text', nullable: true })
  splitMethod!: string | null

  /** section_path 存为 TEXT 字符串（按原 Repo 行为，rowToEntity 直接返回字符串）*/
  @Column({ name: 'section_path', type: 'text', nullable: true })
  sectionPath!: string | null

  @Column({ name: 'metadata', type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date
}
