import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 工作流运行事件日志 Entity（Run Journal，11 号 §4.1 E1）。
 *
 * 一行 = 一次调度状态变迁（边激活/节点启动/挂起/决策/失败/循环推进/快照/终态）。
 * 引擎私有事实源：先写本表后改内存；(run_id, seq) 唯一保证重放序严格单调。
 * 保留策略与 run 生命周期绑定（deleteRun 级联；终态 run 按阈值清扫），
 * 不进通用事件平台的归档体系（11 号 §3.1 边界）。
 */
@Entity({ name: 'workflow_run_events' })
@Index('idx_wf_runevent_user', ['userId'])
@Index('idx_wf_runevent_run', ['runId'])
@Index('uq_wf_runevent_seq', ['runId', 'seq'], { unique: true })
export class WorkflowRunEventEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 单用户为 null。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'run_id', type: 'varchar' })
  runId!: string

  /** run 内严格单调的重放序号（引擎内存计数器同步分配） */
  @Column({ name: 'seq', type: 'integer' })
  seq!: number

  /** WORKFLOW_JOURNAL_EVENT_TYPES 之一 */
  @Column({ name: 'type', type: 'varchar' })
  type!: string

  /** 关联节点（run 级事件为 null） */
  @Column({ name: 'node_id', type: 'varchar', nullable: true })
  nodeId!: string | null

  /** 作用域键：'root' 或 `${loopNodeId}:${iterationIndex}` */
  @Column({ name: 'scope_key', type: 'varchar', nullable: true })
  scopeKey!: string | null

  /** 事件载荷 JSON（类型化结构见 11 号 §4.3） */
  @Column({ name: 'payload_json', type: 'text', nullable: true })
  payloadJson!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null
}
