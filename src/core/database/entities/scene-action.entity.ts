import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 场景动作 Entity。
 */
@Entity({ name: 'scene_actions' })
@Index('idx_scene_actions_scene_id', ['sceneScriptId'])
export class SceneActionEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'scene_script_id', type: 'varchar' })
  sceneScriptId!: string

  @Column({ name: 'character_id', type: 'text', nullable: true })
  characterId!: string | null

  @Column({ name: 'description', type: 'text' })
  description!: string

  @Column({ name: 'timing', type: 'text', default: 'during' })
  timing!: string

  @Column({ name: 'duration', type: 'real', nullable: true })
  duration!: number | null

  @Column({ name: 'sort_order', type: 'integer' })
  sortOrder!: number
}
