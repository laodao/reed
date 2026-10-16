import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 兼容旧 SQLite 数据：列里可能存了空字符串、'null'、合法 JSON 中的任意一种。
 * - 空字符串 / 非法 JSON：返回 null（避免 TypeORM simple-json 直接 JSON.parse 抛错）
 * - 合法 JSON：原样返回
 * - 写入：永远 JSON.stringify
 */
const safeJsonTransformer = {
  to: (v: unknown): string | null => (v == null ? null : JSON.stringify(v)),
  from: (v: string | null): unknown => {
    if (v == null) return null
    if (typeof v !== 'string') return v
    if (v === '') return null
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  },
}

/**
 * LW 全局配置 Entity（单行多 JSON 列存储）。
 */
@Entity({ name: 'lw_global_settings' })
export class LwGlobalSettingsEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'story_types', type: 'text', nullable: true, transformer: safeJsonTransformer })
  storyTypes!: unknown[] | null

  @Column({ name: 'styles', type: 'text', nullable: true, transformer: safeJsonTransformer })
  styles!: unknown[] | null

  @Column({ name: 'target_readers', type: 'text', nullable: true, transformer: safeJsonTransformer })
  targetReaders!: unknown[] | null

  @Column({ name: 'skill_types', type: 'text', nullable: true, transformer: safeJsonTransformer })
  skillTypes!: unknown[] | null

  @Column({ name: 'skill_levels', type: 'text', nullable: true, transformer: safeJsonTransformer })
  skillLevels!: unknown[] | null

  @Column({ name: 'item_types', type: 'text', nullable: true, transformer: safeJsonTransformer })
  itemTypes!: unknown[] | null

  @Column({ name: 'item_levels', type: 'text', nullable: true, transformer: safeJsonTransformer })
  itemLevels!: unknown[] | null

  @Column({ name: 'estimated_lengths', type: 'text', nullable: true, transformer: safeJsonTransformer })
  estimatedLengths!: unknown[] | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
