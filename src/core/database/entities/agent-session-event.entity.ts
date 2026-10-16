import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 会话原始流水 Entity（agent_session_events，39 号 P0-2）
 *
 * 一行 = 一条 ModelMessage 首次进入会话历史时的原始快照（append-only）。
 * 与 agent_sessions（全量替换的「当前工作集」）互补：压缩/剪枝/折叠改写工作集
 * 后，原文在流水仍可回放审计。确定性幂等 id `se_<conversationId>_<seq>`
 * （insert-or-ignore，崩溃重放不重不漏——轨迹表同款纪律）。
 */
@Entity({ name: 'agent_session_events' })
@Index('idx_agent_events_user', ['userId'])
@Index('idx_agent_events_conversation', ['conversationId'])
@Index('uq_agent_events_conv_seq', ['userId', 'conversationId', 'seq'], { unique: true })
export class AgentSessionEventEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 单用户为 null。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  /** 确定性幂等 id：se_<conversationId>_<seq> */
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 会话键（HostKit sessionKey / 独立宿主 conversationId，与 agent_sessions 同键空间） */
  @Column({ name: 'conversation_id', type: 'varchar' })
  conversationId!: string

  /** 会话内 append 序号（从库内 max(seq) 续接） */
  @Column({ name: 'seq', type: 'integer' })
  seq!: number

  /** user / assistant / tool（冗余索引列） */
  @Column({ name: 'role', type: 'varchar' })
  role!: string

  /** ModelMessage 整体 JSON（原始形态；超限消息存占位） */
  @Column({ name: 'content', type: 'text' })
  content!: string

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
