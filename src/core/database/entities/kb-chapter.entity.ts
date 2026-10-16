import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/** 章节摘要状态流转：pending(待生成) → done / failed(可重试) */
export type ChapterSummaryStatus = 'pending' | 'done' | 'failed'

/**
 * 知识库章节 Entity
 * 对齐 kb_chapters DDL（create-kb-chapters 迁移）。
 * 章节 = 与切片同源的 StructureDetector sections 落库；无结构文档落单条整篇章节。
 */
@Entity({ name: 'kb_chapters' })
@Index('idx_kb_chapters_document', ['documentId'])
@Index('idx_kb_chapters_kb', ['knowledgeBaseId'])
@Index('idx_kb_chapters_parent', ['parentId'])
export class KbChapterEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'document_id', type: 'varchar' })
  documentId!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  /** 章节标题（无结构时为文档名） */
  @Column({ name: 'title', type: 'varchar' })
  title!: string

  /** 层级（1=章，2=节，3=小节）；无结构整篇为 1 */
  @Column({ name: 'level', type: 'integer', default: 1 })
  level!: number

  /** 父章节标题原始引用（结构检测输出），落库时解析为 parent_id 的辅助字段 */
  @Column({ name: 'parent_title', type: 'varchar', nullable: true })
  parentTitle!: string | null

  /** 父章节 id（NULL=顶层章节） */
  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId!: string | null

  /** 文档内阅读顺序 */
  @Column({ name: 'ordering', type: 'integer', default: 0 })
  ordering!: number

  @Column({ name: 'start_offset', type: 'integer', nullable: true })
  startOffset!: number | null

  @Column({ name: 'end_offset', type: 'integer', nullable: true })
  endOffset!: number | null

  /** 章节正文（摘要生成数据源；与切片同源内容，冗余存储以自包含） */
  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null

  /** 章节文本指纹（重处理幂等/去重用） */
  @Column({ name: 'content_hash', type: 'varchar', nullable: true })
  contentHash!: string | null

  /** 章节摘要（LLM 生成，可为空=未生成/失败） */
  @Column({ name: 'summary', type: 'varchar', nullable: true })
  summary!: string | null

  @Column({ name: 'summary_status', type: 'varchar', default: 'pending' })
  summaryStatus!: ChapterSummaryStatus

  /** 摘要失败原因（便于排查/重试） */
  @Column({ name: 'summary_error', type: 'varchar', nullable: true })
  summaryError!: string | null

  /** 章级结构化阅读卡（v4，JSON；书级漏斗统一中间层，NULL=未产卡） */
  @Column({ name: 'brain_card', type: 'text', nullable: true })
  brainCard!: string | null

  /** 阅读卡内容指纹（消费方廉价失效判断） */
  @Column({ name: 'brain_card_hash', type: 'varchar', nullable: true })
  brainCardHash!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}