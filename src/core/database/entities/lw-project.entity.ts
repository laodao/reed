import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 长文写作项目 Entity
 * 对齐 lw_projects DDL。
 * Quirk: 时间字段为 epoch ms（DTO 字段是 number）。
 */
@Entity({ name: 'lw_projects' })
@Index('idx_lw_projects_created_at', ['createdAt'])
export class LwProjectEntity {
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

  @Column({ name: 'type', type: 'varchar' })
  type!: string

  @Column({ name: 'stage', type: 'varchar' })
  stage!: string

  @Column({ name: 'progress', type: 'integer', default: 0 })
  progress!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
