import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 技能 Entity。
 */
@Entity({ name: 'lw_story_skills' })
@Index('idx_lw_skills_project_id', ['projectId'])
export class LwSkillEntity {
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

  @Column({ name: 'system', type: 'text', nullable: true })
  system!: string | null

  /** character_ids 是 JSON 字符串数组（旧 schema），保留 simple-json */
  @Column({ name: 'character_ids', type: 'simple-json', nullable: true })
  characterIds!: string[] | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
