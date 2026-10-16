import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 应用会话 Entity（片1）
 *
 * 一行 = 工作流应用的一个会话。会话消息复用 messages 表（dialog_id = 本表 id）。
 * status：idle（未运行）/ running（运行中/挂起）/ failed（最近一次运行失败）。
 *
 * 多租户：userId 列由 BaseRepository 自动注入。
 */
@Entity({ name: 'app_sessions' })
@Index('idx_app_sessions_app', ['appId'])
export class AppSessionEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'app_id', type: 'varchar' })
  appId!: string

  @Column({ name: 'title', type: 'varchar' })
  title!: string

  /** APP_SESSION_STATUSES */
  @Column({ name: 'status', type: 'varchar', default: 'idle' })
  status!: string

  @Column({ name: 'last_run_id', type: 'varchar', nullable: true })
  lastRunId!: string | null

  /** 最近一次提交的 start 参数 JSON（多轮默认沿用） */
  @Column({ name: 'last_start_inputs', type: 'text', nullable: true })
  lastStartInputs!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}