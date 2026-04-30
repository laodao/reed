import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * LW 章节内容 Entity（FK CASCADE 到 lw_story_outlines）。
 */
@Entity({ name: 'lw_story_chapters' })
export class LwChapterEntity {
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
