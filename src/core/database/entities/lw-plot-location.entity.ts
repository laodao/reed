import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

@Entity({ name: 'lw_plot_locations' })
@Index('idx_lw_plot_locations_plot', ['plotId'])
@Index('idx_lw_plot_locations_location', ['locationId'])
@Unique('uq_lw_plot_locations', ['plotId', 'locationId'])
export class LwPlotLocationEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'plot_id', type: 'varchar' })
  plotId!: string

  @Column({ name: 'location_id', type: 'varchar' })
  locationId!: string

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
