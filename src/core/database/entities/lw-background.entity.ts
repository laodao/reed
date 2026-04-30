import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * LW 时代背景 Entity。
 */
@Entity({ name: 'lw_story_backgrounds' })
export class LwBackgroundEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'era_type', type: 'text', nullable: true })
  eraType!: string | null

  @Column({ name: 'era_description', type: 'text', nullable: true })
  eraDescription!: string | null

  @Column({ name: 'social_structure', type: 'text', nullable: true })
  socialStructure!: string | null

  @Column({ name: 'tech_level', type: 'text', nullable: true })
  techLevel!: string | null

  @Column({ name: 'special_rules', type: 'text', nullable: true })
  specialRules!: string | null

  @Column({ name: 'faction_distribution', type: 'text', nullable: true })
  factionDistribution!: string | null

  @Column({ name: 'geographic_orientation', type: 'text', nullable: true })
  geographicOrientation!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
