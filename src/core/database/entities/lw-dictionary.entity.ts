import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * LW 字典 Entity
 */
@Entity({ name: 'lw_dictionary' })
@Index('idx_lw_dictionary_category', ['categoryCode'])
@Unique('uq_lw_dictionary_cat_code', ['categoryCode', 'code'])
export class LwDictionaryEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'category_code', type: 'varchar' })
  categoryCode!: string

  @Column({ name: 'code', type: 'varchar' })
  code!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

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
