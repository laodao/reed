import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 应用定义 Entity（片1）
 *
 * 应用 = 发布单元，来源 = 已发布工作流（source_kind='workflow', source_id=definition_id）。
 * source_version 为创建时的 published_version 快照（展示用；会话启动现场取最新发布图）。
 * 四渠道开关独立可控；share_token 仅分享渠道生成（跨租户免登录页解析）。
 *
 * 多租户：userId 列由 BaseRepository 自动注入（Web 端 ALS / PC 端 null）。
 */
@Entity({ name: 'apps' })
@Index('idx_apps_user', ['userId'])
@Index('idx_apps_source', ['sourceKind', 'sourceId'])
@Index('idx_apps_share_token', ['shareToken'], { unique: true })
export class AppEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'icon', type: 'text', nullable: true })
  icon!: string | null

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  /** 来源类型（APPLICATION_SOURCE_KINDS） */
  @Column({ name: 'source_kind', type: 'varchar' })
  sourceKind!: string

  /** 来源工作流定义 id */
  @Column({ name: 'source_id', type: 'varchar' })
  sourceId!: string

  /** 创建时的 published_version 快照 */
  @Column({ name: 'source_version', type: 'integer', nullable: true })
  sourceVersion!: number | null

  /** 会话渠道开关 */
  @Column({ name: 'channel_session', type: 'integer', default: 1 })
  channelSession!: number

  /** 分享渠道开关 */
  @Column({ name: 'channel_share', type: 'integer', default: 0 })
  channelShare!: number

  /** API 渠道开关 */
  @Column({ name: 'channel_api', type: 'integer', default: 1 })
  channelApi!: number

  /** 分享令牌（256bit hex；NULL=未分享） */
  @Column({ name: 'share_token', type: 'varchar', nullable: true })
  shareToken!: string | null

  /** 应用启停（停用=全部渠道失效） */
  @Column({ name: 'enabled', type: 'integer', default: 1 })
  enabled!: number

  @Column({ name: 'last_run_at', type: 'datetime', nullable: true })
  lastRunAt!: Date | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}