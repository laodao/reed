import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 物品 Entity。
 */
@Entity({ name: 'lw_story_items' })
@Index('idx_lw_items_project_id', ['projectId'])
export class LwItemEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'type', type: 'text', nullable: true })
  type!: string | null

  @Column({ name: 'level', type: 'text', nullable: true })
  level!: string | null

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'owner_id', type: 'text', nullable: true })
  ownerId!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
