import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * LW 技能-角色关联 Entity（FK CASCADE 双向）。
 */
@Entity({ name: 'lw_skill_characters' })
@Index('idx_lw_skill_characters_skill', ['skillId'])
@Index('idx_lw_skill_characters_character', ['characterId'])
@Unique('uq_lw_skill_characters', ['skillId', 'characterId'])
export class LwSkillCharacterEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'skill_id', type: 'varchar' })
  skillId!: string

  @Column({ name: 'character_id', type: 'varchar' })
  characterId!: string

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
