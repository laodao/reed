/**
 * 提供商配置数据访问层
 * @module database/repositories/provider-config
 * @description 提供提供商配置的数据库操作
 */

import Database from 'better-sqlite3'
import type {
  UserProviderConfig,
  ModelDefinition
} from '../../../shared/types/provider-template.types'

/**
 * 提供商配置数据仓库
 */
export class ProviderConfigRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为配置对象
   */
  private rowToConfig(row: any): UserProviderConfig {
    return {
      id: row.id,
      shortId: row.short_id || undefined,
      templateId: row.template_id,
      name: row.name,
      apiKey: row.api_key_encrypted || undefined,
      accessKeyId: row.access_key_id || undefined,
      accessKeySecret: row.access_key_secret_encrypted || undefined,
      baseUrl: row.base_url || undefined,
      customHeaders: row.custom_headers ? JSON.parse(row.custom_headers) : undefined,
      customParams: row.custom_params ? JSON.parse(row.custom_params) : undefined,
      customModels: row.custom_models ? JSON.parse(row.custom_models) : undefined,
      enabledModels: row.enabled_models ? JSON.parse(row.enabled_models) : undefined,
      apiModels: row.api_models ? JSON.parse(row.api_models) : undefined,
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
   * @returns Promise<UserProviderConfig[]>
   */
  async getAll(): Promise<UserProviderConfig[]> {
    const rows = this.db.prepare(
      'SELECT * FROM provider_configs ORDER BY is_default DESC, created_at ASC'
    ).all() as any[]

    return rows.map(row => this.rowToConfig(row))
  }

  /**
   * 根据 ID 获取配置
   * @param id - 配置 ID
   * @returns Promise<UserProviderConfig | null>
   */
  async getById(id: string): Promise<UserProviderConfig | null> {
    const row = this.db.prepare('SELECT * FROM provider_configs WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToConfig(row)
  }

  /**
   * 根据模板 ID 获取配置列表
   * @param templateId - 模板 ID
   * @returns Promise<UserProviderConfig[]>
   */
  async getByTemplateId(templateId: string): Promise<UserProviderConfig[]> {
    const rows = this.db.prepare(
      'SELECT * FROM provider_configs WHERE template_id = ? ORDER BY created_at ASC'
    ).all(templateId) as any[]

    return rows.map(row => this.rowToConfig(row))
  }

  /**
   * 创建配置
   * @param config - 配置数据
   * @returns Promise<UserProviderConfig>
   */
  async create(config: Omit<UserProviderConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserProviderConfig> {
    const id = this.generateId()
    const now = new Date().toISOString()

    this.db.prepare(
      `INSERT INTO provider_configs (
        id, short_id, template_id, name, api_key_encrypted, access_key_id, access_key_secret_encrypted, base_url,
        custom_headers, custom_params, custom_models, enabled_models, api_models,
        is_enabled, is_default, last_tested, test_result,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      config.shortId || null,
      config.templateId,
      config.name,
      config.apiKey || null,
      config.accessKeyId || null,
      config.accessKeySecret || null,
      config.baseUrl || null,
      config.customHeaders ? JSON.stringify(config.customHeaders) : null,
      config.customParams ? JSON.stringify(config.customParams) : null,
      config.customModels ? JSON.stringify(config.customModels) : null,
      config.enabledModels ? JSON.stringify(config.enabledModels) : null,
      config.apiModels ? JSON.stringify(config.apiModels) : null,
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
   * @returns Promise<UserProviderConfig | null>
   */
  async update(
    id: string,
    updates: Partial<Omit<UserProviderConfig, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<UserProviderConfig | null> {
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
    if (updates.shortId !== undefined) {
      setClauses.push('short_id = ?')
      values.push(updates.shortId || null)
    }
    if (updates.apiKey !== undefined) {
      setClauses.push('api_key_encrypted = ?')
      values.push(updates.apiKey || null)
    }
    if (updates.accessKeyId !== undefined) {
      setClauses.push('access_key_id = ?')
      values.push(updates.accessKeyId || null)
    }
    if (updates.accessKeySecret !== undefined) {
      setClauses.push('access_key_secret_encrypted = ?')
      values.push(updates.accessKeySecret || null)
    }
    if (updates.baseUrl !== undefined) {
      setClauses.push('base_url = ?')
      values.push(updates.baseUrl || null)
    }
    if (updates.customHeaders !== undefined) {
      setClauses.push('custom_headers = ?')
      values.push(updates.customHeaders ? JSON.stringify(updates.customHeaders) : null)
    }
    if (updates.customParams !== undefined) {
      setClauses.push('custom_params = ?')
      values.push(updates.customParams ? JSON.stringify(updates.customParams) : null)
    }
    if (updates.customModels !== undefined) {
      setClauses.push('custom_models = ?')
      values.push(updates.customModels ? JSON.stringify(updates.customModels) : null)
    }
    if (updates.enabledModels !== undefined) {
      setClauses.push('enabled_models = ?')
      values.push(updates.enabledModels ? JSON.stringify(updates.enabledModels) : null)
    }
    if (updates.apiModels !== undefined) {
      setClauses.push('api_models = ?')
      values.push(updates.apiModels ? JSON.stringify(updates.apiModels) : null)
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
      `UPDATE provider_configs SET ${setClauses.join(', ')} WHERE id = ?`
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

    this.db.prepare('DELETE FROM provider_configs WHERE id = ?').run(id)
    return true
  }

  /**
   * 获取默认配置
   * @returns Promise<UserProviderConfig | null>
   */
  async getDefault(): Promise<UserProviderConfig | null> {
    const row = this.db.prepare(
      'SELECT * FROM provider_configs WHERE is_default = 1 AND is_enabled = 1 LIMIT 1'
    ).get() as any

    if (!row) return null
    return this.rowToConfig(row)
  }

  /**
   * 获取所有启用的配置
   * @returns Promise<UserProviderConfig[]>
   */
  async getEnabled(): Promise<UserProviderConfig[]> {
    const rows = this.db.prepare(
      'SELECT * FROM provider_configs WHERE is_enabled = 1 ORDER BY is_default DESC, created_at ASC'
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
      'UPDATE provider_configs SET is_default = 1, updated_at = ? WHERE id = ?'
    ).run(new Date().toISOString(), id)

    return true
  }

  /**
   * 更新测试结果
   * @param id - 配置 ID
   * @param result - 测试结果
   * @param models - 获取到的模型列表（可选）
   * @param templateModels - 模板中定义的有效模型 ID 列表（可选）
   * @returns Promise<boolean>
   */
  async updateTestResult(
    id: string,
    result: 'success' | 'failed' | 'unknown',
    models?: ModelDefinition[],
    templateModels?: string[]
  ): Promise<boolean> {
    const now = new Date().toISOString()

    this.db.prepare(
      'UPDATE provider_configs SET last_tested = ?, test_result = ?, updated_at = ? WHERE id = ?'
    ).run(now, result, now, id)

    // 如果测试成功且提供了模型列表，更新启用的模型
    if (result === 'success' && models && models.length > 0) {
      let enabledModels = models.map((m) => m.id)

      // 如果提供了模板模型列表，过滤掉不属于该模板的模型
      if (templateModels && templateModels.length > 0) {
        const validModelSet = new Set(templateModels)
        const filteredModels = enabledModels.filter(modelId => validModelSet.has(modelId))

        // 如果过滤后还有模型，使用过滤后的列表
        if (filteredModels.length > 0) {
          enabledModels = filteredModels
          console.log(`[updateTestResult] 过滤后的有效模型:`, enabledModels)
        } else {
          // API 返回的模型均不属于该模板，清除 enabled_models（设为 NULL 使用模板默认模型）
          console.log(`[updateTestResult] API 返回的模型均不属于该模板，清除 enabled_models`)
          this.db.prepare(
            'UPDATE provider_configs SET enabled_models = NULL WHERE id = ?'
          ).run(id)
          return true
        }
      }

      this.db.prepare(
        'UPDATE provider_configs SET enabled_models = ? WHERE id = ?'
      ).run(JSON.stringify(enabledModels), id)
    }

    return true
  }

  /**
   * 清除其他配置的默认状态
   * @param excludeId - 排除的配置 ID
   */
  private clearOtherDefaults(excludeId: string): void {
    this.db.prepare(
      'UPDATE provider_configs SET is_default = 0 WHERE id != ?'
    ).run(excludeId)
  }

  /**
   * 生成唯一 ID
   * @returns string
   */
  private generateId(): string {
    return `pc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`
  }
}