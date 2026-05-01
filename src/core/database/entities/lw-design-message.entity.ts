import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 设计消息 Entity（FK CASCADE 到 lw_design_conversations）。
 * timestamp 是 INTEGER（epoch ms）。
 */
@Entity({ name: 'lw_design_messages' })
@Index('idx_lw_design_messages_conversation', ['conversationId'])
export class LwDesignMessageEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'conversation_id', type: 'varchar' })
  conversationId!: string

  @Column({ name: 'role', type: 'varchar' })
  role!: string

  @Column({ name: 'content', type: 'text' })
  content!: string

  @Column({
    name: 'timestamp',
    type: 'bigint',
    transformer: {
      to: (v: number | string) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  timestamp!: number

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number
}
