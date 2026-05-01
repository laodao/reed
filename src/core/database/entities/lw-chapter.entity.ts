import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 章节内容 Entity（FK CASCADE 到 lw_story_outlines）。
 */
@Entity({ name: 'lw_story_chapters' })
export class LwChapterEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 web-server 在请求上下文里通过 ALS 注入；
   * Electron 端单用户场景为 null。BaseRepository 会在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'outline_id', type: 'varchar' })
  outlineId!: string

  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null

  @Column({ name: 'word_count', type: 'integer', nullable: true })
  wordCount!: number | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
