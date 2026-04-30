import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 分镜角色 Entity。
 */
@Entity({ name: 'storyboard_characters' })
export class StoryboardCharacterEntity {
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
