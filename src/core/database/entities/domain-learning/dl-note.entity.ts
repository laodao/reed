import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 概念笔记 Entity（dl_note，M4-UX1）
 *
 * 讲义选区笔记与答疑收藏回答共表（source 区分）：
 * - selection：anchorText 选区原文快照 + 可选正文偏移(anchorStart/End) + contentMd 用户笔记；
 * - qna：questionId 引用答疑问题（答案随问题行留存），contentMd = 用户收藏评注或答案摘要。
 * 多租户：user_id 由 BaseRepository.scoped 按 ALS 注入/过滤。
 */
@Entity({ name: 'dl_note' })
@Index('idx_dl_note_user', ['userId'])
@Index('idx_dl_note_project_concept', ['projectId', 'conceptId'])
export class DlNoteEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'concept_id', type: 'varchar', nullable: true })
  conceptId!: string | null

  /** selection | qna */
  @Column({ name: 'source', type: 'varchar' })
  source!: string

  @Column({ name: 'anchor_text', type: 'text', nullable: true })
  anchorText!: string | null

  @Column({ name: 'anchor_start', type: 'integer', nullable: true })
  anchorStart!: number | null

  @Column({ name: 'anchor_end', type: 'integer', nullable: true })
  anchorEnd!: number | null

  @Column({ name: 'question_id', type: 'varchar', nullable: true })
  questionId!: string | null

  @Column({ name: 'content_md', type: 'text' })
  contentMd!: string

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null
}
