import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 工作流定义 Entity
 *
 * 一行 = 一个工作流。草稿/发布双图模型：
 * - draft_graph 可随编辑自由变化
 * - publish() 时草稿复制进 published_graph 并 published_version+1（发布版不可变）
 * - 运行（workflow_runs）绑定 definition_version + graph_snapshot（启动时快照），
 *   发布新版不影响进行中/历史运行
 *
 * 触发器内嵌 triggers JSON 列（手动触发隐式可用不入库）；cron 调度状态
 * （next_fire_at/last_fire_at）冗余在本行，调度器 tick 只扫到期行，避免全量重算。
 *
 * 多租户：userId 列由 BaseRepository 自动注入（Web 端 ALS / PC 端 null）。
 */
@Entity({ name: 'workflow_definitions' })
@Index('idx_wf_def_user', ['userId'])
@Index('idx_wf_def_next_fire', ['nextFireAt'])
@Index('idx_wf_def_share_token', ['shareToken'], { unique: true })
export class WorkflowDefinitionEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 ALS 注入；Electron 单用户为 null。
   * BaseRepository 在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  /** 用户自定分组（列表页筛选用，自由文本） */
  @Column({ name: 'category', type: 'varchar', nullable: true })
  category!: string | null

  /** 草稿图（WorkflowGraph JSON；新建时可含 start/end 骨架） */
  @Column({ name: 'draft_graph', type: 'text', nullable: true })
  draftGraph!: string | null

  /** 当前发布版图（发布时从草稿复制；发布前为 null） */
  @Column({ name: 'published_graph', type: 'text', nullable: true })
  publishedGraph!: string | null

  /** 发布版本号；0 = 从未发布（定时/事件触发只对已发布版本生效） */
  @Column({ name: 'published_version', type: 'integer', default: 0 })
  publishedVersion!: number

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt!: Date | null

  /** WorkflowTrigger[] JSON（对发布版生效） */
  @Column({ name: 'triggers', type: 'text', nullable: true })
  triggers!: string | null

  /** WorkflowExecutionSettings JSON（防失控配置） */
  @Column({ name: 'settings', type: 'text', nullable: true })
  settings!: string | null

  /** cron 下次触发时间（调度器扫描列：next_fire_at <= now 且已发布的行） */
  @Column({ name: 'next_fire_at', type: 'datetime', nullable: true })
  nextFireAt!: Date | null

  /** cron 上次实际触发时间（错过判定与推进的基准） */
  @Column({ name: 'last_fire_at', type: 'datetime', nullable: true })
  lastFireAt!: Date | null

  /** 最近一次运行时间（列表页展示冗余列） */
  @Column({ name: 'last_run_at', type: 'datetime', nullable: true })
  lastRunAt!: Date | null

  /**
   * C3 分享令牌（免登录独立页）：启用分享时生成的随机 token；null = 未分享。
   * 唯一索引（NULL 不参与唯一性，SQLite/PG 均允许多行 NULL）。
   */
  @Column({ name: 'share_token', type: 'varchar', nullable: true })
  shareToken!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
