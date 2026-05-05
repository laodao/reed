import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 场景角色 Entity（无 created_at/updated_at）。
 */
@Entity({ name: 'scene_characters' })
export class SceneCharacterEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 web-server 在请求上下文里通过 ALS 注入；
   * Electron 端单用户场景为 null。BaseRepository 会在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'scene_script_id', type: 'varchar' })
  sceneScriptId!: string

  @Column({ name: 'character_id', type: 'varchar' })
  characterId!: string

  /**
   * 关联 character_bindings.id（spec §4.1 强约束）。null 表示老剧本未迁移。
   * Validator (P4-T3) 要求非空才算"通过完整性检查"。
   */
  @Column({ name: 'character_binding_id', type: 'varchar', nullable: true })
  characterBindingId!: string | null

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
