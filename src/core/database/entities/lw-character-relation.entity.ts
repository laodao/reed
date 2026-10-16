import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 角色关系 Entity（FK CASCADE 双向到 lw_story_characters）。
 */
@Entity({ name: 'lw_character_relations' })
export class LwCharacterRelationEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 web-server 在请求上下文里通过 ALS 注入；
   * Electron 端单用户场景为 null。BaseRepository 会在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'character_id', type: 'varchar' })
  characterId!: string

  @Column({ name: 'related_character_id', type: 'varchar' })
  relatedCharacterId!: string

  @Column({ name: 'relation_type', type: 'text', nullable: true })
  relationType!: string | null

  @Column({ name: 'relation_description', type: 'text', nullable: true })
  relationDescription!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date
}
