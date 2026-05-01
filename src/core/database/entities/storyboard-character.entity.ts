import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 分镜角色 Entity。
 */
@Entity({ name: 'storyboard_characters' })
export class StoryboardCharacterEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 web-server 在请求上下文里通过 ALS 注入；
   * Electron 端单用户场景为 null。BaseRepository 会在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'storyboard_id', type: 'varchar' })
  storyboardId!: string

  @Column({ name: 'character_id', type: 'varchar' })
  characterId!: string

  @Column({ name: 'position_x', type: 'real', default: 50 })
  positionX!: number

  @Column({ name: 'position_y', type: 'real', default: 50 })
  positionY!: number

  @Column({ name: 'position_scale', type: 'real', default: 1.0 })
  positionScale!: number

  @Column({ name: 'expression', type: 'text', nullable: true })
  expression!: string | null

  @Column({ name: 'action', type: 'text', nullable: true })
  action!: string | null

  @Column({ name: 'facing', type: 'text', default: 'front' })
  facing!: string

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number
}
