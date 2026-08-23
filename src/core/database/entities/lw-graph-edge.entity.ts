import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 图谱关系边 Entity
 * 关系带时间线有效期：valid_from_chapter / valid_until_chapter（NULL=至今有效）。
 */
@Entity({ name: 'lw_graph_edges' })
@Index('idx_lw_graph_edges_project_id', ['projectId'])
@Index('idx_lw_graph_edges_source', ['projectId', 'sourceType', 'sourceId'])
@Index('idx_lw_graph_edges_target', ['projectId', 'targetType', 'targetId'])
@Index('idx_lw_graph_edges_relation', ['projectId', 'relationType'])
export class LwGraphEdgeEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'source_type', type: 'varchar' })
  sourceType!: string

  @Column({ name: 'source_id', type: 'varchar' })
  sourceId!: string

  @Column({ name: 'target_type', type: 'varchar' })
  targetType!: string

  @Column({ name: 'target_id', type: 'varchar' })
  targetId!: string

  @Column({ name: 'relation_type', type: 'varchar' })
  relationType!: string

  @Column({ name: 'label', type: 'text', nullable: true })
  label!: string | null

  @Column({ name: 'valid_from_chapter', type: 'integer', nullable: true })
  validFromChapter!: number | null

  @Column({ name: 'valid_until_chapter', type: 'integer', nullable: true })
  validUntilChapter!: number | null

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
