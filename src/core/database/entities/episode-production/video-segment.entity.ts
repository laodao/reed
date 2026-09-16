import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 视频片段 Entity（tasks/2026-09-04-ep-video-segment-redesign.md §4）。
 *
 * 视频片段（VideoSegment）是"视频片段制"下制作/生成的最小单元：
 * 同一场景内、连续若干镜头（storyboards）、总时长在预算内（默认 ≤15s，项目级可配）
 * 的一段视频。生成、重生成、状态跟踪、成本核算都以片段为单位；
 * 分镜（storyboards）仍是创作/脚本的最小单元，通过 segment_id + segment_seq 回填关联。
 */
@Entity({ name: 'ep_video_segments' })
@Index('idx_evs_episode', ['episodeId', 'seq'])
@Index('idx_evs_scene', ['sceneId'])
@Index('idx_evs_user_id', ['userId'])
export class EpVideoSegmentEntity {
  /** 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。 */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 所属剧集 ID（video_episodes.id；冗余便于查询） */
  @Column({ name: 'episode_id', type: 'varchar' })
  episodeId!: string

  /** 所属场景 ID（scene_scripts.id；片段不跨场景，拆分规则 1） */
  @Column({ name: 'scene_id', type: 'varchar' })
  sceneId!: string

  /** 剧集内片段序号（1-based） */
  @Column({ name: 'seq', type: 'integer' })
  seq!: number

  /** pending / generating / completed / error */
  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string

  /** 含镜头数（冗余展示） */
  @Column({ name: 'shot_count', type: 'integer' })
  shotCount!: number

  /** 预估总时长（镜头时长求和，秒） */
  @Column({ name: 'est_duration', type: 'real', nullable: true })
  estDuration!: number | null

  /** 生成用多镜头提示词快照 */
  @Column({ name: 'prompt', type: 'text', nullable: true })
  prompt!: string | null

  /** 产出视频路径（user-rel 相对路径） */
  @Column({ name: 'video_path', type: 'text', nullable: true })
  videoPath!: string | null

  /** text2video / image2video / keyframes2video */
  @Column({ name: 'video_mode', type: 'varchar', nullable: true })
  videoMode!: 'text2video' | 'image2video' | 'keyframes2video' | null

  /** 实际视频时长（秒） */
  @Column({ name: 'duration', type: 'real', nullable: true })
  duration!: number | null

  @Column({ name: 'provider_id', type: 'varchar', nullable: true })
  providerId!: string | null

  @Column({ name: 'model_id', type: 'varchar', nullable: true })
  modelId!: string | null

  /**
   * 视频 provider 异步任务 ID（2026-09-16 ep-hardening H5）。
   * 提交视频任务拿到 taskId 即落库；进程重启后启动恢复凭它回网关查终态。
   */
  @Column({ name: 'provider_task_id', type: 'text', nullable: true })
  providerTaskId!: string | null

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date

  @Column({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt!: Date | null
}
