import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/** asset_image 行的 asset_type 枚举 */
export type AssetType = 'character' | 'location' | 'item'

/** asset_image 行的 category 枚举（spec §3.8） */
export type AssetImageCategory =
  | 'main'
  | 'view'
  | 'expression'
  | 'outfit'
  | 'pose'
  | 'time_variant'
  | 'weather_variant'
  | 'angle_variant'
  | 'context'

/**
 * asset_image 表实体（spec §3.8）
 *
 * 统一图谱：character_bindings / location_bindings / item_bindings 的图片
 * 全部迁移至此表，原 image_paths JSON 字段保留（标记为 deprecated，旧读路径兼容）。
 */
@Entity({ name: 'asset_image' })
@Index('idx_asset_image_asset', ['assetType', 'assetId'])
@Index('idx_asset_image_user_id', ['userId'])
export class AssetImageEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 多租户隔离列（Web 端必填，PC 端可为 null） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  /** 资产类型：character / location / item */
  @Column({ name: 'asset_type', type: 'varchar' })
  assetType!: AssetType

  /** 对应 binding 行的 id */
  @Column({ name: 'asset_id', type: 'varchar' })
  assetId!: string

  /** 图片用途分类（spec §3.8 category 枚举） */
  @Column({ name: 'category', type: 'varchar' })
  category!: AssetImageCategory

  /** 可选标签（如 'happy' / 'morning' / 'formal'） */
  @Column({ name: 'label', type: 'text', nullable: true })
  label!: string | null

  /** 生图正向提示词 */
  @Column({ name: 'prompt', type: 'text', nullable: true })
  prompt!: string | null

  /** 生图反向提示词 */
  @Column({ name: 'negative_prompt', type: 'text', nullable: true })
  negativePrompt!: string | null

  /** 图片文件路径 */
  @Column({ name: 'image_path', type: 'text' })
  imagePath!: string

  /** 缩略图路径（可选） */
  @Column({ name: 'thumbnail_path', type: 'text', nullable: true })
  thumbnailPath!: string | null

  /**
   * 是否为该资产的主图（0/1，SQLite 兼容布尔）
   * category='main' 时应为 1，其余为 0
   */
  @Column({ name: 'is_main', type: 'integer', default: 0 })
  isMain!: number

  /** 衍生自哪张图（局部重绘等场景使用） */
  @Column({ name: 'derived_from_image_id', type: 'varchar', nullable: true })
  derivedFromImageId!: string | null

  /** 同一 asset_id 下的排列顺序 */
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
