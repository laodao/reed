import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * 知识大脑·消化台账 Entity（kb_digest_passes，详细设计 §1.5）
 *
 * P1/P2 流水线的幂等锚点与成本账本：UNIQUE(chapter_id, pass_key) 是
 * 「章节 × 遍次」幂等键的持久化（从 atom 存在性反推不可靠：部分失败/
 * 零产出遍/多遍矩阵/成本归属四洞）。chapter_id 为 null 的文档级任务
 * （distill/metabolize）在 SQLite/PG 的 UNIQUE 下 NULL 互不相斥——由
 * 仓储 ensurePass 应用层判重（复核修正 F7）。
 */

export type KbDigestPassType = 'base' | 'lens' | 'distill' | 'metabolize'

export type KbDigestPassStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

@Entity({ name: 'kb_digest_passes' })
@Unique('uq_kb_digest_passes_chapter_pass', ['chapterId', 'passKey'])
@Index('idx_kb_digest_passes_pending', ['status', 'updatedAt'])
export class KbDigestPassEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  @Column({ name: 'document_id', type: 'varchar' })
  documentId!: string

  /** null=文档级任务（distill/metabolize）；章级任务=章节 id */
  @Column({ name: 'chapter_id', type: 'varchar', nullable: true })
  chapterId!: string | null

  @Column({ name: 'pass_type', type: 'varchar' })
  passType!: KbDigestPassType

  /** 'base' | 'lens:<noteId>' | 'distill:<batchId>' | 'metabolize:<period>' */
  @Column({ name: 'pass_key', type: 'varchar' })
  passKey!: string

  /** 幂等键第二元：章节内容指纹（hash 未变→done 跳过；变了→重跑） */
  @Column({ name: 'chapter_hash', type: 'varchar', nullable: true })
  chapterHash!: string | null

  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: KbDigestPassStatus

  /** {atoms,merged,contradicted,entities,edges,staled} JSON */
  @Column({ name: 'stats_json', type: 'text', nullable: true })
  statsJson!: string | null

  /** {calls,tokensIn,tokensOut} JSON（消化率仪表的"每本成本"来源） */
  @Column({ name: 'cost_json', type: 'text', nullable: true })
  costJson!: string | null

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null

  /** 失败重试计数（attempts>=3 不再自动重跑） */
  @Column({ name: 'attempts', type: 'integer', default: 0 })
  attempts!: number

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
