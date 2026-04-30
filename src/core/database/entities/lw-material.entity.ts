import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 故事素材 Entity
 */
@Entity({ name: 'lw_story_materials' })
@Index('idx_lw_materials_project_id', ['projectId'])
export class LwMaterialEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'type', type: 'varchar', nullable: true })
  type!: string | null

  @Column({ name: 'source', type: 'text', nullable: true })
  source!: string | null

  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null

  @Column({ name: 'status', type: 'varchar', default: 'pending', nullable: true })
  status!: string

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null

  @Column({ name: 'retry_count', type: 'integer', default: 0, nullable: true })
  retryCount!: number

  @Column({ name: 'used', type: 'integer', default: 0, nullable: true })
  used!: number

  @Column({
    name: 'created_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  createdAt!: number
}
