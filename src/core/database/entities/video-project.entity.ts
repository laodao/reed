import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 剧集项目 Entity
 * 对齐 video_projects DDL（FK SET NULL 到 lw_projects）。
 *
 * Quirk：created_at/updated_at 是 epoch ms 数字（DTO 字段也是 number）。
 */
@Entity({ name: 'video_projects' })
@Index('idx_video_projects_lw_project_id', ['longWritingProjectId'])
@Index('idx_video_projects_status', ['status'])
@Index('idx_video_projects_created_at', ['createdAt'])
export class VideoProjectEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'long_writing_project_id', type: 'text', nullable: true })
  longWritingProjectId!: string | null

  @Column({ name: 'status', type: 'varchar', default: 'draft' })
  status!: string

  /** config 列存为 TEXT/JSON 字符串（与现有 Repo 行为一致） */
  @Column({ name: 'config', type: 'simple-json' })
  config!: Record<string, unknown>

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
