/**
 * 提供商配置数据访问层
 * @module database/repositories/provider-config
 * @description 提供提供商配置的数据库操作
 */

import { Database as SqlJsDatabase } from 'sql.js'
import type { DatabaseManager } from '../index'
import type {
  UserProviderConfig,
  ModelDefinition
} from '../../../shared/types/provider-template.types'

/**
 * 数据库行类型
 */
interface ProviderConfigRow {
  id: string
  template_id: string
  name: string
  api_key_encrypted: string | null
  base_url: string | null
  custom_headers: string | null
  custom_params: string | null
  custom_models: string | null
  enabled_models: string | null
  is_enabled: number
  is_default: number
  last_tested: string | null
  test_result: string | null
  created_at: string
  updated_at: string
}

/**
 * 提供商配置数据仓库
 */
export class ProviderConfigRepository {
  private db: SqlJsDatabase
  private dbManager: DatabaseManager

  constructor(db: SqlJsDatabase, dbManager: DatabaseManager) {
    this.db = db
    this.dbManager = dbManager
  }

  /**
   * 将数据库行转换为配置对象
   */
  private rowToConfig(row: ProviderConfigRow): UserProviderConfig {
    return {
      id: row.id,
      templateId: row.template_id,
      name: row.name,
      apiKey: row.api_key_encrypted || undefined,
      baseUrl: row.base_url || undefined,
      customHeaders: row.custom_headers ? JSON.parse(row.custom_headers) : undefined,
      customParams: row.custom_params ? JSON.parse(row.custom_params) : undefined,
      customModels: row.custom_models ? JSON.parse(row.custom_models) : undefined,
      enabledModels: row.enabled_models ? JSON.parse(row.enabled_models) : undefined,
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
    const result = this.db.exec(
      'SELECT * FROM provider_configs ORDER BY is_default DESC, created_at ASC'
    )

    if (result.length === 0 || result[0].values.length === 0) {
      return []
    }

    const columns = result[0].columns
    return result[0].values.map((row) => {
      const rowObj = {} as Record<string, unknown>
      columns.forEach((col, idx) => {
        rowObj[col] = row[idx]
      })
      return this.rowToConfig(rowObj as unknown as ProviderConfigRow)
    })
  }

  /**
   * 根据 ID 获取配置
   * @param id - 配置 ID
   * @returns Promise<UserProviderConfig | null>
   */
  async getById(id: string): Promise<UserProviderConfig | null> {
    const result = this.db.exec('SELECT * FROM provider_configs WHERE id = ?', [id])

    if (result.length === 0 || result[0].values.length === 0) {
      return null
    }

    const columns = result[0].columns
    const row = result[0].values[0]
    const rowObj = {} as Record<string, unknown>
    columns.forEach((col, idx) => {
      rowObj[col] = row[idx]
    })

    return this.rowToConfig(rowObj as unknown as ProviderConfigRow)
  }

  /**
   * 根据模板 ID 获取配置列表
   * @param templateId - 模板 ID
   * @returns Promise<UserProviderConfig[]>
   */
  async getByTemplateId(templateId: string): Promise<UserProviderConfig[]> {
    const result = this.db.exec(
      'SELECT * FROM provider_configs WHERE template_id = ? ORDER BY created_at ASC',
      [templateId]
    )

    if (result.length === 0 || result[0].values.length === 0) {
      return []
    }

    const columns = result[0].columns
    return result[0].values.map((row) => {
      const rowObj = {} as Record<string, unknown>
      columns.forEach((col, idx) => {
        rowObj[col] = row[idx]
      })
      return this.rowToConfig(rowObj as unknown as ProviderConfigRow)
    })
  }

  /**
   * 创建配置
   * @param config - 配置数据
   * @returns Promise<UserProviderConfig>
   */
  async create(config: Omit<UserProviderConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserProviderConfig> {
    const id = this.generateId()
    const now = new Date().toISOString()

    this.db.run(
      `INSERT INTO provider_configs (
        id, template_id, name, api_key_encrypted, base_url,
        custom_headers, custom_params, custom_models, enabled_models,
        is_enabled, is_default, last_tested, test_result,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        config.templateId,
        config.name,
        config.apiKey || null,
        config.baseUrl || null,
        config.customHeaders ? JSON.stringify(config.customHeaders) : null,
        config.customParams ? JSON.stringify(config.customParams) : null,
        config.customModels ? JSON.stringify(config.customModels) : null,
        config.enabledModels ? JSON.stringify(config.enabledModels) : null,
        config.isEnabled ? 1 : 0,
        config.isDefault ? 1 : 0,
        config.lastTested || null,
        config.testResult || null,
        now,
        now
      ]
    )

    // 如果设置为默认，取消其他配置的默认状态
    if (config.isDefault) {
      this.clearOtherDefaults(id)
    }

    this.dbManager.save()

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
    if (updates.apiKey !== undefined) {
      setClauses.push('api_key_encrypted = ?')
      values.push(updates.apiKey || null)
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

    this.db.run(
      `UPDATE provider_configs SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    )

    // 如果设置为默认，取消其他配置的默认状态
    if (updates.isDefault) {
      this.clearOtherDefaults(id)
    }

    this.dbManager.save()

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

    this.db.run('DELETE FROM provider_configs WHERE id = ?', [id])
    this.dbManager.save()

    return true
  }

  /**
   * 获取默认配置
   * @returns Promise<UserProviderConfig | null>
   */
  async getDefault(): Promise<UserProviderConfig | null> {
    const result = this.db.exec(
      'SELECT * FROM provider_configs WHERE is_default = 1 AND is_enabled = 1 LIMIT 1'
    )

    if (result.length === 0 || result[0].values.length === 0) {
      return null
    }

    const columns = result[0].columns
    const row = result[0].values[0]
    const rowObj = {} as Record<string, unknown>
    columns.forEach((col, idx) => {
      rowObj[col] = row[idx]
    })

    return this.rowToConfig(rowObj as unknown as ProviderConfigRow)
  }

  /**
   * 获取所有启用的配置
   * @returns Promise<UserProviderConfig[]>
   */
  async getEnabled(): Promise<UserProviderConfig[]> {
    const result = this.db.exec(
      'SELECT * FROM provider_configs WHERE is_enabled = 1 ORDER BY is_default DESC, created_at ASC'
    )

    if (result.length === 0 || result[0].values.length === 0) {
      return []
    }

    const columns = result[0].columns
    return result[0].values.map((row) => {
      const rowObj = {} as Record<string, unknown>
      columns.forEach((col, idx) => {
        rowObj[col] = row[idx]
      })
      return this.rowToConfig(rowObj as unknown as ProviderConfigRow)
    })
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

    this.db.run(
      'UPDATE provider_configs SET is_default = 1, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), id]
    )

    this.dbManager.save()
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

    this.db.run(
      'UPDATE provider_configs SET last_tested = ?, test_result = ?, updated_at = ? WHERE id = ?',
      [now, result, now, id]
    )

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
          this.db.run(
            'UPDATE provider_configs SET enabled_models = NULL WHERE id = ?',
            [id]
          )
          this.dbManager.save()
          return true
        }
      }

      this.db.run(
        'UPDATE provider_configs SET enabled_models = ? WHERE id = ?',
        [JSON.stringify(enabledModels), id]
      )
    }

    this.dbManager.save()
    return true
  }

  /**
   * 清除其他配置的默认状态
   * @param excludeId - 排除的配置 ID
   */
  private clearOtherDefaults(excludeId: string): void {
    this.db.run(
      'UPDATE provider_configs SET is_default = 0 WHERE id != ?',
      [excludeId]
    )
  }

  /**
   * 生成唯一 ID
   * @returns string
   */
  private generateId(): string {
    return `pc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`
  }
}
