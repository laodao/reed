import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 立绘项目 Entity
 * 对齐 src/electron/database/index.ts 中现有 portrait_projects 表 DDL：
 *   id TEXT PRIMARY KEY,
 *   name TEXT NOT NULL,
 *   description TEXT,
 *   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 *   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
 *
 * Quirk：DDL 是 DATETIME，但现有 Repo 代码用 Date.now() 写入数字，
 *        且 DTO 字段类型是 number（epoch ms）。
 *        Entity 仍用 type: Date 跨方言；DTO 转换在 Repository toDto 处理。
 */
@Entity({ name: 'portrait_projects' })
@Index('idx_portrait_projects_created_at', ['createdAt'])
export class PortraitProjectEntity {
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

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'default_provider_id', type: 'text', nullable: true })
  defaultProviderId!: string | null

  @Column({ name: 'default_model_id', type: 'text', nullable: true })
  defaultModelId!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
