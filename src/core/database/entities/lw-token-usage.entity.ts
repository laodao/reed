import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW Token 用量 Entity（W3.2）
 *
 * 每次 LLM 调用一行（fail-soft：provider 不返回 usage 时记估算值并置 is_estimated）。
 * 粒度到「用途」（设计卡/正文/扩写…）与章（chapter_id 可空——非章节链路为 NULL），
 * 供项目页用量汇总与未来配额/计费打基础。
 */
@Entity({ name: 'lw_token_usages' })
@Index('idx_lw_token_usages_project', ['projectId'])
@Index('idx_lw_token_usages_chapter', ['projectId', 'chapterId'])
export class LwTokenUsageEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** 关联章节 id（正文链路才有；非章节链路 NULL） */
  @Column({ name: 'chapter_id', type: 'varchar', nullable: true })
  chapterId!: string | null

  /** 用途：chapter-card / chapter-body / chapter-expand / outline / overview / misc … */
  @Column({ name: 'purpose', type: 'varchar' })
  purpose!: string

  @Column({ name: 'provider_config_id', type: 'varchar', nullable: true })
  providerConfigId!: string | null

  @Column({ name: 'model_id', type: 'varchar', nullable: true })
  modelId!: string | null

  @Column({ name: 'prompt_tokens', type: 'integer', default: 0 })
  promptTokens!: number

  @Column({ name: 'completion_tokens', type: 'integer', default: 0 })
  completionTokens!: number

  /** 总 token（usage 缺失时为估算：UTF-8 字节/4，is_estimated=1） */
  @Column({ name: 'total_tokens', type: 'integer', default: 0 })
  totalTokens!: number

  /** 1 = 估算值（provider 未返回 usage），0 = provider 原子数据 */
  @Column({ name: 'is_estimated', type: 'integer', default: 0 })
  isEstimated!: number

  /** 调用耗时（ms） */
  @Column({ name: 'duration_ms', type: 'integer', default: 0 })
  durationMs!: number

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
