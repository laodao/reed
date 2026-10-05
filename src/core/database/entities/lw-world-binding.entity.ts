import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 项目↔世界观库绑定（设定资产库 P0-2026-09-24）
 * world_id 无 FK——库删除永不级联到项目（「项目存变量」原则的兜底，设计 §4.5）；
 * world_name 冗余快照供库删除/改名后的展示兜底。
 */
@Entity({ name: 'lw_world_bindings' })
@Index('idx_lw_world_bindings_project', ['projectId'])
export class LwWorldBindingEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'world_id', type: 'varchar' })
  worldId!: string

  @Column({ name: 'world_name', type: 'varchar', default: '' })
  worldName!: string

  /** 主世界 1 个，可挂参考世界 n 个 */
  @Column({ name: 'is_primary', type: 'integer', default: 1 })
  isPrimary!: number

  /** JSON: WorldBindingConfig {pinnedKindKeys, disabledEntryIds, overrides} */
  @Column({ name: 'config', type: 'text', nullable: true })
  config!: string | null

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
}
