import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * agent 工具调用审计 Entity（agent_tool_calls，25 号 M2 批1）。
 *
 * 一行 = 一次工具调用（registry 审计面 AgentToolCallAudit 的落库形态）。
 * 字段白名单制：args/result 只落 ≤500 字符 preview（registry 已截断），禁记
 * 解密后凭据/完整响应体。写路径 fire-and-forget，审计失败不影响调用结果。
 */
@Entity({ name: 'agent_tool_calls' })
@Index('idx_agent_toolcall_user', ['userId'])
@Index('idx_agent_toolcall_run', ['runId'])
@Index('idx_agent_toolcall_session', ['sessionKey'])
export class AgentToolCallEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 单用户为 null。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'run_id', type: 'varchar', nullable: true })
  runId!: string | null

  @Column({ name: 'node_id', type: 'varchar', nullable: true })
  nodeId!: string | null

  /** 会话直调场景：session:<definitionId>:<scopeId> */
  @Column({ name: 'session_key', type: 'varchar', nullable: true })
  sessionKey!: string | null

  @Column({ name: 'tool_name', type: 'varchar' })
  toolName!: string

  @Column({ name: 'danger_level', type: 'varchar' })
  dangerLevel!: string

  /** not-required / approved / rejected / auto */
  @Column({ name: 'approval', type: 'varchar' })
  approval!: string

  /** succeeded / failed / blocked / rejected */
  @Column({ name: 'status', type: 'varchar' })
  status!: string

  @Column({ name: 'error_code', type: 'varchar', nullable: true })
  errorCode!: string | null

  @Column({ name: 'args_preview', type: 'text', nullable: true })
  argsPreview!: string | null

  @Column({ name: 'result_preview', type: 'text', nullable: true })
  resultPreview!: string | null

  @Column({ name: 'truncated', type: 'boolean', nullable: true })
  truncated!: boolean | null

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null

  @Column({ name: 'context_json', type: 'text', nullable: true })
  contextJson!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
