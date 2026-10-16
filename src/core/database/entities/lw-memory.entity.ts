import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 故事记忆 Entity（FK CASCADE 到 lw_projects；FK SET NULL 到 lw_story_outlines）。
 */
@Entity({ name: 'lw_story_memories' })
export class LwMemoryEntity {
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

  @Column({ name: 'source_outline_id', type: 'text', nullable: true })
  sourceOutlineId!: string | null

  @Column({ name: 'memory_type', type: 'varchar' })
  memoryType!: string

  @Column({ name: 'title', type: 'varchar' })
  title!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  /** involved_entities JSON 字符串 — 兼容字段，新代码用 lw_memory_entities 表 */
  @Column({ name: 'involved_entities', type: 'text', nullable: true })
  involvedEntities!: string | null

  @Column({ name: 'chapter_number', type: 'integer', nullable: true })
  chapterNumber!: number | null

  @Column({ name: 'importance', type: 'text', default: 'normal' })
  importance!: string

  @Column({ name: 'is_active', type: 'integer', default: 1 })
  isActive!: number

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
