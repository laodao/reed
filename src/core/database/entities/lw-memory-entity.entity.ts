import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * LW 记忆实体关联 Entity（FK CASCADE 到 lw_story_memories）。
 */
@Entity({ name: 'lw_memory_entities' })
@Index('idx_lw_memory_entities_memory', ['memoryId'])
@Index('idx_lw_memory_entities_entity', ['entityType', 'entityId'])
@Unique('uq_lw_memory_entities', ['memoryId', 'entityType', 'entityId'])
export class LwMemoryEntityEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'memory_id', type: 'varchar' })
  memoryId!: string

  @Column({ name: 'entity_type', type: 'varchar' })
  entityType!: string

  @Column({ name: 'entity_id', type: 'varchar' })
  entityId!: string

  @Column({ name: 'entity_name', type: 'varchar' })
  entityName!: string

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
