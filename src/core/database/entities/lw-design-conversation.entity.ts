import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 设计对话（容器）Entity。messages 列是 JSON 兼容字段，
 * 实际消息存储在独立的 lw_design_messages 表（见 LwDesignMessageEntity）。
 */
@Entity({ name: 'lw_design_conversations' })
@Index('idx_lw_conversations_project_id', ['projectId'])
export class LwDesignConversationEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'stage', type: 'varchar' })
  stage!: string

  /** 旧 JSON 字段（迁移源），新代码用 lw_design_messages 表 */
  @Column({ name: 'messages', type: 'text', nullable: true })
  messages!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
