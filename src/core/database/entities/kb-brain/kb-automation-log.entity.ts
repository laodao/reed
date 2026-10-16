import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识大脑·自动化动作日志（kb_automation_log，v2 P4）：
 * 后台写操作台账（detail 记产物 noteIds 等）——undo 依据与「最近自动化动作」
 * 时间线数据源（信任 UX：可查可撤销）。
 */
@Entity({ name: 'kb_automation_log' })
@Index('idx_kb_automation_log_kb', ['kbId', 'createdAt'])
export class KbAutomationLogEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'kb_id', type: 'varchar' })
  kbId!: string

  /** smelt / corpus / goal:<名> / book-passes … */
  @Column({ name: 'action', type: 'varchar' })
  action!: string

  /** {noteIds?, summary, scenes?, merged?} JSON */
  @Column({ name: 'detail_json', type: 'varchar', nullable: true })
  detailJson!: string | null

  /** 1=已撤销（undo 归档其产物） */
  @Column({ name: 'undone', type: 'integer', default: 0 })
  undone!: number

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
