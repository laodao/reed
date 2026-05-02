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

  @Column({ name: 'long_writing_location_id', type: 'varchar' })
  longWritingLocationId!: string

  @Column({ name: 'location_name', type: 'varchar' })
  locationName!: string

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

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
