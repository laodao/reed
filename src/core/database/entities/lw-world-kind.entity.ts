import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 世界观分类定义（设定资产库 P0-2026-09-24）
 * 机制照 lw_bible_kinds（fields_schema 驱动表单/提炼引导），但作用域升为 world 级：
 * 每个世界一套 kinds（修真世界有丹药/仙草，西幻有职业/序列），互不污染。
 */
@Entity({ name: 'lw_world_kinds' })
@Index('idx_lw_world_kinds_world', ['worldId'])
export class LwWorldKindEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'world_id', type: 'varchar' })
  worldId!: string

  /** 稳定标识（power_system|realm|sect|region|country|weapon|pill|herb|spell|art|rule|economy|...） */
  @Column({ name: 'key', type: 'varchar' })
  key!: string

  @Column({ name: 'label', type: 'varchar' })
  label!: string

  @Column({ name: 'icon', type: 'varchar', nullable: true })
  icon!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 100 })
  sortOrder!: number

  /** JSON: LibraryFieldSchemaItem[] */
  @Column({ name: 'fields_schema', type: 'text', nullable: true })
  fieldsSchema!: string | null

  @Column({ name: 'prompt_hint', type: 'text', nullable: true })
  promptHint!: string | null

  @Column({ name: 'enabled', type: 'integer', default: 1 })
  enabled!: number

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
