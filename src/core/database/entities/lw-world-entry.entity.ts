import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 世界观条目（设定资产库 P0-2026-09-24）
 * 一切维度（境界/门派/地域/丹药/法宝/规则……）共用的数据落点，kind 驱动字段模板；
 * pinned=1 的体系/规则条目写作时活引用直注入 prompt（不落项目表、无故事内状态）。
 */
@Entity({ name: 'lw_world_entries' })
@Index('idx_lw_world_entries_world_kind', ['worldId', 'kindKey'])
@Index('idx_lw_world_entries_world_pinned', ['worldId', 'pinned'])
export class LwWorldEntryEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'world_id', type: 'varchar' })
  worldId!: string

  /** → lw_world_kinds.key */
  @Column({ name: 'kind_key', type: 'varchar' })
  kindKey!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** JSON: string[] 别名/称呼 */
  @Column({ name: 'aliases', type: 'text', nullable: true })
  aliases!: string | null

  /** 一句话摘要（进 prompt 的紧凑形态） */
  @Column({ name: 'summary', type: 'text', nullable: true })
  summary!: string | null

  /** JSON（按所属 kind 的 fields_schema） */
  @Column({ name: 'fields', type: 'text', nullable: true })
  fields!: string | null

  /** 父条目 id（层级：地域>国别>驻地；体系>条目） */
  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number

  /** 榜单化排序（异火榜式），NULL=无序 */
  @Column({ name: 'rank_value', type: 'integer', nullable: true })
  rankValue!: number | null

  /** 常驻注入（体系/规则类置 1） */
  @Column({ name: 'pinned', type: 'integer', default: 0 })
  pinned!: number

  /** JSON: {type:'manual'|'ai'|'promoted', projectId?, conversationId?} */
  @Column({ name: 'origin', type: 'text', nullable: true })
  origin!: string | null

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
