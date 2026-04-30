import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

@Entity({ name: 'lw_project_skill_levels' })
@Index('idx_lw_project_skill_levels_project', ['projectId'])
@Index('idx_lw_project_skill_levels_type', ['skillTypeCode'])
@Unique('uq_lw_project_skill_levels', ['projectId', 'skillTypeCode', 'code'])
export class LwProjectSkillLevelEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'skill_type_code', type: 'varchar' })
  skillTypeCode!: string

  @Column({ name: 'code', type: 'varchar' })
  code!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 0, nullable: true })
  sortOrder!: number

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

  @Column({
    name: 'updated_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  updatedAt!: number
}
