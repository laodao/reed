import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 场景道具 Entity（FK CASCADE 到 scene_characters）。
 */
@Entity({ name: 'scene_props' })
@Index('idx_scene_props_character_id', ['sceneCharacterId'])
export class ScenePropEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'scene_character_id', type: 'varchar' })
  sceneCharacterId!: string

  @Column({ name: 'prop_name', type: 'text' })
  propName!: string
}
