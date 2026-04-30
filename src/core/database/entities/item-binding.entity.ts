import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * 物品绑定 Entity
 * Quirk: 时间字段为 epoch ms。
 */
@Entity({ name: 'item_bindings' })
@Index('idx_item_bindings_project_id', ['projectId'])
@Unique('uq_item_bindings_project_lw', ['projectId', 'longWritingItemId'])
export class ItemBindingEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'long_writing_item_id', type: 'varchar' })
  longWritingItemId!: string

  @Column({ name: 'item_name', type: 'varchar' })
  itemName!: string

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

  @Column({ name: 'generate_images', type: 'integer', default: 0 })
  generateImages!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
