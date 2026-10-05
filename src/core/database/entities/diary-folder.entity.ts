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
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

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

  /**
   * 日记消化 opt-in（spec 2026-09-24 P2 红线：默认关闭）。
   * 开启后目录内条目自动同步到「日记」知识库并进消化管线（human 论断 → 提议箱）。
   */
  @Column({ name: 'brain_opt_in', type: 'boolean', default: false })
  brainOptIn!: boolean

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
