import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

@Entity({ name: 'lw_plot_characters' })
@Index('idx_lw_plot_characters_plot', ['plotId'])
@Index('idx_lw_plot_characters_character', ['characterId'])
@Unique('uq_lw_plot_characters', ['plotId', 'characterId'])
export class LwPlotCharacterEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'plot_id', type: 'varchar' })
  plotId!: string

  @Column({ name: 'character_id', type: 'varchar' })
  characterId!: string

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
