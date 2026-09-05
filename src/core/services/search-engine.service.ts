/**
 * 搜索引擎服务
 * @module services/search-engine.service
 * @description 提供搜索引擎配置管理和搜索执行功能
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getSecureStorage, type ISecureStorage } from '@core/interfaces/storage.interface'
import {
  SEARCH_ENGINE_TEMPLATES,
  getSearchEngineTemplate,
  executeSearch,
  requiresApiKey
} from '@core/platform/providers/search'
import type {
  SearchEngineTemplate,
  UserSearchEngineConfig,
  WebSearchResponse,
  SearchEngineType,
  SaveSearchEngineConfigRequest,
  TestSearchEngineConfigRequest,
  TestSearchEngineConfigResponse
} from '@shared/types/search-engine.types'

/**
 * 搜索引擎服务
 */
export class SearchEngineService {
  private static instance: SearchEngineService
  private secureStorage: ISecureStorage

  private constructor() {
    this.secureStorage = getSecureStorage()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): SearchEngineService {
    if (!SearchEngineService.instance) {
      SearchEngineService.instance = new SearchEngineService()
    }
    return SearchEngineService.instance
  }

  /**
   * 确保密存储已初始化
   */
  private async ensureSecureStorageInitialized(): Promise<void> {
    if (!this.secureStorage.isInitialized()) {
      await this.secureStorage.initialize()
    }
  }

  /**
   * 获取所有搜索引擎模板
   */
  async getTemplates(): Promise<SearchEngineTemplate[]> {
    return SEARCH_ENGINE_TEMPLATES
  }

  /**
   * 获取所有用户配置
   */
  async getConfigs(): Promise<UserSearchEngineConfig[]> {
    const db = getCoreDatabaseManager()
    if (!db.searchEngineConfigs) {
      return []
    }
    return db.searchEngineConfigs.getAll()
  }

  /**
   * 获取单个配置
   */
  async getConfig(id: string): Promise<UserSearchEngineConfig | null> {
    const db = getCoreDatabaseManager()
    if (!db.searchEngineConfigs) {
      return null
    }
    return db.searchEngineConfigs.getById(id)
  }

  /**
   * 获取默认配置
   */
  async getDefaultConfig(): Promise<UserSearchEngineConfig | null> {
    const db = getCoreDatabaseManager()
    if (!db.searchEngineConfigs) {
      return null
    }
    return db.searchEngineConfigs.getDefault()
  }

  /**
   * 保存配置（创建或更新）
   */
  async saveConfig(id: string | undefined, data: SaveSearchEngineConfigRequest): Promise<UserSearchEngineConfig> {
    const db = getCoreDatabaseManager()
    if (!db.searchEngineConfigs) {
      throw new Error('数据库未初始化')
    }

    // 获取 templateId：如果是更新操作且没有传 templateId，则从现有配置获取
    let templateId = data.templateId
    if (!templateId && id) {
      const existingConfig = await db.searchEngineConfigs.getById(id)
      if (existingConfig) {
        templateId = existingConfig.templateId
      }
    }

    // 获取模板信息
    const template = getSearchEngineTemplate(templateId!)
    if (!template) {
      throw new Error(`未知的搜索引擎类型: ${templateId}`)
    }

    // 加密 API Key
    let encryptedApiKey = data.apiKey
    if (data.apiKey) {
      await this.ensureSecureStorageInitialized()
      encryptedApiKey = this.secureStorage.encrypt(data.apiKey)
    }

    const configData = {
      templateId: templateId!,
      name: data.name || template.name,
      apiKey: encryptedApiKey,
      extraConfig: data.extraConfig,
      maxResults: data.maxResults || template.defaultMaxResults,
      isEnabled: data.isEnabled ?? true,
      isDefault: data.isDefault ?? false
    }

    if (id) {
      // 更新现有配置
      const updated = await db.searchEngineConfigs.update(id, configData)
      if (!updated) {
        throw new Error('更新配置失败')
      }
      return updated
    } else {
      // 创建新配置
      return db.searchEngineConfigs.create(configData)
    }
  }

  /**
   * 删除配置
   */
  async deleteConfig(id: string): Promise<boolean> {
    const db = getCoreDatabaseManager()
    if (!db.searchEngineConfigs) {
      return false
    }
    return db.searchEngineConfigs.delete(id)
  }

  /**
   * 设置默认配置
   */
  async setDefaultConfig(id: string): Promise<boolean> {
    const db = getCoreDatabaseManager()
    if (!db.searchEngineConfigs) {
      return false
    }
    return db.searchEngineConfigs.setDefault(id)
  }

  /**
   * 测试配置
   */
  async testConfig(request: TestSearchEngineConfigRequest): Promise<TestSearchEngineConfigResponse> {
    try {
      let config: UserSearchEngineConfig | null = null
      let templateId = request.templateId

      if (request.configId) {
        config = await this.getConfig(request.configId)
        if (!config) {
          return { success: false, message: '配置不存在' }
        }
        templateId = config.templateId
      }

      if (!templateId) {
        return { success: false, message: '请指定搜索引擎类型' }
      }

      // 检查是否需要 API Key
      if (requiresApiKey(templateId)) {
        const apiKey = request.apiKey || config?.apiKey
        if (!apiKey) {
          return { success: false, message: '请提供 API Key' }
        }

        // 解密 API Key（如果是已保存的配置）
        let decryptedApiKey = apiKey
        if (config?.apiKey && !request.apiKey) {
          await this.ensureSecureStorageInitialized()
          decryptedApiKey = this.secureStorage.decrypt(apiKey)
        }

        // 执行测试搜索
        const response = await executeSearch(
          templateId,
          'test search',
          { ...config, apiKey: decryptedApiKey } as UserSearchEngineConfig,
          1
        )

        if (response.success) {
          // 更新测试结果
          if (request.configId) {
            await this.updateTestResult(request.configId, 'success')
          }
          return { success: true, message: '连接测试成功' }
        } else {
          if (request.configId) {
            await this.updateTestResult(request.configId, 'failed')
          }
          return { success: false, message: response.error || '连接测试失败' }
        }
      } else {
        // 网页抓取型引擎 / 无需 Key 但需配置的引擎（如 SearXNG），直接测试；
        // 传入 config 以便携带 extraConfig（实例地址等）
        const response = await executeSearch(templateId, 'test search', config || undefined, 1)

        if (response.success) {
          return { success: true, message: '连接测试成功' }
        } else {
          return { success: false, message: response.error || '连接测试失败' }
        }
      }
    } catch (error: any) {
      console.error('[SearchEngineService] 测试配置失败:', error)
      return { success: false, message: error.message || '测试失败' }
    }
  }

  /**
   * 更新测试结果
   */
  private async updateTestResult(id: string, result: 'success' | 'failed' | 'unknown'): Promise<void> {
    const db = getCoreDatabaseManager()
    if (db.searchEngineConfigs) {
      await db.searchEngineConfigs.updateTestResult(id, result)
    }
  }

  /**
   * 执行搜索
   */
  async search(
    query: string,
    engineType: SearchEngineType,
    configId?: string,
    maxResults?: number
  ): Promise<WebSearchResponse> {
    try {
      // 模型内置搜索不在这里处理
      if (engineType === 'model') {
        return {
          success: false,
          results: [],
          error: '模型内置搜索需要在聊天时由模型处理'
        }
      }

      let config: UserSearchEngineConfig | undefined

      // 如果提供了配置 ID，获取配置并解密 API Key
      if (configId) {
        const db = getCoreDatabaseManager()
        if (db.searchEngineConfigs) {
          const storedConfig = await db.searchEngineConfigs.getById(configId)
          if (storedConfig) {
            // 解密 API Key
            if (storedConfig.apiKey) {
              await this.ensureSecureStorageInitialized()
              storedConfig.apiKey = this.secureStorage.decrypt(storedConfig.apiKey)
            }
            config = storedConfig
          }
        }
      }

      // 执行搜索
      return executeSearch(engineType, query, config, maxResults)
    } catch (error: any) {
      console.error('[SearchEngineService] 搜索失败:', error)
      return {
        success: false,
        results: [],
        error: error.message || '搜索失败'
      }
    }
  }

  /**
   * 获取快速搜索引擎列表
   */
  async getQuickSearchEngines(): Promise<SearchEngineTemplate[]> {
    return SEARCH_ENGINE_TEMPLATES.filter(t => t.category === 'web-scrape')
  }

  /**
   * 获取已配置的搜索引擎列表
   */
  async getConfiguredEngines(): Promise<UserSearchEngineConfig[]> {
    const db = getCoreDatabaseManager()
    if (!db.searchEngineConfigs) {
      return []
    }
    return db.searchEngineConfigs.getEnabled()
  }

  // ========== 快速搜索引擎启用/停用管理 ==========

  private readonly DISABLED_QUICK_ENGINES_KEY = 'disabledQuickSearchEngines'

  /**
   * 获取被禁用的快速搜索引擎 ID 列表
   */
  async getDisabledQuickEngines(): Promise<string[]> {
    const db = getCoreDatabaseManager()
    if (!db.settings) {
      return []
    }
    const raw = (await db.settings.get(this.DISABLED_QUICK_ENGINES_KEY)) as
      | string[]
      | undefined
      | null
    return Array.isArray(raw) ? raw : []
  }

  /**
   * 设置快速搜索引擎的启用状态
   * @param engineId - 搜索引擎模板 ID
   * @param enabled - 是否启用
   */
  async setQuickEngineEnabled(engineId: string, enabled: boolean): Promise<void> {
    const db = getCoreDatabaseManager()
    if (!db.settings) {
      throw new Error('数据库未初始化')
    }

    const disabledEngines = await this.getDisabledQuickEngines()

    if (enabled) {
      // 从禁用列表中移除
      const index = disabledEngines.indexOf(engineId)
      if (index > -1) {
        disabledEngines.splice(index, 1)
      }
    } else {
      // 添加到禁用列表
      if (!disabledEngines.includes(engineId)) {
        disabledEngines.push(engineId)
      }
    }

    await db.settings.set(this.DISABLED_QUICK_ENGINES_KEY, disabledEngines)
  }

  /**
   * 检查快速搜索引擎是否启用
   * @param engineId - 搜索引擎模板 ID
   */
  async isQuickEngineEnabled(engineId: string): Promise<boolean> {
    const disabledEngines = await this.getDisabledQuickEngines()
    return !disabledEngines.includes(engineId)
  }
}

// 导出单例获取函数
export const getSearchEngineService = (): SearchEngineService => SearchEngineService.getInstance()