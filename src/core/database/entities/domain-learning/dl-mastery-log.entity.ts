import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 领域学习掌握度变更审计 Entity（dl_mastery_log，design-v3 §9）
 *
 * mastery 只由用户行为推进（懂了/自测通过/费曼复述），本表为每次变更留下
 * 审计轨迹（from→to + 触发源），供回访（M3 需复习调度）与可信度追溯。
 */
@Entity({ name: 'dl_mastery_log' })
@Index('idx_dl_mastery_log_user', ['userId'])
@Index('idx_dl_mastery_log_concept', ['projectId', 'conceptId'])
export class DlMasteryLogEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'concept_id', type: 'varchar' })
  conceptId!: string

  /** 变更前掌握度 */
  @Column({ name: 'from_mastery', type: 'varchar' })
  fromMastery!: string

  /** 变更后掌握度 */
  @Column({ name: 'to_mastery', type: 'varchar' })
  toMastery!: string

  /** 触发源：lesson_ack | self_test | qna | expire | manual | split */
  @Column({ name: 'trigger', type: 'varchar' })
  trigger!: string

  /** 变更发生时间 */
  @Column({ name: 'at', type: 'datetime', nullable: true })
  at!: Date | null
}
