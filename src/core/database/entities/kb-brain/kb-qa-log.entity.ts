import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/** 知识大脑·质检日志（kb_qa_log，v2 P4）：冶炼产物 judge 抽检评分（0-2） */
@Entity({ name: 'kb_qa_log' })
@Index('idx_kb_qa_log_kb', ['kbId', 'createdAt'])
export class KbQaLogEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'kb_id', type: 'varchar' })
  kbId!: string

  @Column({ name: 'note_id', type: 'varchar' })
  noteId!: string

  /** 0=不合格 1=勉强 2=可用 */
  @Column({ name: 'score', type: 'float' })
  score!: number

  @Column({ name: 'reason', type: 'varchar', nullable: true })
  reason!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
