import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 场景对话 Entity。
 */
@Entity({ name: 'scene_dialogues' })
export class SceneDialogueEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'scene_script_id', type: 'varchar' })
  sceneScriptId!: string

  @Column({ name: 'character_id', type: 'varchar' })
  characterId!: string

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
