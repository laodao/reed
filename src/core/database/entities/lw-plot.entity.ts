import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 故事情节 Entity。
 */
@Entity({ name: 'lw_story_plots' })
@Index('idx_lw_plots_project_id', ['projectId'])
export class LwPlotEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'title', type: 'varchar' })
  title!: string

  @Column({ name: 'summary', type: 'text' })
  summary!: string

  @Column({ name: 'plot_order', type: 'integer', default: 0 })
  plotOrder!: number

  @Column({ name: 'involved_characters', type: 'simple-json', nullable: true })
  involvedCharacters!: string[] | null

  @Column({ name: 'involved_locations', type: 'simple-json', nullable: true })
  involvedLocations!: string[] | null

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
