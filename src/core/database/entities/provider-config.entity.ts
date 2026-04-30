import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * Provider 配置 Entity
 * 对齐 provider_configs 表 DDL（含 ALTER TABLE 后的扩展列）。
 *
 * 注：原 DDL 还有 custom_models / enabled_models / api_models 三列（已弃用），
 *     当前 Repo 不使用，Entity 不声明（漂移检查仅校验 Entity 列存在与否，多余列无害）。
 */
@Entity({ name: 'provider_configs' })
export class ProviderConfigEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'short_id', type: 'text', nullable: true })
  shortId!: string | null

  @Column({ name: 'template_id', type: 'varchar' })
  templateId!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'api_key_encrypted', type: 'text', nullable: true })
  apiKeyEncrypted!: string | null

  @Column({ name: 'access_key_id', type: 'text', nullable: true })
  accessKeyId!: string | null

  @Column({ name: 'access_key_secret_encrypted', type: 'text', nullable: true })
  accessKeySecretEncrypted!: string | null

  @Column({ name: 'base_url', type: 'text', nullable: true })
  baseUrl!: string | null

  @Column({ name: 'image_base_url', type: 'text', nullable: true })
  imageBaseUrl!: string | null

  @Column({ name: 'video_base_url', type: 'text', nullable: true })
  videoBaseUrl!: string | null

  @Column({ name: 'audio_base_url', type: 'text', nullable: true })
  audioBaseUrl!: string | null

  @Column({ name: 'custom_headers', type: 'simple-json', nullable: true })
  customHeaders!: Record<string, unknown> | null

  @Column({ name: 'custom_params', type: 'simple-json', nullable: true })
  customParams!: Record<string, unknown> | null

  @Column({ name: 'models', type: 'simple-json', nullable: true })
  models!: unknown[] | null

  @Column({ name: 'is_enabled', type: 'integer', default: 1 })
  isEnabled!: number

  @Column({ name: 'is_default', type: 'integer', default: 0 })
  isDefault!: number

  @Column({ name: 'last_tested', type: Date, nullable: true })
  lastTested!: Date | null

  @Column({ name: 'test_result', type: 'text', nullable: true })
  testResult!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
