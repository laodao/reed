import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 地图 Entity。
 */
@Entity({ name: 'lw_project_maps' })
@Index('idx_lw_maps_project_id', ['projectId'])
export class LwMapEntity {
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
