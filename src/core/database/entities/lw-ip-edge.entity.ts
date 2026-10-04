import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 角色 IP 库内人物关系边（设定资产库 P0-2026-09-24）
 * 库内是「原型关系」（师徒/挚友/敌对…静态事实）；故事内的关系演变仍在项目侧
 * lw_graph_edges（带章节时间线），导入后由故事自行生长。
 */
@Entity({ name: 'lw_ip_edges' })
@Index('idx_lw_ip_edges_source', ['sourceId'])
@Index('idx_lw_ip_edges_target', ['targetId'])
export class LwIpEdgeEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'source_id', type: 'varchar' })
  sourceId!: string

  @Column({ name: 'target_id', type: 'varchar' })
  targetId!: string

  /** 师徒|挚友|敌对|血亲|隶属… */
  @Column({ name: 'relation_type', type: 'varchar' })
  relationType!: string

  @Column({ name: 'label', type: 'varchar', nullable: true })
  label!: string | null

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

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
