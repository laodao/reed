import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 应用会话消息 Entity（独立消息存储，隔离 AI 对话表）
 *
 * 一行 = 工作流应用会话里的一条消息（启动表单/审核/进度/结果卡片）。
 * session_id 引用 app_session.id（但无 FK 约束——会话删除由 service 显式清理）。
 * 不再复用 messages/dialogs 表，杜绝工作流会话污染 AI 对话数据。
 */
@Entity({ name: 'app_session_messages' })
@Index('idx_app_session_messages_session', ['sessionId'])
export class AppSessionMessageEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'session_id', type: 'varchar' })
  sessionId!: string

  /** 'user' | 'assistant' */
  @Column({ name: 'role', type: 'varchar' })
  role!: string

  @Column({ name: 'content', type: 'text' })
  content!: string

  /** sessionCard 等结构化元数据（JSON 字符串） */
  @Column({ name: 'metadata', type: 'text', nullable: true })
  metadata!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null
}
