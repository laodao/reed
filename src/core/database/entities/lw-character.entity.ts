import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 长文写作角色 Entity
 * 对齐 lw_story_characters DDL（FK CASCADE 到 lw_projects；FK SET NULL 到 portrait_variants）。
 */
@Entity({ name: 'lw_story_characters' })
@Index('idx_lw_characters_project_id', ['projectId'])
export class LwCharacterEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'portrait_id', type: 'text', nullable: true })
  portraitId!: string | null

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'gender', type: 'text', nullable: true })
  gender!: string | null

  @Column({ name: 'age', type: 'integer', nullable: true })
  age!: number | null

  @Column({ name: 'height', type: 'integer', nullable: true })
  height!: number | null

  @Column({ name: 'weight', type: 'integer', nullable: true })
  weight!: number | null

  @Column({ name: 'race', type: 'text', nullable: true })
  race!: string | null

  @Column({ name: 'occupation', type: 'text', nullable: true })
  occupation!: string | null

  @Column({ name: 'position', type: 'text', nullable: true })
  position!: string | null

  @Column({ name: 'appearance', type: 'text', nullable: true })
  appearance!: string | null

  @Column({ name: 'background', type: 'text', nullable: true })
  background!: string | null

  @Column({ name: 'personality', type: 'text', nullable: true })
  personality!: string | null

  @Column({ name: 'abilities', type: 'text', nullable: true })
  abilities!: string | null

  @Column({ name: 'role_position', type: 'text', nullable: true })
  rolePosition!: string | null

  @Column({ name: 'importance', type: 'text', default: 'secondary' })
  importance!: string

  @Column({ name: 'template_type', type: 'text', nullable: true })
  templateType!: string | null

  @Column({ name: 'generated_image_id', type: 'text', nullable: true })
  generatedImageId!: string | null

  @Column({ name: 'major_events', type: 'text', nullable: true })
  majorEvents!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
