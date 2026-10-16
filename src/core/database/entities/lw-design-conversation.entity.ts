import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 设计对话（容器）Entity。messages 列是 JSON 兼容字段，
 * 实际消息存储在独立的 lw_design_messages 表（见 LwDesignMessageEntity）。
 */
@Entity({ name: 'lw_design_conversations' })
@Index('idx_lw_conversations_project_id', ['projectId'])
export class LwDesignConversationEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

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
