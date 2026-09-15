import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识点节点字段变更审计 Entity（dl_concept_log，2026-09-15 版本管理 B4）
 *
 * 记录 name/en/definitionShort/parentId/attrs/note 等字段的 from/to；
 * mastery 变更仍走 dl_mastery_log（不重复）。
 */
@Entity({ name: 'dl_concept_log' })
@Index('idx_dl_concept_log_user', ['userId'])
@Index('idx_dl_concept_log_concept', ['projectId', 'conceptId'])
@Index('idx_dl_concept_log_field', ['projectId', 'conceptId', 'field'])
export class DlConceptLogEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'concept_id', type: 'varchar' })
  conceptId!: string

  /** 被改字段名（name / en / definitionShort / parentId / attrs / note） */
  @Column({ name: 'field', type: 'varchar' })
  field!: string

  /** 变更前值（JSON.stringify 序列化；null=之前无值） */
  @Column({ name: 'from_value', type: 'text', nullable: true })
  fromValue!: string | null

  /** 变更后值 */
  @Column({ name: 'to_value', type: 'text', nullable: true })
  toValue!: string | null

  /** 触发来源：agent | manual | map_completion | restore */
  @Column({ name: 'trigger', type: 'varchar' })
  trigger!: string

  @Column({ name: 'at', type: 'datetime', nullable: true })
  at!: Date | null
}