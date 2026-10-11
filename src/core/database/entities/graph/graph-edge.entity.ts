import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 统一图存储·边 Entity（graph_edges，docs/design/2026-10-10-unified-graph-store-design.md §4）
 *
 * 所有业务的图数据共用本表，按 graph_name（库名）区分（@shared/constants/graph-store）。
 * 端点是不透明引用 (kind, id)——节点真身在各业务实体表，本表不做 FK 校验（与现状一致）。
 *
 * 注意：部分唯一索引 uq_graph_edges_active（五元组 WHERE valid_until IS NULL）
 * 只由迁移 create-unified-graph-tables.ts 用 SQL 创建——TypeORM @Index 不支持 WHERE。
 */
@Entity({ name: 'graph_edges' })
@Index('idx_graph_edges_name', ['graphName'])
@Index('idx_graph_edges_src', ['graphName', 'sourceKind', 'sourceId'])
@Index('idx_graph_edges_tgt', ['graphName', 'targetKind', 'targetId'])
@Index('idx_graph_edges_rel', ['graphName', 'relation'])
export class GraphEdgeEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户（local-default-user）。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 库名（{module}:{scopeKey}，见 @shared/constants/graph-store） */
  @Column({ name: 'graph_name', type: 'varchar' })
  graphName!: string

  @Column({ name: 'source_kind', type: 'varchar' })
  sourceKind!: string

  @Column({ name: 'source_id', type: 'varchar' })
  sourceId!: string

  @Column({ name: 'target_kind', type: 'varchar' })
  targetKind!: string

  @Column({ name: 'target_id', type: 'varchar' })
  targetId!: string

  @Column({ name: 'relation', type: 'varchar' })
  relation!: string

  @Column({ name: 'label', type: 'text', nullable: true })
  label!: string | null

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  /** 「为什么相关」一句话（kb 必填，模块侧保证；其余模块可空） */
  @Column({ name: 'evidence', type: 'text', nullable: true })
  evidence!: string | null

  /** 置信度 0~1（kb 边权；其余模块 NULL） */
  @Column({ name: 'confidence', type: 'float', nullable: true })
  confidence!: number | null

  /** 人审位（0/1；kb/dl 在用） */
  @Column({ name: 'verified', type: 'integer', default: 0 })
  verified!: number

  /** 溯源 JSON（{type:'extract'|'manual', ...}） */
  @Column({ name: 'origin', type: 'text', nullable: true })
  origin!: string | null

  /** 业务序数区间起点（lw=章节号）；NULL=起点不限 */
  @Column({ name: 'valid_from', type: 'integer', nullable: true })
  validFrom!: number | null

  /** 业务序数区间终点；NULL=至今有效 */
  @Column({ name: 'valid_until', type: 'integer', nullable: true })
  validUntil!: number | null

  /** 扩展属性 JSON */
  @Column({ name: 'props', type: 'text', nullable: true })
  props!: string | null

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
