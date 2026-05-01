import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 角色 Entity
 * 对齐现有 roles 表 DDL（含多个数值默认值、boolean(int) 列、JSON 列）。
 *
 * 注意：DTO Role.createdAt/updatedAt 是 Date 对象（new Date(row.created_at)）。
 */
@Entity({ name: 'roles' })
export class RoleEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 web-server 在请求上下文里通过 ALS 注入；
   * Electron 端单用户场景为 null。BaseRepository 会在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt!: string | null

  @Column({ name: 'avatar', type: 'text', nullable: true })
  avatar!: string | null

  @Column({ name: 'is_builtin', type: 'integer', default: 0 })
  isBuiltin!: number

  @Column({ name: 'default_model_id', type: 'text', nullable: true })
  defaultModelId!: string | null

  @Column({ name: 'default_provider_config_id', type: 'text', nullable: true })
  defaultProviderConfigId!: string | null

  @Column({ name: 'auto_reset_model', type: 'integer', default: 1 })
  autoResetModel!: number

  @Column({ name: 'temperature', type: 'real', default: 0.7 })
  temperature!: number

  @Column({ name: 'top_p', type: 'real', default: 1.0 })
  topP!: number

  @Column({ name: 'max_context_messages', type: 'integer', default: 20 })
  maxContextMessages!: number

  @Column({ name: 'max_tokens', type: 'integer', default: 4096 })
  maxTokens!: number

  @Column({ name: 'enable_stream', type: 'integer', default: 1 })
  enableStream!: number

  @Column({ name: 'custom_params', type: 'simple-json', nullable: true })
  customParams!: Record<string, unknown> | null

  @Column({ name: 'knowledge_base_ids', type: 'simple-json', nullable: true })
  knowledgeBaseIds!: string[] | null

  @Column({ name: 'knowledge_retrieve_count', type: 'integer', default: 5 })
  knowledgeRetrieveCount!: number

  @Column({ name: 'knowledge_threshold', type: 'real', default: 0.5 })
  knowledgeThreshold!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
