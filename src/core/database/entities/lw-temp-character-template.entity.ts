import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 临时角色模板 Entity
 *
 * 全局共享资源（不按 user_id 隔离）：
 * 这些是系统预设的内置类型字典（路人 / 店家 / 士兵 / 儿童 …），所有用户共用一份。
 * 因此 entity **不声明** userId 字段：BaseRepository 检测无 userId 列后会
 * 自动跳过 scope 过滤；type 列保持全局 UNIQUE 即可（同一类型只允许一条）。
 *
 * 注：旧 PC 库可能残留 user_id 列（Phase 3 多租户迁移期被 ensureUserIdColumns
 * 加过列并回填 LOCAL_DEFAULT_USER_ID）。schema-drift 检查只校验
 * entity → 实库方向，多余列无害；可在未来打包阶段集中清理。
 */
@Entity({ name: 'lw_temp_character_templates' })
@Index('idx_lw_temp_char_templates_type', ['type'])
export class LwTempCharacterTemplateEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'type', type: 'varchar', unique: true })
  type!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'gender', type: 'varchar', default: 'other' })
  gender!: string

  @Column({ name: 'age_min', type: 'integer', default: 20, nullable: true })
  ageMin!: number

  @Column({ name: 'age_max', type: 'integer', default: 50, nullable: true })
  ageMax!: number

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
