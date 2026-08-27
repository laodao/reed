import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识库目录 Entity（kb_folders）
 *
 * 用途：把知识库按目录/分组组织（如 it 行业、能源行业）。
 * parent_id 预留多级目录扩展；V1 侧边栏按一级目录分组展示。
 */
@Entity({ name: 'kb_folders' })
@Index('idx_kb_folders_user', ['userId'])
@Index('idx_kb_folders_parent', ['parentId'])
export class KbFolderEntity {
  /** 所属用户 ID（多租户隔离，BaseRepository 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 父目录 id（预留多级；null = 一级目录） */
  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
