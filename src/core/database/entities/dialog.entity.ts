import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 对话 Entity
 * 对齐现有 dialogs 表 DDL（含后续 ALTER TABLE 添加的列）。
 */
@Entity({ name: 'dialogs' })
export class DialogEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 web-server 在请求上下文里通过 ALS 注入；
   * Electron 端单用户场景为 null。BaseRepository 会在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'title', type: 'varchar' })
  title!: string

  @Column({ name: 'model_id', type: 'varchar' })
  modelId!: string

  @Column({ name: 'provider_config_id', type: 'text', nullable: true })
  providerConfigId!: string | null

  @Column({ name: 'role_id', type: 'text', nullable: true })
  roleId!: string | null

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt!: string | null

  @Column({ name: 'context_config', type: 'simple-json', nullable: true })
  contextConfig!: Record<string, unknown> | null

  @Column({ name: 'knowledge_base_ids', type: 'simple-json', nullable: true })
  knowledgeBaseIds!: string[] | null

  @Column({ name: 'web_search_config', type: 'simple-json', nullable: true })
  webSearchConfig!: Record<string, unknown> | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date

  @Column({ name: 'message_count', type: 'integer', default: 0 })
  messageCount!: number

  /** Agent 模式开关（28 号 M5）：开启后 sendMessage 分流到系统 agent 循环 */
  @Column({ name: 'agent_enabled', type: 'boolean', nullable: true })
  agentEnabled!: boolean | null
}
