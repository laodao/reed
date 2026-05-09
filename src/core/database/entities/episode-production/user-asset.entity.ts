/**
 * 用户级资产模板（spec 2026-05-09 ep-redesign §3.2 D2 · P-7）
 * @module core/database/entities/episode-production/user-asset
 *
 * 跨项目复用同一角色 / 地点 / 物品。用户在项目内点"加入我的库"→ 复制到 user_assets；
 * 新项目"从我的库引用"→ 在 target project 创建普通 binding（拷 snapshot）。
 *
 * 时间字段：epoch ms（与 character_bindings 等保持一致需用 typeorm Date 类型；本 entity
 * 选 bigint 是因为 user_assets 是后端独立表，不参与 character_bindings 的 Date 序列化约定）。
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'user_assets' })
@Index('idx_user_assets_user_type', ['userId', 'assetType'])
export class UserAssetEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 多租户隔离（BaseRepository 自动注入） */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @Column({ name: 'asset_type', type: 'varchar' })
  assetType!: 'character' | 'location' | 'item'

  @Column({ name: 'name', type: 'text' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  /**
   * 完整 effective 字段快照（含 character 的 alias/role/gender/age/race/appearance/outfit/...
   * 或 location 的 locationType/scale/moodTags/timeOfDay/weather/... 或 item 的 description/...）。
   *
   * createBindingFromLibrary 时用此 snapshot 在 target project 创建普通 binding。
   */
  @Column({ name: 'snapshot', type: 'simple-json' })
  snapshot!: Record<string, unknown>

  /**
   * 多张图绝对路径（主图 + 派生图）。
   * 加入库时拷贝到 {userData}/user-assets/{userAssetId}/ 目录；
   * 引用到新项目时再拷到 project 内的 asset_image 目录（避免软链断裂）。
   */
  @Column({ name: 'image_paths', type: 'simple-json', nullable: true })
  imagePaths!: string[] | null

  /**
   * 加入库时记录的源 binding（追踪用，不强引用）。
   * 用户在原项目改 binding 时 user_assets 不自动同步；用户主动"同步回库"时才更新。
   */
  @Column({ name: 'source_binding_id', type: 'varchar', nullable: true })
  sourceBindingId!: string | null

  @Column({ name: 'created_at', type: 'bigint' })
  createdAt!: number

  @Column({ name: 'updated_at', type: 'bigint' })
  updatedAt!: number
}
