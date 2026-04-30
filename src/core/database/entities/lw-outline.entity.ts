import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 大纲 Entity（FK CASCADE 自引用 parent_id）。
 */
@Entity({ name: 'lw_story_outlines' })
@Index('idx_lw_outlines_project_id', ['projectId'])
@Index('idx_lw_outlines_parent_id', ['parentId'])
export class LwOutlineEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'parent_id', type: 'text', nullable: true })
  parentId!: string | null

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'level', type: 'integer', default: 1 })
  level!: number

  @Column({ name: 'node_type', type: 'text', nullable: true })
  nodeType!: string | null

  @Column({ name: 'summary', type: 'text', nullable: true })
  summary!: string | null

  @Column({ name: 'involved_characters', type: 'simple-json', nullable: true })
  involvedCharacters!: string[] | null

  @Column({ name: 'involved_locations', type: 'simple-json', nullable: true })
  involvedLocations!: string[] | null

  @Column({ name: 'involved_items', type: 'simple-json', nullable: true })
  involvedItems!: string[] | null

  @Column({ name: 'status', type: 'text', default: 'pending' })
  status!: string

  @Column({ name: 'estimated_words', type: 'integer', nullable: true })
  estimatedWords!: number | null

  @Column({ name: 'order_index', type: 'integer', nullable: true })
  orderIndex!: number | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
