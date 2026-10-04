import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 项目↔角色 IP 库绑定（设定资产库 P0-2026-09-24）
 * 导入即实例化：绑定时在 lw_story_characters 建项目内行（血缘列记库 id/版本），
 * 这里回填 project_character_id。ip_character_id 无 FK，库删除不波及项目。
 */
@Entity({ name: 'lw_ip_bindings' })
@Index('idx_lw_ip_bindings_project', ['projectId'])
@Index('idx_lw_ip_bindings_ip', ['ipCharacterId'])
export class LwIpBindingEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'ip_character_id', type: 'varchar' })
  ipCharacterId!: string

  /** 冗余快照：库删除后的展示兜底 */
  @Column({ name: 'ip_name', type: 'varchar', default: '' })
  ipName!: string

  /** 导入生成的项目角色 id（lw_story_characters.id）；null=尚未导入 */
  @Column({ name: 'project_character_id', type: 'varchar', nullable: true })
  projectCharacterId!: string | null

  /** 导入时建议位（protagonist/supporting/antagonist/minor），可后改 */
  @Column({ name: 'role_position', type: 'varchar', nullable: true })
  rolePosition!: string | null

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
