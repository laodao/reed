import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 技能 Entity。
 */
@Entity({ name: 'lw_story_skills' })
@Index('idx_lw_skills_project_id', ['projectId'])
export class LwSkillEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'type', type: 'text', nullable: true })
  type!: string | null

  @Column({ name: 'level', type: 'text', nullable: true })
  level!: string | null

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'system', type: 'text', nullable: true })
  system!: string | null

  /** character_ids 是 JSON 字符串数组（旧 schema），保留 simple-json */
  @Column({ name: 'character_ids', type: 'simple-json', nullable: true })
  characterIds!: string[] | null

  // ---- 设定资产库血缘（2026-09-24 P0，迁移 create-lw-library-tables 加列）----
  @Column({ name: 'library_world_id', type: 'varchar', nullable: true })
  libraryWorldId!: string | null

  @Column({ name: 'library_entry_id', type: 'varchar', nullable: true })
  libraryEntryId!: string | null

  @Column({ name: 'library_version', type: 'integer', nullable: true })
  libraryVersion!: number | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
