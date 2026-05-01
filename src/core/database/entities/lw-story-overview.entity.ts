import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 故事概要 Entity（含 ALTER 后扩展列）。
 */
@Entity({ name: 'lw_story_overviews' })
export class LwStoryOverviewEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 web-server 在请求上下文里通过 ALS 注入；
   * Electron 端单用户场景为 null。BaseRepository 会在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'story_type', type: 'text', nullable: true })
  storyType!: string | null

  @Column({ name: 'title', type: 'text', nullable: true })
  title!: string | null

  @Column({ name: 'summary', type: 'text', nullable: true })
  summary!: string | null

  @Column({ name: 'core_conflict', type: 'text', nullable: true })
  coreConflict!: string | null

  @Column({ name: 'theme', type: 'text', nullable: true })
  theme!: string | null

  @Column({ name: 'estimated_chapters', type: 'integer', nullable: true })
  estimatedChapters!: number | null

  @Column({ name: 'is_locked', type: 'integer', default: 0 })
  isLocked!: number

  // ALTER 后扩展列
  @Column({ name: 'core_idea', type: 'text', nullable: true })
  coreIdea!: string | null

  @Column({ name: 'style', type: 'text', nullable: true })
  style!: string | null

  @Column({ name: 'target_reader', type: 'text', nullable: true })
  targetReader!: string | null

  @Column({ name: 'estimated_length', type: 'text', nullable: true })
  estimatedLength!: string | null

  @Column({ name: 'other_requirements', type: 'text', nullable: true })
  otherRequirements!: string | null

  @Column({ name: 'key_characters', type: 'simple-json', nullable: true })
  keyCharacters!: string[] | null

  @Column({ name: 'key_locations', type: 'simple-json', nullable: true })
  keyLocations!: string[] | null

  @Column({ name: 'is_saved', type: 'integer', default: 0 })
  isSaved!: number

  @Column({ name: 'enabled_features', type: 'simple-json', nullable: true })
  enabledFeatures!: string[] | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
