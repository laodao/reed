import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 日记双向链接 Entity
 * 对齐 diary_links DDL（FK CASCADE 到 diary_entries 双向）。
 */
@Entity({ name: 'diary_links' })
@Index('idx_diary_links_source', ['sourceEntryId'])
export class DiaryLinkEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'source_entry_id', type: 'varchar' })
  sourceEntryId!: string

  @Column({ name: 'target_entry_id', type: 'text', nullable: true })
  targetEntryId!: string | null

  @Column({ name: 'target_title', type: 'varchar' })
  targetTitle!: string

  @Column({ name: 'link_text', type: 'text', nullable: true })
  linkText!: string | null

  @Column({ name: 'anchor', type: 'text', nullable: true })
  anchor!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date
}
