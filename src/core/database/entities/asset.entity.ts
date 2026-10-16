import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 通用资产 Entity
 *
 * 资产 = 工作流/应用产出的可复用成果（图片/音频/视频/文档/文本/JSON），
 * 文件型资产 storage_path 存"相对 dataPath 的相对路径"（跨设备迁移安全），
 * DB 只存元数据，二进制在 dataPath/assets/ 目录。
 *
 * 多租户：userId 列由 BaseRepository 自动注入（Web 端 ALS / PC 端 null）。
 * 列名/类型与迁移 create-assets-tables 严格一致（checkSchemaDrift 校验）。
 */
@Entity({ name: 'assets' })
@Index('idx_assets_user', ['userId'])
@Index('idx_assets_category', ['category'])
@Index('idx_assets_created', ['createdAt'])
@Index('idx_assets_source', ['sourceType', 'sourceRef'])
export class AssetEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 大类（ASSET_CATEGORIES） */
  @Column({ name: 'category', type: 'varchar' })
  category!: string

  /** 子分类（自由文本，资产中心二级分组；模板资产可用 sub_category='报告模板' 等） */
  @Column({ name: 'sub_category', type: 'varchar', nullable: true })
  subCategory!: string | null

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  /** 标签列表（JSON 数组字符串） */
  @Column({ name: 'tags', type: 'text', nullable: true })
  tags!: string | null

  /** 存储形态（file|url|text|json） */
  @Column({ name: 'kind', type: 'varchar' })
  kind!: string

  /** 相对 dataPath 的文件路径（kind=file） */
  @Column({ name: 'storage_path', type: 'varchar', nullable: true })
  storagePath!: string | null

  /** 原始 URL（kind=url） */
  @Column({ name: 'url', type: 'text', nullable: true })
  url!: string | null

  /** 文本内容（kind=text） */
  @Column({ name: 'text_content', type: 'text', nullable: true })
  textContent!: string | null

  /** JSON 内容（kind=json，序列化字符串） */
  @Column({ name: 'json_content', type: 'text', nullable: true })
  jsonContent!: string | null

  @Column({ name: 'mime_type', type: 'varchar', nullable: true })
  mimeType!: string | null

  @Column({ name: 'size_bytes', type: 'integer', nullable: true })
  sizeBytes!: number | null

  /** 附加元数据（JSON 字符串） */
  @Column({ name: 'metadata', type: 'text', nullable: true })
  metadata!: string | null

  /** 来源类型（workflow|app|manual|import） */
  @Column({ name: 'source_type', type: 'varchar', nullable: true })
  sourceType!: string | null

  /** 内置资产（1=user_id NULL 全局共享，禁删禁改；0=用户自有） */
  @Column({ name: 'is_builtin', type: 'integer', default: 0, nullable: true })
  isBuiltin!: number | null

  /** 来源引用（工作流运行 id / 应用 id） */
  @Column({ name: 'source_ref', type: 'varchar', nullable: true })
  sourceRef!: string | null

  /** 资产组 ID（套图/组图：一次流程多图归为一组，asset_groups.id） */
  @Column({ name: 'group_id', type: 'varchar', nullable: true })
  groupId!: string | null

  /** 组内角色（cover=封面图 | member=组内成员；非组资产为 null） */
  @Column({ name: 'group_role', type: 'varchar', nullable: true })
  groupRole!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
