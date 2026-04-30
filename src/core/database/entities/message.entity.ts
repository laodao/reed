import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 消息 Entity
 * 对齐现有 messages 表 DDL（FK CASCADE 到 dialogs）。
 */
@Entity({ name: 'messages' })
export class MessageEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'dialog_id', type: 'varchar' })
  dialogId!: string

  @Column({ name: 'role', type: 'varchar' })
  role!: string

  @Column({ name: 'content', type: 'text' })
  content!: string

  @Column({ name: 'model_id', type: 'text', nullable: true })
  modelId!: string | null

  @Column({ name: 'tokens_used', type: 'integer', nullable: true })
  tokensUsed!: number | null

  @Column({ name: 'attachments', type: 'simple-json', nullable: true })
  attachments!: unknown[] | null

  @Column({ name: 'metadata', type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date
}
