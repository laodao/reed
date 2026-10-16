import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * LW 章节状态摘要 Entity
 */
@Entity({ name: 'lw_chapter_state_summaries' })
@Index('idx_lw_chapter_summaries_project', ['projectId'])
@Index('idx_lw_chapter_summaries_chapter', ['projectId', 'chapterNumber'])
@Unique('uq_lw_chapter_summaries_outline', ['projectId', 'outlineId'])
export class LwChapterStateSummaryEntity {
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

  @Column({ name: 'outline_id', type: 'varchar' })
  outlineId!: string

  @Column({ name: 'chapter_number', type: 'integer' })
  chapterNumber!: number

  @Column({ name: 'story_time', type: 'text' })
  storyTime!: string

  @Column({ name: 'current_location', type: 'text', nullable: true })
  currentLocation!: string | null

  @Column({ name: 'character_states', type: 'text', nullable: true })
  characterStates!: string | null

  @Column({ name: 'pending_events', type: 'text', nullable: true })
  pendingEvents!: string | null

  @Column({ name: 'key_changes', type: 'text', nullable: true })
  keyChanges!: string | null

  @Column({
    name: 'created_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  createdAt!: number

  @Column({
    name: 'updated_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  updatedAt!: number
}
