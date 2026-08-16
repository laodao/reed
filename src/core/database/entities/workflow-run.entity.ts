import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 工作流运行 Entity
 *
 * 一行 = 工作流的一次执行实例。graph_snapshot 是启动时的图快照（执行事实源）——
 * 断点续跑与历史回放都基于快照，不受定义后续编辑/再发布影响。
 *
 * 状态机：pending（全局并发排队）→ running →（waiting_review 挂起等待人工审核）
 * → succeeded / failed / cancelled / interrupted / timed_out；
 * skipped = 触发被跳过（同工作流运行中），仅留痕不执行。
 *
 * 多租户：userId 列由 BaseRepository 自动注入。⚠️ 引擎所有异步入口必须
 * runWithUserAsync(run.userId) 包裹——Web 端事件推送与数据隔离都依赖 ALS。
 */
@Entity({ name: 'workflow_runs' })
@Index('idx_wf_run_user', ['userId'])
@Index('idx_wf_run_def_status', ['definitionId', 'status'])
@Index('idx_wf_run_status', ['status'])
export class WorkflowRunEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'definition_id', type: 'varchar' })
  definitionId!: string

  /** 启动时的发布版本号 */
  @Column({ name: 'definition_version', type: 'integer' })
  definitionVersion!: number

  /** 启动时的图快照（WorkflowGraph JSON，执行事实源） */
  @Column({ name: 'graph_snapshot', type: 'text' })
  graphSnapshot!: string

  /** manual / cron / event / resume */
  @Column({ name: 'trigger_type', type: 'varchar' })
  triggerType!: string

  /** 触发上下文 JSON（cron 表达式 / 事件名+payload 摘要 / 触发人 / resume 标记） */
  @Column({ name: 'trigger_info', type: 'text', nullable: true })
  triggerInfo!: string | null

  /** 开始节点输入实参 JSON */
  @Column({ name: 'start_inputs', type: 'text', nullable: true })
  startInputs!: string | null

  /** WorkflowRunStatus */
  @Column({ name: 'status', type: 'varchar' })
  status!: string

  /** status=skipped 时的原因（如"同工作流已有运行中实例"） */
  @Column({ name: 'skip_reason', type: 'varchar', nullable: true })
  skipReason!: string | null

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt!: Date | null

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt!: Date | null

  /** 运行耗时毫秒（时长类字段用 integer，非日期） */
  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null

  /** 运行最长时长死线（防失控；到点由引擎标记 timed_out） */
  @Column({ name: 'timeout_at', type: 'datetime', nullable: true })
  timeoutAt!: Date | null

  /** 运行统计 JSON：{ totalNodes, doneNodes, failedNodes, recoveredNodes } */
  @Column({ name: 'stats', type: 'text', nullable: true })
  stats!: string | null

  /** 用户请求取消的时间（取消留痕） */
  @Column({ name: 'cancel_requested_at', type: 'datetime', nullable: true })
  cancelRequestedAt!: Date | null

  /** 断点续跑来源运行 ID（本运行是 resume 产生的新运行） */
  @Column({ name: 'resumed_from_run_id', type: 'varchar', nullable: true })
  resumedFromRunId!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
