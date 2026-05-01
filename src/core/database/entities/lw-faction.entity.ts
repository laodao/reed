import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 势力（国家/阵营/门派）Entity。
 */
@Entity({ name: 'lw_project_factions' })
@Index('idx_lw_factions_project_id', ['projectId'])
@Index('idx_lw_factions_type', ['factionType'])
export class LwFactionEntity {
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

  @Column({ name: 'faction_type', type: 'varchar' })
  factionType!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'location_id', type: 'text', nullable: true })
  locationId!: string | null

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
