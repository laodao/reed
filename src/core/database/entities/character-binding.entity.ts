import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 角色形象绑定 Entity
 * 含 ALTER 后规范化字段：voice_id / voice_speed / voice_pitch / base_description / style_reference / additional_prompts
 * Quirk: 时间字段为 epoch ms。
 */
@Entity({ name: 'character_bindings' })
@Index('idx_character_bindings_project_id', ['projectId'])
export class CharacterBindingEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'long_writing_character_id', type: 'varchar' })
  longWritingCharacterId!: string

  @Column({ name: 'portrait_id', type: 'text', nullable: true })
  portraitId!: string | null

  @Column({ name: 'generate_config', type: 'simple-json', nullable: true })
  generateConfig!: Record<string, unknown> | null

  @Column({ name: 'voice_config', type: 'simple-json' })
  voiceConfig!: Record<string, unknown>

  // 规范化字段（ALTER 后加）
  @Column({ name: 'voice_id', type: 'text', nullable: true })
  voiceId!: string | null

  @Column({ name: 'voice_speed', type: 'real', default: 1.0, nullable: true })
  voiceSpeed!: number | null

  @Column({ name: 'voice_pitch', type: 'real', default: 1.0, nullable: true })
  voicePitch!: number | null

  @Column({ name: 'base_description', type: 'text', nullable: true })
  baseDescription!: string | null

  @Column({ name: 'style_reference', type: 'text', nullable: true })
  styleReference!: string | null

  @Column({ name: 'additional_prompts', type: 'text', nullable: true })
  additionalPrompts!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
