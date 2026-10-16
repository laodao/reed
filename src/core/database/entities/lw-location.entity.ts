import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 地点 Entity（含 ALTER 后扩展列）。
 */
@Entity({ name: 'lw_story_locations' })
@Index('idx_lw_locations_project_id', ['projectId'])
export class LwLocationEntity {
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

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'importance', type: 'text', nullable: true })
  importance!: string | null

  @Column({ name: 'map_id', type: 'text', nullable: true })
  mapId!: string | null

  // ALTER 后扩展列
  @Column({ name: 'entity_importance', type: 'text', default: 'secondary', nullable: true })
  entityImportance!: string | null

  @Column({ name: 'template_type', type: 'text', nullable: true })
  templateType!: string | null

  @Column({ name: 'source_type', type: 'text', default: 'longwriting', nullable: true })
  sourceType!: string | null

  @Column({ name: 'source_episode_id', type: 'text', nullable: true })
  sourceEpisodeId!: string | null

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
