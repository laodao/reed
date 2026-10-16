import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 设定集分类定义 Entity（故事圣经动态分组，P0-2026-09-09）
 * 每行一个设定分类：驱动研讨室设定集分组、＋新增下拉、整理器提炼 prompt、
 * 以及存储路由（storage='entity' 映射既有 lw_* 表 / 'custom' 落 lw_custom_entities）。
 * 不用字典：字典是标签配置，承载不了字段模板 schema 与路由行为（设计文档 bible-p0-p3 §P0.1）。
 */
@Entity({ name: 'lw_bible_kinds' })
@Index('idx_lw_bible_kinds_key', ['key'])
export class LwBibleKindEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 稳定标识（'character' | 'nation' | ...）——研讨室/整理器/存储路由共用 */
  @Column({ name: 'key', type: 'varchar' })
  key!: string

  @Column({ name: 'label', type: 'varchar' })
  label!: string

  @Column({ name: 'icon', type: 'varchar', nullable: true })
  icon!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 100 })
  sortOrder!: number

  /** 'entity'（映射既有 lw_* 表，entity_repo 给 db 键名）| 'custom'（落 lw_custom_entities） */
  @Column({ name: 'storage', type: 'varchar', default: 'custom' })
  storage!: string

  /** storage='entity' 时的 db manager 仓储键名（lwCharacters/...） */
  @Column({ name: 'entity_repo', type: 'varchar', nullable: true })
  entityRepo!: string | null

  /** JSON: [{key,label,type:'text|textarea|number|select|tags',options?,required?}] */
  @Column({ name: 'fields_schema', type: 'text', nullable: true })
  fieldsSchema!: string | null

  /** 整理器提炼该分类的引导（输出 JSON 字段说明） */
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
