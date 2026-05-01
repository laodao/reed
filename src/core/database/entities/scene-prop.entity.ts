import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 场景道具 Entity（FK CASCADE 到 scene_characters）。
 */
@Entity({ name: 'scene_props' })
@Index('idx_scene_props_character_id', ['sceneCharacterId'])
export class ScenePropEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'scene_character_id', type: 'varchar' })
  sceneCharacterId!: string

  @Column({ name: 'prop_name', type: 'text' })
  propName!: string
}
