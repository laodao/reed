import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * 地点绑定 Entity
 * Quirk: 时间字段为 epoch ms；image_paths 默认 '[]'。
 */
@Entity({ name: 'location_bindings' })
@Index('idx_location_bindings_project_id', ['projectId'])
@Unique('uq_location_bindings_project_lw', ['projectId', 'longWritingLocationId'])
export class LocationBindingEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /**
   * 关联 lw_location.id；仅 source_type='linked_lw' 时有值，standalone 必须为 null。
   * 历史遗留：见 character-binding 同字段说明（migration: relax-binding-lw-id-nullable）。
   */
  @Column({ name: 'long_writing_location_id', type: 'varchar', nullable: true })
  longWritingLocationId!: string | null

  @Column({ name: 'location_name', type: 'varchar' })
  locationName!: string

  /**
   * @deprecated P2 已把数据搬到 asset_image 表（spec §3.8）。
   *             保留 SQL 列兼容旧消费方读取；新代码请用 asset_image。
   *             待全部消费方迁移到 asset_image 后由 P3+ 真正 DROP COLUMN。
   */
  @Column({ name: 'image_paths', type: 'simple-json', nullable: true })
  imagePaths!: string[] | null

  @Column({ name: 'thumbnail_path', type: 'text', nullable: true })
  thumbnailPath!: string | null

  @Column({ name: 'generate_config', type: 'simple-json', nullable: true })
  generateConfig!: Record<string, unknown> | null

  @Column({ name: 'base_description', type: 'text', nullable: true })
  baseDescription!: string | null

  @Column({ name: 'style_reference', type: 'text', nullable: true })
  styleReference!: string | null

  @Column({ name: 'additional_prompts', type: 'text', nullable: true })
  additionalPrompts!: string | null

  @Column({ name: 'time_of_day', type: 'text', nullable: true })
  timeOfDay!: string | null

  @Column({ name: 'weather', type: 'text', nullable: true })
  weather!: string | null

  @Column({ name: 'generate_images', type: 'integer', default: 0 })
  generateImages!: number

  // ─── source_type + override_* + standalone_*（spec §3.7，migration: ensure-asset-binding-source-type）
  @Column({ name: 'source_type', type: 'text', default: 'standalone' })
  sourceType!: 'linked_lw' | 'standalone'

  @Column({ name: 'override_name', type: 'text', nullable: true })
  overrideName!: string | null

  @Column({ name: 'override_description', type: 'text', nullable: true })
  overrideDescription!: string | null

  @Column({ name: 'standalone_name', type: 'text', nullable: true })
  standaloneName!: string | null

  @Column({ name: 'standalone_description', type: 'text', nullable: true })
  standaloneDescription!: string | null

  // ─── 3D 接入点（spec §4.5，migration: ensure-asset-binding-source-type）
  @Column({ name: 'panorama_3d_id', type: 'text', nullable: true })
  panorama3dId!: string | null

  @Column({ name: 'scene_layout_id', type: 'text', nullable: true })
  sceneLayoutId!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
