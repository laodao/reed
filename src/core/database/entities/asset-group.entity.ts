import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 资产组 Entity（套图/组图）
 *
 * 一次流程（工作流/应用）生成多张图时，可归为一组（如电商套图：主图+场景图+白底图...）。
 * assets.group_id 指向本表；组内第一张图作 cover（assets.group_role='cover'）。
 * 资产中心组卡片：封面图 + 组名 + 成员数，点击展开画廊。
 *
 * 列名/类型与迁移 create-assets-tables 严格一致。
 */
@Entity({ name: 'asset_groups' })
@Index('idx_asset_groups_user', ['userId'])
@Index('idx_asset_groups_source', ['sourceType', 'sourceRef'])
export class AssetGroupEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 组名（如「电商套图-主图+场景图」） */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 大类（图片组=image；理论支持任意类） */
  @Column({ name: 'category', type: 'varchar', nullable: true })
  category!: string | null

  /** 子分类（与成员资产一致，资产中心二级分组） */
  @Column({ name: 'sub_category', type: 'varchar', nullable: true })
  subCategory!: string | null

  /** 组描述（如套图清单摘要） */
  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  /** 封面资产 ID（组内第一张图） */
  @Column({ name: 'cover_asset_id', type: 'varchar', nullable: true })
  coverAssetId!: string | null

  /** 来源类型（workflow|app|manual） */
  @Column({ name: 'source_type', type: 'varchar', nullable: true })
  sourceType!: string | null

  /** 来源引用（工作流运行 id） */
  @Column({ name: 'source_ref', type: 'varchar', nullable: true })
  sourceRef!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
