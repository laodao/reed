import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 世界观库内静态关系边（设定资产库 P0-2026-09-24）
 * 形态复制 lw_graph_edges 的多态设计，但去掉时间线列——库是常量，没有「从第几章起」。
 * source/target 统一指 lw_world_entries（人物关系在 lw_ip_edges）。
 */
@Entity({ name: 'lw_world_edges' })
@Index('idx_lw_world_edges_world', ['worldId'])
export class LwWorldEdgeEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'world_id', type: 'varchar' })
  worldId!: string

  @Column({ name: 'source_id', type: 'varchar' })
  sourceId!: string

  @Column({ name: 'target_id', type: 'varchar' })
  targetId!: string

  /** 位于|隶属|敌对|炼制|需求|克制|晋阶… */
  @Column({ name: 'relation_type', type: 'varchar' })
  relationType!: string

  @Column({ name: 'label', type: 'varchar', nullable: true })
  label!: string | null

  /** JSON: {type:'manual'|'ai'} */
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
}
