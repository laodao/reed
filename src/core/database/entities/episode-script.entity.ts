import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 剧本 Entity
 * 对齐 episode_scripts DDL + ALTER（script_content / script_format 后加列）。
 * Quirk: 时间字段为 epoch ms。
 */
@Entity({ name: 'episode_scripts' })
@Index('idx_episode_scripts_episode_id', ['episodeId'])
@Index('idx_episode_scripts_status', ['status'])
export class EpisodeScriptEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'episode_id', type: 'varchar' })
  episodeId!: string

  @Column({ name: 'outline_id', type: 'varchar' })
  outlineId!: string

  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string

  @Column({ name: 'synopsis', type: 'text', nullable: true })
  synopsis!: string | null

  @Column({ name: 'script_content', type: 'text', nullable: true })
  scriptContent!: string | null

  @Column({ name: 'script_format', type: 'text', nullable: true, default: 'standard' })
  scriptFormat!: string | null

  @Column({ name: 'scenes', type: 'simple-json', nullable: true })
  scenes!: unknown[] | null

  @Column({ name: 'total_duration', type: 'integer', default: 0 })
  totalDuration!: number

  @Column({ name: 'character_appearances', type: 'simple-json', nullable: true })
  characterAppearances!: string[] | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
