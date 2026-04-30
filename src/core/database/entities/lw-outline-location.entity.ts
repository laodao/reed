import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

@Entity({ name: 'lw_outline_locations' })
@Index('idx_lw_outline_locations_outline', ['outlineId'])
@Index('idx_lw_outline_locations_location', ['locationId'])
@Unique('uq_lw_outline_locations', ['outlineId', 'locationId'])
export class LwOutlineLocationEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'outline_id', type: 'varchar' })
  outlineId!: string

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
