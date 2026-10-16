import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 信息搜集「任务」Entity（ic_tasks，2026-10-07 设计落地）
 *
 * 任务 = 一次蓝图执行（可重复运行 = 增量刷新）。run_id 指向工作流运行
 * （执行复用工作流引擎，运行记录天然可查）；stats_json 汇总 IR 覆盖率 /
 * 源数 / 工具调用 / 成本——查询日志与成本可诊断性的数据源。
 */
@Entity({ name: 'ic_tasks' })
@Index('idx_ic_tasks_user', ['userId'])
@Index('idx_ic_tasks_project_status', ['projectId', 'status'])
export class IcTaskEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** 执行时锁定的蓝图版本 */
  @Column({ name: 'blueprint_version', type: 'integer', default: 1 })
  blueprintVersion!: number

  /** 工作流运行 id（执行复用工作流引擎；pending 时为空） */
  @Column({ name: 'run_id', type: 'varchar', nullable: true })
  runId!: string | null

  /** pending | running | reviewing | done | failed | cancelled */
  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string

  /** 统计 JSON（IR 覆盖率/源数/工具调用/成本/负结果计数） */
  @Column({ name: 'stats_json', type: 'text', nullable: true })
  statsJson!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'finished_at', type: Date, nullable: true })
  finishedAt!: Date | null
}
