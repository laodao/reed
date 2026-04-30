import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 场景角色 Entity（无 created_at/updated_at）。
 */
@Entity({ name: 'scene_characters' })
export class SceneCharacterEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'scene_script_id', type: 'varchar' })
  sceneScriptId!: string

  @Column({ name: 'character_id', type: 'varchar' })
  characterId!: string

  @Column({ name: 'character_name', type: 'varchar' })
  characterName!: string

  @Column({ name: 'position', type: 'text', default: 'center' })
  position!: string

  @Column({ name: 'expression', type: 'text', nullable: true })
  expression!: string | null

  @Column({ name: 'action', type: 'text', nullable: true })
  action!: string | null

  @Column({ name: 'outfit', type: 'text', nullable: true })
  outfit!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number
}
