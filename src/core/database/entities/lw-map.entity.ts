import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 地图 Entity。
 */
@Entity({ name: 'lw_project_maps' })
@Index('idx_lw_maps_project_id', ['projectId'])
export class LwMapEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'orientation', type: 'text', nullable: true })
  orientation!: string | null

  @Column({ name: 'characteristics', type: 'text', nullable: true })
  characteristics!: string | null

  @Column({ name: 'image_path', type: 'text', nullable: true })
  imagePath!: string | null

  @Column({ name: 'ai_generated_data', type: 'text', nullable: true })
  aiGeneratedData!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
