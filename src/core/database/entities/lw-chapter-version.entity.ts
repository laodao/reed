import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 章节版本 Entity（FK CASCADE 到 lw_story_chapters）。
 */
@Entity({ name: 'lw_chapter_versions' })
@Index('idx_lw_versions_chapter_id', ['chapterId'])
export class LwChapterVersionEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'chapter_id', type: 'varchar' })
  chapterId!: string

  @Column({ name: 'content', type: 'text' })
  content!: string

  @Column({ name: 'version_type', type: 'text', nullable: true })
  versionType!: string | null

  @Column({ name: 'word_count', type: 'integer', nullable: true })
  wordCount!: number | null

  @Column({ name: 'is_locked', type: 'integer', default: 0 })
  isLocked!: number

  @Column({ name: 'version_number', type: 'integer', nullable: true })
  versionNumber!: number | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date
}
