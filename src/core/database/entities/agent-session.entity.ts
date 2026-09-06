import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * Agent 会话消息 Entity（harness 独立宿主的 state 落点，23 号 §6 AgentSessionStore）。
 *
 * 一行 = 会话内一条 ModelMessage 的持久化快照（content 存整体 JSON，含
 * parts / tool-calls，load 原样还原）。save() 语义为全量替换：事务内
 * DELETE 该会话全部行 + 按下标重排 INSERT，seq 即 messages 数组下标。
 *
 * conversationId 约定 `{definitionId}:{scopeId}`（如 story-room:p-xxx）。
 *
 * 多租户：userId 列由 BaseRepository 自动注入；uq_agent_sessions_conv_seq
 * 含 user_id（NULL ≠ NULL 的方言语义：桌面单用户场景互斥由进程内串行化兜底，
 * 与 uq_wf_run_mutex 同一先例）。
 */
@Entity({ name: 'agent_sessions' })
@Index('idx_agent_sessions_user', ['userId'])
@Index('idx_agent_sessions_conversation', ['conversationId'])
@Index('uq_agent_sessions_conv_seq', ['userId', 'conversationId', 'seq'], { unique: true })
export class AgentSessionEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'conversation_id', type: 'varchar' })
  conversationId!: string

  /** 消息在会话内的序号（= messages 数组下标，load 按 seq 升序还原） */
  @Column({ name: 'seq', type: 'integer' })
  seq!: number

  /** user / assistant / system / tool（ModelMessage.role 冗余列，便于人工排查） */
  @Column({ name: 'role', type: 'varchar' })
  role!: string

  /** ModelMessage 整体 JSON（单一事实源；role 仅为冗余索引列） */
  @Column({ name: 'content', type: 'text' })
  content!: string

  /** 预留：轮次边界 / 压缩标注等（当前恒 NULL，读取兼容） */
  @Column({ name: 'metadata', type: 'text', nullable: true })
  metadata!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null
}
