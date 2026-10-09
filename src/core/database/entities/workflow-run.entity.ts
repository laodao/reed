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
  /**
   * 所属用户 ID（多租户隔离）。Web 端 ALS 注入；Electron 单用户为 null。
   * BaseRepository 在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
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

  /** 互斥作用域（'' = 无作用域=同定义全局互斥；同 scope 只允许一个活动 run，DB 索引兜底） */
  @Column({ name: 'mutex_scope', type: 'text', nullable: false, default: '' })
  mutexScope!: string

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

  @Column({ name: 'started_at', type: Date, nullable: true })
  startedAt!: Date | null

  @Column({ name: 'finished_at', type: Date, nullable: true })
  finishedAt!: Date | null

  /** 运行耗时毫秒（时长类字段用 integer，非日期） */
  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null

  /** 运行最长时长死线（防失控；到点由引擎标记 timed_out） */
  @Column({ name: 'timeout_at', type: Date, nullable: true })
  timeoutAt!: Date | null

  /** 运行统计 JSON：{ totalNodes, doneNodes, failedNodes, recoveredNodes } */
  @Column({ name: 'stats', type: 'text', nullable: true })
  stats!: string | null

  /** 用户请求取消的时间（取消留痕） */
  @Column({ name: 'cancel_requested_at', type: Date, nullable: true })
  cancelRequestedAt!: Date | null

  /** 断点续跑来源运行 ID（本运行是 resume 产生的新运行） */
  @Column({ name: 'resumed_from_run_id', type: 'varchar', nullable: true })
  resumedFromRunId!: string | null

  /** 关联任务 id（M3 任务树：sub_workflow 执行器的 run 回填；26 号批1） */
  @Column({ name: 'task_id', type: 'varchar', nullable: true })
  taskId!: string | null

  /** 父运行 ID（任务树递归派生的子运行；运行森林镜像任务树） */
  @Column({ name: 'parent_run_id', type: 'varchar', nullable: true })
  parentRunId!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
