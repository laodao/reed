import { Column, Entity, PrimaryColumn, Unique } from 'typeorm'

/**
 * LW 章节预写 Entity（FK CASCADE 到 lw_story_outlines；UNIQUE outline_id）。
 * 时间字段全部 INTEGER（epoch ms）。
 */
@Entity({ name: 'lw_chapter_prewrites' })
@Unique('uq_lw_chapter_prewrites_outline', ['outlineId'])
export class LwPrewriteEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'outline_id', type: 'varchar' })
  outlineId!: string

  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null

  @Column({ name: 'is_confirmed', type: 'integer', default: 0 })
  isConfirmed!: number

  @Column({
    name: 'confirmed_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? null : Number(v)),
    },
  })
  confirmedAt!: number | null

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
