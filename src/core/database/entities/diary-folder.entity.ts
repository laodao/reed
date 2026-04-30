import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 日记目录 Entity
 * 对齐 diary_folders DDL：
 *   id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT (FK self CASCADE),
 *   path TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
 *   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 *   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
 */
@Entity({ name: 'diary_folders' })
@Index('idx_diary_folders_parent', ['parentId'])
export class DiaryFolderEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'parent_id', type: 'text', nullable: true })
  parentId!: string | null

  @Column({ name: 'path', type: 'text' })
  path!: string

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
