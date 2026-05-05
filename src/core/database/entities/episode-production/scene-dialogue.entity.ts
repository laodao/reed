import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 场景对话 Entity。
 */
@Entity({ name: 'scene_dialogues' })
export class SceneDialogueEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 web-server 在请求上下文里通过 ALS 注入；
   * Electron 端单用户场景为 null。BaseRepository 会在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'scene_script_id', type: 'varchar' })
  sceneScriptId!: string

  @Column({ name: 'character_id', type: 'varchar' })
  characterId!: string

  /**
   * 关联 character_bindings.id（spec §4.1）。和 voice_id 一起决定该对话用谁说 + 用什么声音。
   * null 表示老对话未迁移。
   */
  @Column({ name: 'character_binding_id', type: 'varchar', nullable: true })
  characterBindingId!: string | null

  @Column({ name: 'character_name', type: 'varchar' })
  characterName!: string

  @Column({ name: 'text', type: 'text' })
  text!: string

  @Column({ name: 'emotion', type: 'text', nullable: true })
  emotion!: string | null

  @Column({ name: 'volume', type: 'text', default: 'normal' })
  volume!: string

  @Column({ name: 'pace', type: 'text', default: 'normal' })
  pace!: string

  @Column({ name: 'pause', type: 'integer', default: 0 })
  pause!: number

  @Column({ name: 'voice_id', type: 'text', nullable: true })
  voiceId!: string | null

  @Column({ name: 'audio_asset_id', type: 'text', nullable: true })
  audioAssetId!: string | null

  @Column({ name: 'sort_order', type: 'integer' })
  sortOrder!: number
}
