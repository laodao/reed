import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * LW 字典分类 Entity
 */
@Entity({ name: 'lw_dictionary_category' })
export class LwDictionaryCategoryEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'code', type: 'varchar', unique: true })
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
