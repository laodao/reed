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
@Index('idx_apps_source', ['sourceKind', 'sourceId'], { unique: true })  // 同定义只允许一个应用（幂等兜底）
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

  /** 应用分类（自由文本，如 新闻资讯/文案写作/视频处理；AppList 分类筛选/首页分组用） */
  @Column({ name: 'category', type: 'varchar', nullable: true })
  category!: string | null

  /** 标签列表（JSON 数组字符串；搜索/展示用） */
  @Column({ name: 'tags', type: 'text', nullable: true })
  tags!: string | null

  /** 固定到首页（1=首页显示快捷入口） */
  @Column({ name: 'pinned', type: 'integer', default: 0, nullable: true })
  pinned!: number | null

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

  /** 分享令牌（256bit hex；NULL=未分享）。⚠️ 安全整改：新令牌只存 share_token_hash，本列仅历史兼容 */
  @Column({ name: 'share_token', type: 'varchar', nullable: true })
  shareToken!: string | null

  /** 分享令牌 sha256 hash（新启用分享时存此列，不明文落库） */
  @Column({ name: 'share_token_hash', type: 'varchar', nullable: true })
  shareTokenHash!: string | null

  /** 应用启停（停用=全部渠道失效） */
  @Column({ name: 'enabled', type: 'integer', default: 1 })
  enabled!: number

  /** 内置应用（1=user_id NULL 全局共享，禁删禁改，允许复制；0=用户自有） */
  @Column({ name: 'is_builtin', type: 'integer', default: 0, nullable: true })
  isBuiltin!: number | null

  @Column({ name: 'last_run_at', type: Date, nullable: true })
  lastRunAt!: Date | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}