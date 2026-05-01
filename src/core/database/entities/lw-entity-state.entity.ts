import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * LW 实体状态快照 Entity
 */
@Entity({ name: 'lw_entity_state_snapshots' })
@Index('idx_lw_entity_snapshots_project', ['projectId'])
@Index('idx_lw_entity_snapshots_entity', ['entityType', 'entityId'])
@Index('idx_lw_entity_snapshots_chapter', ['projectId', 'chapterNumber'])
@Unique('idx_lw_entity_snapshots_unique', [
  'projectId',
  'entityType',
  'entityId',
  'chapterNumber',
])
export class LwEntityStateEntity {
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

  @Column({ name: 'entity_type', type: 'varchar' })
  entityType!: string

  @Column({ name: 'entity_id', type: 'varchar' })
  entityId!: string

  @Column({ name: 'entity_name', type: 'varchar' })
  entityName!: string

  @Column({ name: 'chapter_number', type: 'integer' })
  chapterNumber!: number

  @Column({ name: 'state_summary', type: 'text' })
  stateSummary!: string

  @Column({ name: 'key_changes', type: 'text', nullable: true })
  keyChanges!: string | null

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
