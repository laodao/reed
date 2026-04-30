import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * LW 记忆实体关联 Entity（FK CASCADE 到 lw_story_memories）。
 */
@Entity({ name: 'lw_memory_entities' })
@Index('idx_lw_memory_entities_memory', ['memoryId'])
@Index('idx_lw_memory_entities_entity', ['entityType', 'entityId'])
@Unique('uq_lw_memory_entities', ['memoryId', 'entityType', 'entityId'])
export class LwMemoryEntityEntity {
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
