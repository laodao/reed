import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 长文写作角色 Entity
 * 对齐 lw_story_characters DDL（FK CASCADE 到 lw_projects；FK SET NULL 到 portrait_variants）。
 * 含 ALTER 后扩展列：importance / template_type / source_type / source_episode_id。
 * portrait_id / generated_image_id 已于 P2 Task 6 数据搬运后从 entity 移除（SQL 列保留 deprecated）。
 */
@Entity({ name: 'lw_story_characters' })
@Index('idx_lw_characters_project_id', ['projectId'])
export class LwCharacterEntity {
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

  @Column({ name: 'gender', type: 'text', nullable: true })
  gender!: string | null

  @Column({ name: 'age', type: 'integer', nullable: true })
  age!: number | null

  @Column({ name: 'height', type: 'integer', nullable: true })
  height!: number | null

  @Column({ name: 'weight', type: 'integer', nullable: true })
  weight!: number | null

  @Column({ name: 'race', type: 'text', nullable: true })
  race!: string | null

  @Column({ name: 'occupation', type: 'text', nullable: true })
  occupation!: string | null

  @Column({ name: 'position', type: 'text', nullable: true })
  position!: string | null

  @Column({ name: 'appearance', type: 'text', nullable: true })
  appearance!: string | null

  @Column({ name: 'background', type: 'text', nullable: true })
  background!: string | null

  @Column({ name: 'personality', type: 'text', nullable: true })
  personality!: string | null

  @Column({ name: 'abilities', type: 'text', nullable: true })
  abilities!: string | null

  /** 人物别名/称呼 JSON 数组（网文称呼刚需 + 提及检测地基，P0-2026-09-09） */
  @Column({ name: 'aliases', type: 'text', nullable: true })
  aliases!: string | null

  @Column({ name: 'role_position', type: 'text', nullable: true })
  rolePosition!: string | null

  @Column({ name: 'importance', type: 'text', default: 'secondary' })
  importance!: string

  @Column({ name: 'template_type', type: 'text', nullable: true })
  templateType!: string | null

  @Column({ name: 'major_events', type: 'text', nullable: true })
  majorEvents!: string | null

  @Column({ name: 'source_type', type: 'text', default: 'longwriting', nullable: true })
  sourceType!: string | null

  @Column({ name: 'source_episode_id', type: 'text', nullable: true })
  sourceEpisodeId!: string | null

  // ---- 设定资产库血缘 + 四层人设（2026-09-24 P0，迁移 create-lw-library-tables 加列）----
  @Column({ name: 'library_ip_id', type: 'varchar', nullable: true })
  libraryIpId!: string | null

  @Column({ name: 'library_world_id', type: 'varchar', nullable: true })
  libraryWorldId!: string | null

  @Column({ name: 'library_entry_id', type: 'varchar', nullable: true })
  libraryEntryId!: string | null

  @Column({ name: 'library_version', type: 'integer', nullable: true })
  libraryVersion!: number | null

  @Column({ name: 'motivation', type: 'text', nullable: true })
  motivation!: string | null

  @Column({ name: 'flaw', type: 'text', nullable: true })
  flaw!: string | null

  @Column({ name: 'character_arc', type: 'text', nullable: true })
  characterArc!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
