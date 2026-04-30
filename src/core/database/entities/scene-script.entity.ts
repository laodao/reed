import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 场景剧本 Entity
 * Quirk: 时间字段为 epoch ms。
 */
@Entity({ name: 'scene_scripts' })
@Index('idx_scene_scripts_episode_script_id', ['episodeScriptId'])
@Index('idx_scene_scripts_scene_number', ['episodeScriptId', 'sceneNumber'])
export class SceneScriptEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'episode_script_id', type: 'varchar' })
  episodeScriptId!: string

  @Column({ name: 'scene_number', type: 'integer' })
  sceneNumber!: number

  @Column({ name: 'location', type: 'text' })
  location!: string

  @Column({ name: 'location_type', type: 'varchar', default: 'exterior' })
  locationType!: string

  @Column({ name: 'time_of_day', type: 'varchar', default: 'morning' })
  timeOfDay!: string

  @Column({ name: 'weather', type: 'text', nullable: true })
  weather!: string | null

  @Column({ name: 'scene_description', type: 'text' })
  sceneDescription!: string

  @Column({ name: 'mood', type: 'text', nullable: true })
  mood!: string | null

  @Column({ name: 'lighting', type: 'text', nullable: true })
  lighting!: string | null

  @Column({ name: 'characters', type: 'simple-json', nullable: true })
  characters!: unknown[] | null

  @Column({ name: 'original_text', type: 'text', nullable: true })
  originalText!: string | null

  @Column({ name: 'narration', type: 'text', nullable: true })
  narration!: string | null

  @Column({ name: 'dialogues', type: 'simple-json', nullable: true })
  dialogues!: unknown[] | null

  @Column({ name: 'actions', type: 'simple-json', nullable: true })
  actions!: unknown[] | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
