import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 剧集 Entity
 * 对齐 video_episodes 表 + ALTER TABLE 后的扩展列：
 *   source_type / uploaded_content / uploaded_characters / deleted_at
 *
 * Quirk：created_at/updated_at/deleted_at 是 epoch ms 数字。
 */
@Entity({ name: 'video_episodes' })
@Index('idx_video_episodes_project_id', ['projectId'])
@Index('idx_video_episodes_outline_id', ['outlineId'])
@Index('idx_video_episodes_status', ['status'])
export class VideoEpisodeEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'source_type', type: 'varchar', default: 'outline' })
  sourceType!: string

  @Column({ name: 'outline_id', type: 'text', nullable: true })
  outlineId!: string | null

  @Column({ name: 'uploaded_content', type: 'text', nullable: true })
  uploadedContent!: string | null

  @Column({ name: 'uploaded_characters', type: 'simple-json', nullable: true })
  uploadedCharacters!: unknown[] | null

  @Column({ name: 'episode_number', type: 'integer' })
  episodeNumber!: number

  @Column({ name: 'title', type: 'varchar' })
  title!: string

  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string

  @Column({ name: 'duration', type: 'integer', default: 0 })
  duration!: number

  @Column({ name: 'script_id', type: 'text', nullable: true })
  scriptId!: string | null

  @Column({ name: 'audio_tracks', type: 'simple-json', nullable: true })
  audioTracks!: unknown[] | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date

  @Column({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt!: Date | null
}
