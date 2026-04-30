import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 设计对话 Entity。
 */
@Entity({ name: 'lw_design_conversations' })
@Index('idx_lw_conversations_project_id', ['projectId'])
export class LwDesignMessageEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'stage', type: 'varchar' })
  stage!: string

  @Column({ name: 'messages', type: 'simple-json', nullable: true })
  messages!: unknown[] | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
