import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * agent 轨迹 Entity（agent_trajectories，25 号 M2 批1）。
 *
 * 一行 = agent 循环的一条轨迹条目（TrajectoryEntry，12 号 §5.2 emitTrajectory 契约）。
 * 观测面数据：insert-or-ignore 幂等写，(scope_key, seq) 唯一；不参与 journal 重放。
 * 保留策略随宿主生命周期：workflow 行随 run 删除级联，session 行随会话重置级联。
 */
@Entity({ name: 'agent_trajectories' })
@Index('idx_agent_traj_user', ['userId'])
@Index('uq_agent_traj_seq', ['scopeKey', 'seq'], { unique: true })
export class AgentTrajectoryEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 单用户为 null。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  /** 确定性幂等 id：tr_<scopeKey>_<seq> */
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 'workflow' | 'session' */
  @Column({ name: 'scope', type: 'varchar' })
  scope!: string

  /** workflow: `<runId>:<nodeId>:<iterationIndex>`；session: `session:<definitionId>:<scopeId>` */
  @Column({ name: 'scope_key', type: 'varchar' })
  scopeKey!: string

  /** scope 内单调递增序号（sink 初始化时从库内 max(seq) 续接——崩溃恢复不重不漏） */
  @Column({ name: 'seq', type: 'integer' })
  seq!: number

  /** 循环轮次 */
  @Column({ name: 'iteration', type: 'integer' })
  iteration!: number

  /** decision/tool_call/tool_result/human_request/human_decision/guardrail_stop/final */
  @Column({ name: 'kind', type: 'varchar' })
  kind!: string

  @Column({ name: 'name', type: 'varchar', nullable: true })
  name!: string | null

  /** TrajectoryEntry.payload JSON（字节截断，上限 16KB） */
  @Column({ name: 'payload_json', type: 'text', nullable: true })
  payloadJson!: string | null

  @Column({ name: 'prompt_tokens', type: 'integer', nullable: true })
  promptTokens!: number | null

  @Column({ name: 'completion_tokens', type: 'integer', nullable: true })
  completionTokens!: number | null

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
