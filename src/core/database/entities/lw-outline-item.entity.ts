import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

@Entity({ name: 'lw_outline_items' })
@Index('idx_lw_outline_items_outline', ['outlineId'])
@Index('idx_lw_outline_items_item', ['itemId'])
@Unique('uq_lw_outline_items', ['outlineId', 'itemId'])
export class LwOutlineItemEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'outline_id', type: 'varchar' })
  outlineId!: string

  @Column({ name: 'item_id', type: 'varchar' })
  itemId!: string

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
}
