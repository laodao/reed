import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 地点 Entity。
 */
@Entity({ name: 'lw_story_locations' })
@Index('idx_lw_locations_project_id', ['projectId'])
export class LwLocationEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'type', type: 'text', nullable: true })
  type!: string | null

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'importance', type: 'text', nullable: true })
  importance!: string | null

  @Column({ name: 'map_id', type: 'text', nullable: true })
  mapId!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
