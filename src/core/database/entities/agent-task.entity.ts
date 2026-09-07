import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * agent 任务树 Entity（agent_tasks，26 号 M3 批1 / 01 号 §5）。
 *
 * 一行 = 一个任务节点。状态机与调度语义见 26 号 §2；spec_json 承载目标/
 * 验收标准/输入输出契约/工具白名单/验证器配置（任务即契约——验收标准在
 * 规划期声明，产出必须过验证器）。
 */
@Entity({ name: 'agent_tasks' })
@Index('idx_agent_task_user', ['userId'])
@Index('idx_agent_task_root', ['rootId'])
@Index('idx_agent_task_parent', ['parentId'])
@Index('idx_agent_task_status', ['status'])
export class AgentTaskEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 单用户为 null。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 父任务（根任务为 null） */
  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId!: string | null

  /** 根任务 id（树查询冗余键） */
  @Column({ name: 'root_id', type: 'varchar' })
  rootId!: string

  /** 树深度（防递归爆炸，上限 MAX_TASK_DEPTH） */
  @Column({ name: 'depth', type: 'integer' })
  depth!: number

  @Column({ name: 'title', type: 'varchar' })
  title!: string

  /** 任务契约 JSON：{ goal, acceptance, toolWhitelist?, verification?, deps? } */
  @Column({ name: 'spec_json', type: 'text' })
  specJson!: string

  /** pending_review/planning/ready/running/verifying/succeeded/failed/cancelled/escalated/replanned */
  @Column({ name: 'status', type: 'varchar' })
  status!: string

  /** agent_loop | sub_workflow:<definitionId> | human */
  @Column({ name: 'executor', type: 'varchar' })
  executor!: string

  /** 关联运行实例（sub_workflow 执行器的 runId；agent_loop 执行器为空） */
  @Column({ name: 'run_id', type: 'varchar', nullable: true })
  runId!: string | null

  /** 子树预算 JSON：{ maxRetries?, maxConcurrent?, replans? } */
  @Column({ name: 'budget_json', type: 'text', nullable: true })
  budgetJson!: string | null

  /** 验收得分（0-1；子树聚合） */
  @Column({ name: 'quality_score', type: 'real', nullable: true })
  qualityScore!: number | null

  /** 产出 JSON（最终输出 + 验证器结论） */
  @Column({ name: 'result_json', type: 'text', nullable: true })
  resultJson!: string | null

  @Column({ name: 'retry_count', type: 'integer', nullable: true })
  retryCount!: number | null

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
