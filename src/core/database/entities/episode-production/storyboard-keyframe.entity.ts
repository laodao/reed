import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 分镜关键帧 Entity（spec §4.2 / §4.7）。
 *
 * 一个 Storyboard 可有多个关键帧：
 * - frame_index=0 / frame_role='start'：起始帧（从 storyboard.frame_image_id 搬运而来）
 * - frame_role='middle'：中间帧
 * - frame_role='end'：结束帧（image2video / keyframes2video 模式需要）
 * - frame_role='extra'：额外参考帧
 */
@Entity({ name: 'storyboard_keyframe' })
@Index('idx_keyframe_storyboard', ['storyboardId'])
@Index('idx_keyframe_user_id', ['userId'])
export class StoryboardKeyframeEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。 */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  /** 所属分镜 ID */
  @Column({ name: 'storyboard_id', type: 'varchar' })
  storyboardId!: string

  /** 帧序号（0-based，决定时序排列）*/
  @Column({ name: 'frame_index', type: 'integer' })
  frameIndex!: number

  /** 在分镜时长内的相对时间位置（0~1）*/
  @Column({ name: 'time_percent', type: 'real', default: 0 })
  timePercent!: number

  /** 帧角色：start / middle / end / extra */
  @Column({ name: 'frame_role', type: 'varchar' })
  frameRole!: 'start' | 'middle' | 'end' | 'extra'

  /** 关联的图像资产 ID（指向 asset_image / image_assets）*/
  @Column({ name: 'image_asset_id', type: 'varchar', nullable: true })
  imageAssetId!: string | null

  /** 派生来源关键帧 ID（用于追踪图像再生成链路）*/
  @Column({ name: 'derived_from_keyframe_id', type: 'varchar', nullable: true })
  derivedFromKeyframeId!: string | null

  /** 正向提示词 */
  @Column({ name: 'prompt', type: 'text', nullable: true })
  prompt!: string | null

  /** 负向提示词 */
  @Column({ name: 'negative_prompt', type: 'text', nullable: true })
  negativePrompt!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
