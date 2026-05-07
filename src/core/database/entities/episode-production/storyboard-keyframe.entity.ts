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

  /**
   * 用户提示词 override（FU5-A9-L4 / spec §4.5.7）。
   *
   * 用户在 ⑤ 关键帧 panel 输入的"调整方向"（如 "角色更愤怒" / "镜头拉近"）。
   * builder 拼到 final_prompt 末尾"[user direction]"段。
   * 持久化保存以便重生成时不丢失（每次都重输入很糟糕）。
   */
  @Column({ name: 'user_prompt_override', type: 'text', nullable: true })
  userPromptOverride!: string | null

  /**
   * 用户为本帧手动指定的参考图覆盖列表（阶段 2 · 精细控制）：
   * 存为 JSON 字符串 `[{ kind, bindingId, imageId }]`。
   * 生成时优先用 override；override 没指定的资产仍走 pickReferenceImage 自动评分。
   */
  @Column({ name: 'reference_overrides', type: 'text', nullable: true })
  referenceOverrides!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
