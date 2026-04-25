/**
 * 搜索引擎配置数据访问层
 * @module database/repositories/search-engine-config.repository
 * @description 提供搜索引擎配置的数据库操作
 */

import Database from 'better-sqlite3'
import type {
  UserSearchEngineConfig,
  SearchEngineType
} from '@shared/types/search-engine.types'

/**
 * 搜索引擎配置数据仓库
 */
export class SearchEngineConfigRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为配置对象
   */
  private rowToConfig(row: any): UserSearchEngineConfig {
    return {
      id: row.id,
      templateId: row.template_id as SearchEngineType,
      name: row.name,
      apiKey: row.api_key_encrypted || undefined,
      extraConfig: row.extra_config ? JSON.parse(row.extra_config) : undefined,
      maxResults: row.max_results || 5,
      isEnabled: row.is_enabled === 1,
      isDefault: row.is_default === 1,
      lastTested: row.last_tested || undefined,
      testResult: (row.test_result as 'success' | 'failed' | 'unknown') || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /**
   * 获取所有配置
   * @returns Promise<UserSearchEngineConfig[]>
   */
  async getAll(): Promise<UserSearchEngineConfig[]> {
    const rows = this.db.prepare(
      'SELECT * FROM search_engine_configs ORDER BY is_default DESC, created_at ASC'
    ).all() as any[]

    return rows.map(row => this.rowToConfig(row))
  }

  /**
   * 根据 ID 获取配置
   * @param id - 配置 ID
   * @returns Promise<UserSearchEngineConfig | null>
   */
  async getById(id: string): Promise<UserSearchEngineConfig | null> {
    const row = this.db.prepare('SELECT * FROM search_engine_configs WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToConfig(row)
  }

  /**
   * 根据模板 ID 获取配置列表
   * @param templateId - 模板 ID
   * @returns Promise<UserSearchEngineConfig[]>
   */
  async getByTemplateId(templateId: SearchEngineType): Promise<UserSearchEngineConfig[]> {
    const rows = this.db.prepare(
      'SELECT * FROM search_engine_configs WHERE template_id = ? ORDER BY created_at ASC'
    ).all(templateId) as any[]

    return rows.map(row => this.rowToConfig(row))
  }

  /**
   * 创建配置
   * @param config - 配置数据
   * @returns Promise<UserSearchEngineConfig>
   */
  async create(config: Omit<UserSearchEngineConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserSearchEngineConfig> {
    const id = this.generateId()
    const now = new Date().toISOString()

    this.db.prepare(
      `INSERT INTO search_engine_configs (
        id, template_id, name, api_key_encrypted, extra_config, max_results,
        is_enabled, is_default, last_tested, test_result,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      config.templateId,
      config.name,
      config.apiKey || null,
      config.extraConfig ? JSON.stringify(config.extraConfig) : null,
      config.maxResults || 5,
      config.isEnabled ? 1 : 0,
      config.isDefault ? 1 : 0,
      config.lastTested || null,
      config.testResult || null,
      now,
      now
    )

    // 如果设置为默认，取消其他配置的默认状态
    if (config.isDefault) {
      this.clearOtherDefaults(id)
    }

    return {
      ...config,
      id,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新配置
   * @param id - 配置 ID
   * @param updates - 更新数据
   * @returns Promise<UserSearchEngineConfig | null>
   */
  async update(
    id: string,
    updates: Partial<Omit<UserSearchEngineConfig, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<UserSearchEngineConfig | null> {
    const existing = await this.getById(id)
    if (!existing) {
      return null
    }

    const now = new Date().toISOString()
    const setClauses: string[] = ['updated_at = ?']
    const values: (string | number | null)[] = [now]

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.apiKey !== undefined) {
      setClauses.push('api_key_encrypted = ?')
      values.push(updates.apiKey || null)
    }
    if (updates.extraConfig !== undefined) {
      setClauses.push('extra_config = ?')
      values.push(updates.extraConfig ? JSON.stringify(updates.extraConfig) : null)
    }
    if (updates.maxResults !== undefined) {
      setClauses.push('max_results = ?')
      values.push(updates.maxResults)
    }
    if (updates.isEnabled !== undefined) {
      setClauses.push('is_enabled = ?')
      values.push(updates.isEnabled ? 1 : 0)
    }
    if (updates.isDefault !== undefined) {
      setClauses.push('is_default = ?')
      values.push(updates.isDefault ? 1 : 0)
    }
    if (updates.lastTested !== undefined) {
      setClauses.push('last_tested = ?')
      values.push(updates.lastTested || null)
    }
    if (updates.testResult !== undefined) {
      setClauses.push('test_result = ?')
      values.push(updates.testResult || null)
    }

    values.push(id)

    this.db.prepare(
      `UPDATE search_engine_configs SET ${setClauses.join(', ')} WHERE id = ?`
    ).run(...values)

    // 如果设置为默认，取消其他配置的默认状态
    if (updates.isDefault) {
      this.clearOtherDefaults(id)
    }

    return this.getById(id)
  }

  /**
   * 删除配置
   * @param id - 配置 ID
   * @returns Promise<boolean>
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    this.db.prepare('DELETE FROM search_engine_configs WHERE id = ?').run(id)
    return true
  }

  /**
   * 获取默认配置
   * @returns Promise<UserSearchEngineConfig | null>
   */
  async getDefault(): Promise<UserSearchEngineConfig | null> {
    const row = this.db.prepare(
      'SELECT * FROM search_engine_configs WHERE is_default = 1 AND is_enabled = 1 LIMIT 1'
    ).get() as any

    if (!row) return null
    return this.rowToConfig(row)
  }

  /**
   * 获取所有启用的配置
   * @returns Promise<UserSearchEngineConfig[]>
   */
  async getEnabled(): Promise<UserSearchEngineConfig[]> {
    const rows = this.db.prepare(
      'SELECT * FROM search_engine_configs WHERE is_enabled = 1 ORDER BY is_default DESC, created_at ASC'
    ).all() as any[]

    return rows.map(row => this.rowToConfig(row))
  }

  /**
   * 设置默认配置
   * @param id - 配置 ID
   * @returns Promise<boolean>
   */
  async setDefault(id: string): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing) {
      return false
    }

    this.clearOtherDefaults(id)

    this.db.prepare(
      'UPDATE search_engine_configs SET is_default = 1, updated_at = ? WHERE id = ?'
    ).run(new Date().toISOString(), id)

    return true
  }

  /**
   * 更新测试结果
   * @param id - 配置 ID
   * @param result - 测试结果
   * @returns Promise<boolean>
   */
  async updateTestResult(
    id: string,
    result: 'success' | 'failed' | 'unknown'
  ): Promise<boolean> {
    const now = new Date().toISOString()

    this.db.prepare(
      'UPDATE search_engine_configs SET last_tested = ?, test_result = ?, updated_at = ? WHERE id = ?'
    ).run(now, result, now, id)

    return true
  }

  /**
   * 清除其他配置的默认状态
   * @param excludeId - 排除的配置 ID
   */
  private clearOtherDefaults(excludeId: string): void {
    this.db.prepare(
      'UPDATE search_engine_configs SET is_default = 0 WHERE id != ?'
    ).run(excludeId)
  }

  /**
   * 生成唯一 ID
   * @returns string
   */
  private generateId(): string {
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`
  }
}