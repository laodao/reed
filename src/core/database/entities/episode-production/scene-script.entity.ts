import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 场景剧本 Entity
 * Quirk: 时间字段为 epoch ms。
 */
@Entity({ name: 'scene_scripts' })
@Index('idx_scene_scripts_episode_script_id', ['episodeScriptId'])
@Index('idx_scene_scripts_scene_number', ['episodeScriptId', 'sceneNumber'])
export class SceneScriptEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'episode_script_id', type: 'varchar' })
  episodeScriptId!: string

  @Column({ name: 'scene_number', type: 'integer' })
  sceneNumber!: number

  @Column({ name: 'location', type: 'text' })
  location!: string

  /**
   * 关联 location_bindings.id（强约束，spec §4.1）。剧本完整性 validator 要求非空。
   * 老剧本未迁移时为 null，UI 提示用户从下拉绑定。
   */
  @Column({ name: 'location_binding_id', type: 'varchar', nullable: true })
  locationBindingId!: string | null

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

  /**
   * 场景旁白 TTS 产物路径（SceneAudioOrchestratorService V3 生成后落库；
   * 导出时混入成片音轨。2026-09-16 review P0-CM1）。
   * user-rel 相对路径（相对 dataPath，X4 修复）；存量数据可能是绝对路径，
   * 读取侧统一走 resolveAssetPath 兼容。
   */
  @Column({ name: 'narration_audio_path', type: 'text', nullable: true })
  narrationAudioPath!: string | null

  @Column({ name: 'dialogues', type: 'simple-json', nullable: true })
  dialogues!: unknown[] | null

  @Column({ name: 'actions', type: 'simple-json', nullable: true })
  actions!: unknown[] | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
