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

  @Column({ name: 'episode_id', type: 'varchar' })
  episodeId!: string

  /**
   * 关联的 lw_outline 节点 ID。仅 episode.sourceType='outline' 时有值；
   * 'uploaded' 模式（用户直接粘长文）下为 null。P7 实测发现 PG NOT NULL
   * 约束阻断 uploaded 流程，改 nullable + 配套 relax-episode-script-outline-id
   * migration 同步 schema。
   */
  @Column({ name: 'outline_id', type: 'varchar', nullable: true })
  outlineId!: string | null

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

  /**
 * 剧本 metadata（JSON）：§4.5 保真校验可见性。
 *
 * 存放 `coverageReport`（原文对白覆盖度 + 正文↔dialogues 不一致条数），
 * 让"丢对白"从只打日志的事故变为剧集页可查的指标。
 * 用 simple-json（与 scenes 同风格），非新增关系表——这是脚本的附属观测数据，
 * 不参与查询/关联，落 JSON 列符合第三范式（无重复组、无部分依赖）。
 */
@Column({ name: 'metadata', type: 'simple-json', nullable: true })
metadata!: Record<string, unknown> | null

@Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
