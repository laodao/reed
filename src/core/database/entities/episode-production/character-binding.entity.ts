import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 角色形象绑定 Entity
 * 含 ALTER 后规范化字段：voice_id / voice_speed / voice_pitch / base_description / style_reference / additional_prompts
 * Quirk: 时间字段为 epoch ms。
 */
@Entity({ name: 'character_bindings' })
@Index('idx_character_bindings_project_id', ['projectId'])
export class CharacterBindingEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /**
   * 关联 lw_character.id；仅 source_type='linked_lw' 时有值，standalone 必须为 null。
   * 历史遗留：早期 standalone 用 '' 占位，已被 migration relax-binding-lw-id-nullable
   * 改为 nullable + 回填 NULL。
   */
  @Column({ name: 'long_writing_character_id', type: 'varchar', nullable: true })
  longWritingCharacterId!: string | null

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

  // ─── source_type + override_* + standalone_*（spec §3.7，migration: ensure-asset-binding-source-type）
  @Column({ name: 'source_type', type: 'text', default: 'standalone' })
  sourceType!: 'linked_lw' | 'standalone'

  @Column({ name: 'override_name', type: 'text', nullable: true })
  overrideName!: string | null

  @Column({ name: 'override_description', type: 'text', nullable: true })
  overrideDescription!: string | null

  @Column({ name: 'override_appearance', type: 'text', nullable: true })
  overrideAppearance!: string | null

  @Column({ name: 'override_outfit', type: 'text', nullable: true })
  overrideOutfit!: string | null

  @Column({ name: 'standalone_name', type: 'text', nullable: true })
  standaloneName!: string | null

  @Column({ name: 'standalone_description', type: 'text', nullable: true })
  standaloneDescription!: string | null

  // ─── FU5-C2 身份块 + 声音情感 + 风格锚点 + 备选服装（spec §3.1·§3.4·§3.6）
  /** 别名 — 自由文本（如"三爷 / 浪剑客"） */
  @Column({ name: 'alias', type: 'text', nullable: true })
  alias!: string | null

  /** 定位（主角 / 配角 / 反派 / 旁白） */
  @Column({ name: 'role', type: 'text', nullable: true })
  role!: string | null

  /** 性别（男 / 女 / 其他 / 未指定） */
  @Column({ name: 'gender', type: 'text', nullable: true })
  gender!: string | null

  /** 年龄 */
  @Column({ name: 'age', type: 'integer', nullable: true })
  age!: number | null

  /** 默认情感（neutral / angry / happy / sad / surprised / confused） */
  @Column({ name: 'voice_emotion', type: 'text', nullable: true })
  voiceEmotion!: string | null

  /** 风格锚点（JSON 数组字符串："[\"工笔国风\",\"水墨\"]"） */
  @Column({ name: 'style_anchors', type: 'text', nullable: true })
  styleAnchors!: string | null

  /** 备选服装列表（JSON 数组字符串） */
  @Column({ name: 'outfits_extra', type: 'text', nullable: true })
  outfitsExtra!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
