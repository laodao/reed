import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 长文写作项目 Entity
 * 对齐 lw_projects DDL。
 * Quirk: 时间字段为 epoch ms（DTO 字段是 number）。
 */
@Entity({ name: 'lw_projects' })
@Index('idx_lw_projects_created_at', ['createdAt'])
export class LwProjectEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'type', type: 'varchar' })
  type!: string

  @Column({ name: 'stage', type: 'varchar' })
  stage!: string

  @Column({ name: 'progress', type: 'integer', default: 0 })
  progress!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
