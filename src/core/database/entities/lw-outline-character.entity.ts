import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

@Entity({ name: 'lw_outline_characters' })
@Index('idx_lw_outline_characters_outline', ['outlineId'])
@Index('idx_lw_outline_characters_character', ['characterId'])
@Unique('uq_lw_outline_characters', ['outlineId', 'characterId'])
export class LwOutlineCharacterEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'outline_id', type: 'varchar' })
  outlineId!: string

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
