import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 角色 IP 库（设定资产库 P0-2026-09-24）
 * 四层人设卡结构（对标 LitMemo/AI 角色卡惯例）：
 * 辨识资讯 → 内在驱动（欲望/软肋） → 能力与世界观定位 → 成长弧光。
 * 强列只放全题材通用字段；题材字段（灵根/序列/血脉）进 fields JSON，
 * schema 由所挂世界（world_id）的 character kind fields_schema 驱动——避免加题材就改表。
 */
@Entity({ name: 'lw_ip_characters' })
@Index('idx_lw_ip_characters_world', ['worldId'])
export class LwIpCharacterEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** JSON: string[] 别名/称呼 */
  @Column({ name: 'aliases', type: 'text', nullable: true })
  aliases!: string | null

  /** 可空：不归属任何世界的通用 IP */
  @Column({ name: 'world_id', type: 'varchar', nullable: true })
  worldId!: string | null

  // ---- 第一层：辨识资讯 ----
  @Column({ name: 'gender', type: 'varchar', nullable: true })
  gender!: string | null

  @Column({ name: 'age', type: 'varchar', nullable: true })
  age!: string | null

  @Column({ name: 'race', type: 'varchar', nullable: true })
  race!: string | null

  @Column({ name: 'occupation', type: 'varchar', nullable: true })
  occupation!: string | null

  @Column({ name: 'appearance', type: 'text', nullable: true })
  appearance!: string | null

  /** 人像设计模块 portrait id（先例：lw_story_characters.portraitId + linkPortrait） */
  @Column({ name: 'portrait_id', type: 'varchar', nullable: true })
  portraitId!: string | null

  // ---- 第二层：内在驱动 ----
  @Column({ name: 'personality', type: 'text', nullable: true })
  personality!: string | null

  /** 核心欲望（人设卡第二层：他最想要什么） */
  @Column({ name: 'motivation', type: 'text', nullable: true })
  motivation!: string | null

  /** 软肋/缺陷（欲望的反差面） */
  @Column({ name: 'flaw', type: 'text', nullable: true })
  flaw!: string | null

  @Column({ name: 'background', type: 'text', nullable: true })
  background!: string | null

  @Column({ name: 'values_notes', type: 'text', nullable: true })
  valuesNotes!: string | null

  // ---- 第三层：能力与世界观定位 ----
  /** 天赋（灵根/体质/血脉等；值须在该世界资质体系合法值内） */
  @Column({ name: 'talents', type: 'text', nullable: true })
  talents!: string | null

  /** 技能/功法描述 */
  @Column({ name: 'abilities', type: 'text', nullable: true })
  abilities!: string | null

  @Column({ name: 'signature_items', type: 'text', nullable: true })
  signatureItems!: string | null

  // ---- 第四层：弧光 ----
  /** 成长弧光（信念如何不可逆转变） */
  @Column({ name: 'character_arc', type: 'text', nullable: true })
  characterArc!: string | null

  /** JSON: string[] 口头禅/语言习惯 */
  @Column({ name: 'catchphrases', type: 'text', nullable: true })
  catchphrases!: string | null

  /** JSON：题材扩展字段（fields_schema 驱动） */
  @Column({ name: 'fields', type: 'text', nullable: true })
  fields!: string | null

  /** JSON: string[] */
  @Column({ name: 'tags', type: 'text', nullable: true })
  tags!: string | null

  /** 'active' | 'archived' */
  @Column({ name: 'status', type: 'varchar', default: 'active' })
  status!: string

  /** JSON: {type:'manual'|'ai'|'promoted', projectId?, conversationId?} */
  @Column({ name: 'origin', type: 'text', nullable: true })
  origin!: string | null

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
