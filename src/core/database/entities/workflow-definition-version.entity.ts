import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 工作流版本历史 Entity
 *
 * 一行 = 一次发布的不可变快照（图/触发器/设置/名称等）。
 * - publish() 时写入（version = 发布版本号）
 * - 恢复历史版本 = 把快照应用为当前草稿（重新发布产生新版本，历史不丢失）
 *
 * 多租户：createdBy 记录创建者（版本属于定义，定义本身已有所有权隔离）。
 */
@Entity({ name: 'workflow_definition_versions' })
@Index('idx_wf_defver_def', ['definitionId', 'version'])
export class WorkflowDefinitionVersionEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'definition_id', type: 'varchar' })
  definitionId!: string

  /** 对应发布的版本号（definition.published_version 的历史值） */
  @Column({ name: 'version', type: 'integer' })
  version!: number

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'category', type: 'varchar', nullable: true })
  category!: string | null

  /** WorkflowGraph JSON 快照 */
  @Column({ name: 'graph', type: 'text' })
  graph!: string

  /** WorkflowTrigger[] JSON */
  @Column({ name: 'triggers', type: 'text', nullable: true })
  triggers!: string | null

  /** WorkflowExecutionSettings JSON */
  @Column({ name: 'settings', type: 'text', nullable: true })
  settings!: string | null

  /** 发布备注（可选） */
  @Column({ name: 'note', type: 'text', nullable: true })
  note!: string | null

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null
}
