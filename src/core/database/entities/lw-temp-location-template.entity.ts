import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 临时地点模板 Entity
 *
 * 全局共享资源（不按 user_id 隔离）：
 * 系统预设的内置场景字典（街道 / 房间 / 庙宇 …），所有用户共用一份；
 * type 列保持全局 UNIQUE。详见 lw-temp-character-template.entity.ts 文档。
 */
@Entity({ name: 'lw_temp_location_templates' })
@Index('idx_lw_temp_loc_templates_type', ['type'])
export class LwTempLocationTemplateEntity {
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
