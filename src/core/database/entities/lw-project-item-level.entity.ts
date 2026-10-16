import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

@Entity({ name: 'lw_project_item_levels' })
@Index('idx_lw_project_item_levels_project', ['projectId'])
@Index('idx_lw_project_item_levels_type', ['itemTypeCode'])
@Unique('uq_lw_project_item_levels', ['projectId', 'itemTypeCode', 'code'])
export class LwProjectItemLevelEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'item_type_code', type: 'varchar' })
  itemTypeCode!: string

  @Column({ name: 'code', type: 'varchar' })
  code!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 0, nullable: true })
  sortOrder!: number

  @Column({
    name: 'created_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  createdAt!: number

  @Column({
    name: 'updated_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  updatedAt!: number
}
