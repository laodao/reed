import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 临时地点模板 Entity
 */
@Entity({ name: 'lw_temp_location_templates' })
@Index('idx_lw_temp_loc_templates_type', ['type'])
export class LwTempLocationTemplateEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'type', type: 'varchar', unique: true })
  type!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'base_prompt', type: 'text' })
  basePrompt!: string

  @Column({ name: 'style_variants', type: 'text', nullable: true })
  styleVariants!: string

  @Column({ name: 'negative_prompt', type: 'text', nullable: true })
  negativePrompt!: string

  @Column({ name: 'match_keywords', type: 'text', nullable: true })
  matchKeywords!: string

  @Column({ name: 'sort_order', type: 'integer', default: 0, nullable: true })
  sortOrder!: number

  @Column({ name: 'is_default', type: 'integer', default: 0, nullable: true })
  isDefault!: number

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
