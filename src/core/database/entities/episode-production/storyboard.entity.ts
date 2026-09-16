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

  /**
   * 分镜级 location 覆盖（spec 2026-05-09）：JSON 数组（binding ID 列表）。
   * 非空 → 覆盖 scene.location_binding_id 推导；空 / NULL → 走 scene-level 默认。
   * 一般填一个；列表形态保留多地点蒙太奇 / 复合空间扩展性。
   */
  @Column({ name: 'location_binding_ids', type: 'simple-json', nullable: true })
  locationBindingIds!: string[] | null

  /**
   * 分镜级 item 覆盖（spec 2026-05-09）：JSON 数组（item binding ID 列表）。
   * 非空 → 覆盖 scene.characters[*].props 推导；空 / NULL → 走 scene-level 默认。
   */
  @Column({ name: 'item_binding_ids', type: 'simple-json', nullable: true })
  itemBindingIds!: string[] | null

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

  /**
   * 是否走关键帧流程（1=true 默认；0=false）。
   * false 时跳过关键帧，VideoSegmentPanel 用 frameDescription + 资产引用直接生成视频。
   */
  @Column({ name: 'use_keyframes', type: 'integer', default: 1 })
  useKeyframes!: number

  /**
   * ⑥ 合成时是否入最终成片（1=true 默认；0=false 跳过）。
   * 一个场景可能有多个分镜（不同角度 / 备选视角），用户可在时间线勾选只合成需要的。
   */
  @Column({ name: 'include_in_final', type: 'integer', default: 1 })
  includeInFinal!: number

  /** 视频生成服务商 ID（对应 provider_config 表）*/
  @Column({ name: 'video_provider_id', type: 'varchar', nullable: true })
  videoProviderId!: string | null

  /** 视频生成模型 ID */
  @Column({ name: 'video_model_id', type: 'varchar', nullable: true })
  videoModelId!: string | null

  /**
   * 视频 provider 异步任务 ID（2026-09-16 ep-hardening H5）。
   * 提交视频任务拿到 taskId 即落库；进程重启后启动恢复凭它回网关查终态。
   */
  @Column({ name: 'provider_task_id', type: 'text', nullable: true })
  providerTaskId!: string | null

  /** 视频生成模式：text2video / image2video / keyframes2video */
  @Column({ name: 'video_mode', type: 'varchar', nullable: true })
  videoMode!: 'text2video' | 'image2video' | 'keyframes2video' | null

  // ─── 视频片段制（tasks/2026-09-04-ep-video-segment-redesign §4）──────────────

  /** 所属视频片段 ID（ep_video_segments.id；未分段时 NULL） */
  @Column({ name: 'segment_id', type: 'varchar', nullable: true })
  segmentId!: string | null

  /** 片段内镜头序号（1-based；未分段时 NULL） */
  @Column({ name: 'segment_seq', type: 'integer', nullable: true })
  segmentSeq!: number | null

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

  /**
   * 用户在 ⑤ 制作 stage 为本分镜挑选的资产参考图（覆盖 keyframe-generation 默认评分挑图）。
   * Shape：JSON 字符串（应用层 parse / stringify）`{ [`${kind}:${bindingId}`]: imageId }`
   * 例：`{"character:ch_xxx":"img_a","location:loc_yyy":"img_b"}`
   * NULL 时按现有 reference-image-selector 的默认评分逻辑自动选图。
   */
  @Column({ name: 'reference_image_ids', type: 'text', nullable: true })
  referenceImageIds!: string | null

  /**
   * 镜头语言扩展元数据（spec 2026-05-09 ep-redesign §3.2 B5）。
   * Shape：JSON 字符串（应用层 parse / stringify）含 lensFocalMm / aperture / cameraStyle / lighting 等。
   * NULL = 老分镜或未填这些预设；keyframe-prompt-builder 解析时跳过。
   */
  @Column({ name: 'metadata', type: 'text', nullable: true })
  metadata!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
