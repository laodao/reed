import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识大脑·复习日志 Entity（kb_note_reviews，详细设计 §1.7）
 *
 * 学习模式的评分流水（仅追加）：FSRS 的 stability/difficulty 由评分序列
 * 重算（ts-fsrs），kb_notes 上的 fsrs_* 列只是当前态缓存——缓存可丢弃
 * 可重建，评分历史不可再生，所以单独落表。
 */

/** FSRS 评分：1=again 2=hard 3=good 4=easy */
export type KbReviewRating = 1 | 2 | 3 | 4

@Entity({ name: 'kb_note_reviews' })
@Index('idx_kb_note_reviews_note', ['noteId'])
export class KbNoteReviewEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'note_id', type: 'varchar' })
  noteId!: string

  @Column({ name: 'kb_id', type: 'varchar' })
  kbId!: string

  @Column({ name: 'rating', type: 'integer' })
  rating!: number

  /** ts-fsrs 返回的调度/流逝天数（复算与调试用） */
  @Column({ name: 'scheduled_days', type: 'float', nullable: true })
  scheduledDays!: number | null

  @Column({ name: 'elapsed_days', type: 'float', nullable: true })
  elapsedDays!: number | null

  @Column({ name: 'reviewed_at', type: 'datetime' })
  reviewedAt!: Date
}
