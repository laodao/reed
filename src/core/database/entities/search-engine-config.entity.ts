import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 搜索引擎配置 Entity
 * 对齐 src/electron/database/index.ts 中现有 search_engine_configs 表 DDL：
 *   id TEXT PRIMARY KEY,
 *   template_id TEXT NOT NULL,
 *   name TEXT NOT NULL,
 *   api_key_encrypted TEXT,
 *   extra_config TEXT,
 *   max_results INTEGER DEFAULT 5,
 *   is_enabled INTEGER DEFAULT 1,
 *   is_default INTEGER DEFAULT 0,
 *   last_tested DATETIME,
 *   test_result TEXT,
 *   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 *   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
 *
 * 索引：
 *   idx_search_engine_configs_template_id ON (template_id)
 *   idx_search_engine_configs_created_at ON (created_at DESC)
 */
@Entity({ name: 'search_engine_configs' })
@Index('idx_search_engine_configs_template_id', ['templateId'])
@Index('idx_search_engine_configs_created_at', ['createdAt'])
export class SearchEngineConfigEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'template_id', type: 'varchar' })
  templateId!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'api_key_encrypted', type: 'text', nullable: true })
  apiKeyEncrypted!: string | null

  /** simple-json 在 sqlite/postgres 都存为 text，自动 JSON 序列化 */
  @Column({ name: 'extra_config', type: 'simple-json', nullable: true })
  extraConfig!: Record<string, unknown> | null

  @Column({ name: 'max_results', type: 'integer', default: 5 })
  maxResults!: number

  @Column({ name: 'is_enabled', type: 'integer', default: 1 })
  isEnabled!: number

  @Column({ name: 'is_default', type: 'integer', default: 0 })
  isDefault!: number

  /**
   * datetime 列：用 type: Date 让 TypeORM 按方言选具体 SQL 类型
   * （sqlite → datetime, postgres → timestamp without time zone）
   */
  @Column({ name: 'last_tested', type: Date, nullable: true })
  lastTested!: Date | null

  @Column({ name: 'test_result', type: 'text', nullable: true })
  testResult!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
