import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 资产分类定义 Entity
 *
 * 业务每增加一类（每日早报/行业周报/视频文案…）就新增一条分类定义，
 * 定义允许的存储形态、是否可预览、预览模式与预览渲染模板；
 * 资产中心按 sub_category 命中分类定义后，按 previewMode 呈现预览。
 *
 * 多租户：分类定义为全局配置（无 user_id，不区分用户；与新闻来源库同构）。
 * 列名/类型与迁移 create-asset-categories 严格一致（checkSchemaDrift 校验）。
 */
@Entity({ name: 'asset_categories' })
@Index('idx_asset_categories_sort', ['sortOrder'])
export class AssetCategoryEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 分类名（唯一；与资产 sub_category 匹配） */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 业务编码（可选，如 morning_report） */
  @Column({ name: 'code', type: 'varchar', nullable: true })
  code!: string | null

  /** 允许的存储形态（JSON 数组字符串；空=不限） */
  @Column({ name: 'allowed_kinds', type: 'text', nullable: true })
  allowedKinds!: string | null

  /** 允许的大类（JSON 数组字符串；空=不限） */
  @Column({ name: 'allowed_categories', type: 'text', nullable: true })
  allowedCategories!: string | null

  /** 是否可预览（1=可，0=不可） */
  @Column({ name: 'previewable', type: 'integer', default: 1, nullable: true })
  previewable!: number | null

  /** 预览模式（ASSET_PREVIEW_MODES） */
  @Column({ name: 'preview_mode', type: 'varchar', default: 'auto', nullable: true })
  previewMode!: string | null

  /** 预览渲染模板 ID（previewMode=report 时必填；DOCUMENT_TEMPLATES key） */
  @Column({ name: 'preview_template_id', type: 'varchar', nullable: true })
  previewTemplateId!: string | null

  /** 排序（资产中心 tab 顺序） */
  @Column({ name: 'sort_order', type: 'integer', default: 0, nullable: true })
  sortOrder!: number | null

  /** 内置分类（1=禁删禁改；允许复制为自有） */
  @Column({ name: 'is_builtin', type: 'integer', default: 0, nullable: true })
  isBuiltin!: number | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
