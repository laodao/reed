import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 分镜 Entity（含 transition_* 规范化字段 + 兼容 transition JSON 字段）
 * Quirk: 时间字段为 epoch ms。
 */
@Entity({ name: 'storyboards' })
@Index('idx_storyboards_scene_script_id', ['sceneScriptId'])
@Index('idx_storyboards_status', ['status'])
export class StoryboardEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'scene_script_id', type: 'varchar' })
  sceneScriptId!: string

  @Column({ name: 'shot_number', type: 'integer' })
  shotNumber!: number

  @Column({ name: 'shot_type', type: 'varchar', default: 'medium' })
  shotType!: string

  @Column({ name: 'camera_angle', type: 'varchar', default: 'eye_level' })
  cameraAngle!: string

  @Column({ name: 'camera_movement', type: 'varchar', default: 'static' })
  cameraMovement!: string

  @Column({ name: 'movement_duration', type: 'real', nullable: true })
  movementDuration!: number | null

  @Column({ name: 'frame_description', type: 'text' })
  frameDescription!: string

  @Column({ name: 'subject', type: 'text', nullable: true })
  subject!: string | null

  @Column({ name: 'composition', type: 'text', nullable: true })
  composition!: string | null

  @Column({ name: 'characters', type: 'simple-json', nullable: true })
  characters!: unknown[] | null

  @Column({ name: 'narration_id', type: 'text', nullable: true })
  narrationId!: string | null

  @Column({ name: 'dialogue_ids', type: 'simple-json', nullable: true })
  dialogueIds!: string[] | null

  @Column({ name: 'action_ids', type: 'simple-json', nullable: true })
  actionIds!: string[] | null

  /**
   * @deprecated P2 已把数据搬到 storyboard_keyframe 表（spec §4.7）。
   *             保留 SQL 列兼容旧消费方；新代码请用 storyboard_keyframe。
   *             待全部消费方迁移到 storyboard_keyframe 后由 P3+ 真正 DROP COLUMN。
   */
  @Column({ name: 'frame_image', type: 'simple-json', nullable: true })
  frameImage!: Record<string, unknown> | null

  /** @deprecated 同 frame_image，P2 数据已搬到 storyboard_keyframe（spec §4.7）。 */
  @Column({ name: 'frame_image_id', type: 'text', nullable: true })
  frameImageId!: string | null

  @Column({ name: 'video_path', type: 'text', nullable: true })
  videoPath!: string | null

  @Column({ name: 'duration', type: 'real', default: 3 })
  duration!: number

  /** 旧 transition JSON 字段（兼容保留） */
  @Column({ name: 'transition', type: 'text' })
  transition!: string

  @Column({ name: 'transition_type', type: 'text', nullable: true })
  transitionType!: string | null

  @Column({ name: 'transition_duration_ms', type: 'real', nullable: true })
  transitionDurationMs!: number | null

  @Column({ name: 'transition_direction', type: 'text', nullable: true })
  transitionDirection!: string | null

  @Column({ name: 'transition_easing', type: 'text', nullable: true })
  transitionEasing!: string | null

  @Column({ name: 'transition_color', type: 'text', nullable: true })
  transitionColor!: string | null

  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string

  // ─── 多关键帧 + 视频生成字段（spec §4.2 / §4.7，P2 task 3）─────────────────

  /** 关键帧总数，默认 2（start + end）*/
  @Column({ name: 'keyframe_count', type: 'integer', default: 2 })
  keyframeCount!: number

  /** 视频生成服务商 ID（对应 provider_config 表）*/
  @Column({ name: 'video_provider_id', type: 'varchar', nullable: true })
  videoProviderId!: string | null

  /** 视频生成模型 ID */
  @Column({ name: 'video_model_id', type: 'varchar', nullable: true })
  videoModelId!: string | null

  /** 视频生成模式：text2video / image2video / keyframes2video */
  @Column({ name: 'video_mode', type: 'varchar', nullable: true })
  videoMode!: 'text2video' | 'image2video' | 'keyframes2video' | null

  // ─── 3D 接入点 2（spec §4.7）──────────────────────────────────────────────

  /** 是否启用 3D 分镜布局（0=否，1=是）*/
  @Column({ name: 'use_3d_staging', type: 'integer', default: 0 })
  use3dStaging!: number

  /** 3D 分镜布局模板 ID */
  @Column({ name: 'staging_layout_id', type: 'varchar', nullable: true })
  stagingLayoutId!: string | null

  /**
   * 背景 ref 图（spec §4.8）：指向 asset_image.id（category='panorama_snapshot'），
   * 用于把 360 全景截图作为分镜的背景参考。
   */
  @Column({ name: 'background_ref_image_id', type: 'varchar', nullable: true })
  backgroundRefImageId!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
