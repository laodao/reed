import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * LW 角色关系 Entity（FK CASCADE 双向到 lw_story_characters）。
 */
@Entity({ name: 'lw_character_relations' })
export class LwCharacterRelationEntity {
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
