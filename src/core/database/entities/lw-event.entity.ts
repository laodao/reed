import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 故事事件 Entity（图谱事件节点）
 * 事件是"故事内已发生的事实"，随章节确认累积；时间线锚点为 chapter_number。
 */
@Entity({ name: 'lw_events' })
@Index('idx_lw_events_project_id', ['projectId'])
@Index('idx_lw_events_chapter', ['projectId', 'chapterNumber'])
export class LwEventEntity {
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

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'chapter_number', type: 'integer' })
  chapterNumber!: number

  @Column({ name: 'story_time', type: 'text', nullable: true })
  storyTime!: string | null

  /** involved_entities JSON 字符串（[{type,id,name}]） */
  @Column({ name: 'involved_entities', type: 'text', nullable: true })
  involvedEntities!: string | null

  @Column({ name: 'state_before', type: 'text', nullable: true })
  stateBefore!: string | null

  @Column({ name: 'state_after', type: 'text', nullable: true })
  stateAfter!: string | null

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
