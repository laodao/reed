import { Column, Entity, PrimaryColumn, Unique, Index} from 'typeorm'

/**
 * LW 章节预写 Entity（FK CASCADE 到 lw_story_outlines；UNIQUE outline_id）。
 * 时间字段全部 INTEGER（epoch ms）。
 */
@Entity({ name: 'lw_chapter_prewrites' })
@Unique('uq_lw_chapter_prewrites_outline', ['outlineId'])
export class LwPrewriteEntity {
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
