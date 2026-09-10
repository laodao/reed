import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 自定义设定实体 Entity（storage='custom' 的分类数据落点，P0-2026-09-09）
 * fields 按 lw_bible_kinds.fields_schema 组织；origin 记录"这条设定从哪来"（溯源一等公民）。
 */
@Entity({ name: 'lw_custom_entities' })
@Index('idx_lw_custom_entities_project', ['projectId'])
@Index('idx_lw_custom_entities_project_kind', ['projectId', 'kindKey'])
export class LwCustomEntityEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** → lw_bible_kinds.key */
  @Column({ name: 'kind_key', type: 'varchar' })
  kindKey!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** JSON（按 fields_schema） */
  @Column({ name: 'fields', type: 'text', nullable: true })
  fields!: string | null

  /** 父实体 id（层级归属：世界→大陆→国家→城市，P2） */
  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId!: string | null

  /** JSON: {type:'discussion'|'manual'|'extract', cardId?, turns?} */
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
