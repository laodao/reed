import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

@Entity({ name: 'lw_plot_locations' })
@Index('idx_lw_plot_locations_plot', ['plotId'])
@Index('idx_lw_plot_locations_location', ['locationId'])
@Unique('uq_lw_plot_locations', ['plotId', 'locationId'])
export class LwPlotLocationEntity {
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
