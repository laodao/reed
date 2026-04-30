import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 分镜 Entity（含 transition_* 规范化字段 + 兼容 transition JSON 字段）
 * Quirk: 时间字段为 epoch ms。
 */
@Entity({ name: 'storyboards' })
@Index('idx_storyboards_scene_script_id', ['sceneScriptId'])
@Index('idx_storyboards_status', ['status'])
export class StoryboardEntity {
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

  @Column({ name: 'frame_image', type: 'simple-json', nullable: true })
  frameImage!: Record<string, unknown> | null

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

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
