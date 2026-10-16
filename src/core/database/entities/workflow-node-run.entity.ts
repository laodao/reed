import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * 工作流节点运行 Entity（节点级 checkpoint）
 *
 * 一行 = 一次运行中某节点某迭代的执行记录，(run_id, node_id, iteration_index) 唯一。
 * 生命周期：同一行从 running 更新到终态（重试不建新行，只更新 retry_count/input_json）。
 *
 * checkpoint 语义：节点执行成功的唯一凭证是 status='succeeded' AND output_json
 * 非空——断点续跑按此装配变量上下文（已成功节点不重执行）。
 *
 * iteration_index：循环体节点为迭代下标（0 起），非循环体内恒 0。
 * V1 不支持嵌套循环（graph-validator 强制），单整数下标足够。
 *
 * 多租户：userId 列由 BaseRepository 自动注入。
 */
@Entity({ name: 'workflow_node_runs' })
@Index('idx_wf_noderun_user', ['userId'])
@Index('idx_wf_noderun_run', ['runId'])
@Index('idx_wf_noderun_wait', ['waitExpiresAt'])
@Unique('uq_wf_noderun_exec', ['runId', 'nodeId', 'iterationIndex'])
export class WorkflowNodeRunEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 ALS 注入；Electron 单用户为 null。
   * BaseRepository 在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'run_id', type: 'varchar' })
  runId!: string

  /** 图内节点 ID（变量命名空间） */
  @Column({ name: 'node_id', type: 'varchar' })
  nodeId!: string

  /** 节点类型快照（图可能再被编辑，运行时信息以快照为准） */
  @Column({ name: 'node_type', type: 'varchar' })
  nodeType!: string

  /** 节点显示名快照 */
  @Column({ name: 'node_name', type: 'varchar' })
  nodeName!: string

  /** 循环体迭代下标（非循环体内恒 0） */
  @Column({ name: 'iteration_index', type: 'integer', default: 0 })
  iterationIndex!: number

  /** WorkflowNodeRunStatus */
  @Column({ name: 'status', type: 'varchar' })
  status!: string

  /** 本次执行已解析的输入实参 JSON（重试间可能不同） */
  @Column({ name: 'input_json', type: 'text', nullable: true })
  inputJson!: string | null

  /** 输出 JSON（checkpoint 本体：成功后供续跑复用与变量引用） */
  @Column({ name: 'output_json', type: 'text', nullable: true })
  outputJson!: string | null

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null

  /** 实际重试次数 */
  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number

  /** 实际走的出边 handleId（条件分支/审核节点留痕，如 "branch:br1"） */
  @Column({ name: 'route_taken', type: 'varchar', nullable: true })
  routeTaken!: string | null

  /** 审核超时死线（status=waiting_review 时由 ticker 扫描） */
  @Column({ name: 'wait_expires_at', type: Date, nullable: true })
  waitExpiresAt!: Date | null

  /** 审核操作留痕 JSON：{ decision, comment, editedValues, decidedAt } */
  @Column({ name: 'review', type: 'text', nullable: true })
  review!: string | null

  /** 节点内中间状态 JSON（E2：agent 循环历史/迭代计数——可变行，saveState 覆盖写） */
  @Column({ name: 'state_json', type: 'text', nullable: true })
  stateJson!: string | null

  @Column({ name: 'started_at', type: Date, nullable: true })
  startedAt!: Date | null

  @Column({ name: 'finished_at', type: Date, nullable: true })
  finishedAt!: Date | null

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
