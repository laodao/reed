import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 日记条目 Entity
 * 对齐 diary_entries DDL（FK CASCADE 到 diary_folders）。
 */
@Entity({ name: 'diary_entries' })
@Index('idx_diary_entries_folder', ['folderId'])
@Index('idx_diary_entries_created', ['createdAt'])
export class DiaryEntryEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'folder_id', type: 'varchar' })
  folderId!: string

  @Column({ name: 'title', type: 'varchar' })
  title!: string

  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null

  @Column({ name: 'file_path', type: 'text' })
  filePath!: string

  @Column({ name: 'word_count', type: 'integer', default: 0 })
  wordCount!: number

  @Column({ name: 'tags', type: 'simple-json', nullable: true })
  tags!: string[] | null

  @Column({ name: 'frontmatter', type: 'text', nullable: true })
  frontmatter!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
