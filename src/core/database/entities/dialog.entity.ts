import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 对话 Entity
 * 对齐现有 dialogs 表 DDL（含后续 ALTER TABLE 添加的列）。
 */
@Entity({ name: 'dialogs' })
export class DialogEntity {
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
}
