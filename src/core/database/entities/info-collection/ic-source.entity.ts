import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 信息搜集「源记录」Entity（ic_sources，2026-10-07 设计落地；过程心脏：一个 URL 一行）
 *
 * 溯源四件套（url/tier/published_at/snapshot）+ 转载簇（cluster_id，指纹判定）+
 * 审阅状态机（staged → confirmed/rejected/merged）。快照文件落
 * <dataPath>/info-collection/snapshots/，**抓到即落快照再解析**（先保命再干活）。
 * 入库后 kb_document_id 回链知识库文档（内容唯一存储在 kb，本表只存治理元数据）。
 */
@Entity({ name: 'ic_sources' })
@Index('idx_ic_sources_user', ['userId'])
@Index('idx_ic_sources_project_review', ['projectId', 'reviewStatus'])
@Index('idx_ic_sources_url', ['urlNormalized'])
@Index('idx_ic_sources_cluster', ['clusterId'])
export class IcSourceEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'task_id', type: 'varchar' })
  taskId!: string

  /** 原始 URL（首采原样保留） */
  @Column({ name: 'url', type: 'text' })
  url!: string

  /** 规范化 URL（去 tracking/排序查询参数；增量跳过与去重键） */
  @Column({ name: 'url_normalized', type: 'text' })
  urlNormalized!: string

  /** 信源四级：1 官方机构 | 2 官方媒体 | 3 互联网媒体 | 4 互联网搜索 */
  @Column({ name: 'tier', type: 'integer', nullable: true })
  tier!: number | null

  /** 定级依据（为什么是这个级）——不允许裸定级入库 */
  @Column({ name: 'tier_rationale', type: 'text', nullable: true })
  tierRationale!: string | null

  /** 是否转载簇主源（发布时间最早 + 等级最高） */
  @Column({ name: 'is_primary', type: 'integer', default: 0 })
  isPrimary!: number

  /** 转载/同文簇 id（text_fingerprint 判定；只影响主源选择，不删内容） */
  @Column({ name: 'cluster_id', type: 'varchar', nullable: true })
  clusterId!: string | null

  /** 页面发布时间（提取不到为 NULL：time-unknown 不得作时效窗 IR 的唯一依据） */
  @Column({ name: 'published_at', type: Date, nullable: true })
  publishedAt!: Date | null

  @Column({ name: 'collected_at', type: Date, nullable: true })
  collectedAt!: Date | null

  /** 快照相对 dataPath 路径（单文件 HTML + markdown） */
  @Column({ name: 'snapshot_path', type: 'text', nullable: true })
  snapshotPath!: string | null

  /** 内容哈希（规范化正文；同 URL 重采不变 → 跳过） */
  @Column({ name: 'content_hash', type: 'varchar', nullable: true })
  contentHash!: string | null

  /** 正文指纹（IcFingerprint JSON；簇判定用） */
  @Column({ name: 'text_fingerprint', type: 'text', nullable: true })
  textFingerprint!: string | null

  /** ok | partial | failed | blocked（blocked 进手动导入建议清单） */
  @Column({ name: 'fetch_status', type: 'varchar', default: 'ok' })
  fetchStatus!: string

  /** staged | confirmed | rejected | merged */
  @Column({ name: 'review_status', type: 'varchar', default: 'staged' })
  reviewStatus!: string

  /** 入库后的知识库文档 id（确认后回链） */
  @Column({ name: 'kb_document_id', type: 'varchar', nullable: true })
  kbDocumentId!: string | null

  /** 该源满足了哪些 IR（["R1","R3"]） */
  @Column({ name: 'ir_hits_json', type: 'text', nullable: true })
  irHitsJson!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
