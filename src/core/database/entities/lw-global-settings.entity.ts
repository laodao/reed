import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * LW 全局配置 Entity（单行多 JSON 列存储）。
 */
@Entity({ name: 'lw_global_settings' })
export class LwGlobalSettingsEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'story_types', type: 'simple-json', nullable: true })
  storyTypes!: unknown[] | null

  @Column({ name: 'styles', type: 'simple-json', nullable: true })
  styles!: unknown[] | null

  @Column({ name: 'target_readers', type: 'simple-json', nullable: true })
  targetReaders!: unknown[] | null

  @Column({ name: 'skill_types', type: 'simple-json', nullable: true })
  skillTypes!: unknown[] | null

  @Column({ name: 'skill_levels', type: 'simple-json', nullable: true })
  skillLevels!: unknown[] | null

  @Column({ name: 'item_types', type: 'simple-json', nullable: true })
  itemTypes!: unknown[] | null

  @Column({ name: 'item_levels', type: 'simple-json', nullable: true })
  itemLevels!: unknown[] | null

  @Column({ name: 'estimated_lengths', type: 'simple-json', nullable: true })
  estimatedLengths!: unknown[] | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
