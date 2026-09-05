/**
 * 搜索引擎 IPC 处理器
 * @module ipc/handlers/search-engine.handler
 * @description 处理搜索引擎相关的 IPC 请求
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { getSearchEngineService } from '@core/platform/services/search-engine.service'
import type {
  SearchEngineTemplateListResponse,
  SearchEngineConfigListResponse,
  SearchEngineConfigResponse,
  TestSearchEngineConfigResponse,
  SaveSearchEngineConfigRequest,
  WebSearchResponse
} from '@shared/types/search-engine.types'

/**
 * 广播配置变化事件（跨平台 EventEmitter）
 */
function broadcastConfigChanged(): void {
  try {
    getEventEmitter().emit('search-engine:changed', {})
  } catch {
    // EventEmitter 未注册时静默忽略
  }
}

/**
 * 注册搜索引擎相关 IPC 处理器
 */
export function registerSearchEngineHandlers(): void {
  ipcBridge.handle('search-engine:templates', handleListTemplates)
  ipcBridge.handle('search-engine:list', handleListConfigs)
  ipcBridge.handle('search-engine:get', handleGetConfig)
  ipcBridge.handle('search-engine:create', handleCreateConfig)
  ipcBridge.handle('search-engine:update', handleUpdateConfig)
  ipcBridge.handle('search-engine:delete', handleDeleteConfig)
  ipcBridge.handle('search-engine:test', handleTestConfig)
  ipcBridge.handle('search-engine:set-default', handleSetDefault)
  ipcBridge.handle('search-engine:search', handleSearch)
  // 快速搜索引擎启用/停用
  ipcBridge.handle('search-engine:get-disabled-quick', handleGetDisabledQuickEngines)
  ipcBridge.handle('search-engine:set-quick-enabled', handleSetQuickEngineEnabled)
}

/**
 * 处理获取模板列表请求
 */
async function handleListTemplates(_event: any): Promise<SearchEngineTemplateListResponse> {
  try {
    const service = getSearchEngineService()
    const templates = await service.getTemplates()
    return {
      success: true,
      templates
    }
  } catch (error) {
    console.error('获取搜索引擎模板列表失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理获取配置列表请求
 */
async function handleListConfigs(_event: any): Promise<SearchEngineConfigListResponse> {
  try {
    const service = getSearchEngineService()
    const configs = await service.getConfigs()

    // 隐藏 API 密钥
    const safeConfigs = configs.map((config) => ({
      ...config,
      apiKey: config.apiKey ? '******' : undefined
    }))

    return {
      success: true,
      data: safeConfigs
    }
  } catch (error) {
    console.error('获取搜索引擎配置列表失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理获取单个配置请求
 */
async function handleGetConfig(_event: any, id: string): Promise<SearchEngineConfigResponse> {
  try {
    const service = getSearchEngineService()
    const config = await service.getConfig(id)

    if (!config) {
      return {
        success: false,
        error: '配置不存在'
      }
    }

    // 隐藏 API 密钥
    const safeConfig = {
      ...config,
      apiKey: config.apiKey ? '******' : undefined
    }

    return {
      success: true,
      config: safeConfig
    }
  } catch (error) {
    console.error('获取搜索引擎配置失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理创建配置请求
 */
async function handleCreateConfig(
  _event: any,
  data: SaveSearchEngineConfigRequest
): Promise<SearchEngineConfigResponse> {
  try {
    const service = getSearchEngineService()
    const config = await service.saveConfig(undefined, data)

    // 隐藏 API 密钥
    const safeConfig = {
      ...config,
      apiKey: config.apiKey ? '******' : undefined
    }

    // 广播配置变化
    broadcastConfigChanged()

    return {
      success: true,
      config: safeConfig
    }
  } catch (error) {
    console.error('创建搜索引擎配置失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理更新配置请求
 */
async function handleUpdateConfig(
  _event: any,
  data: { id: string; data: SaveSearchEngineConfigRequest }
): Promise<SearchEngineConfigResponse> {
  try {
    const service = getSearchEngineService()
    const config = await service.saveConfig(data.id, data.data)

    // 隐藏 API 密钥
    const safeConfig = {
      ...config,
      apiKey: config.apiKey ? '******' : undefined
    }

    // 广播配置变化
    broadcastConfigChanged()

    return {
      success: true,
      config: safeConfig
    }
  } catch (error) {
    console.error('更新搜索引擎配置失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理删除配置请求
 */
async function handleDeleteConfig(_event: any, id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const service = getSearchEngineService()
    const result = await service.deleteConfig(id)

    if (result) {
      // 广播配置变化
      broadcastConfigChanged()
    }

    return { success: result }
  } catch (error) {
    console.error('删除搜索引擎配置失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理测试配置请求
 */
async function handleTestConfig(
  _event: any,
  data: {
    configId?: string
    templateId?: string
    apiKey?: string
    extraConfig?: Record<string, unknown>
  }
): Promise<TestSearchEngineConfigResponse> {
  try {
    const service = getSearchEngineService()
    return service.testConfig(data)
  } catch (error) {
    console.error('测试搜索引擎配置失败:', error)
    return {
      success: false,
      message: String(error)
    }
  }
}

/**
 * 处理设置默认配置请求
 */
async function handleSetDefault(_event: any, id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const service = getSearchEngineService()
    const result = await service.setDefaultConfig(id)

    if (result) {
      // 广播配置变化
      broadcastConfigChanged()
    }

    return { success: result }
  } catch (error) {
    console.error('设置默认搜索引擎失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理执行搜索请求
 */
async function handleSearch(
  _event: any,
  data: {
    query: string
    engine: string
    configId?: string
    maxResults?: number
  }
): Promise<WebSearchResponse> {
  try {
    const service = getSearchEngineService()
    return service.search(
      data.query,
      data.engine as any,
      data.configId,
      data.maxResults
    )
  } catch (error) {
    console.error('执行搜索失败:', error)
    return {
      success: false,
      results: [],
      error: String(error)
    }
  }
}

/**
 * 处理获取被禁用的快速搜索引擎列表
 */
async function handleGetDisabledQuickEngines(
  _event: any
): Promise<{ success: boolean; disabledEngines?: string[]; error?: string }> {
  try {
    const service = getSearchEngineService()
    const disabledEngines = await service.getDisabledQuickEngines()
    return { success: true, disabledEngines }
  } catch (error) {
    console.error('获取被禁用的快速搜索引擎列表失败:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理设置快速搜索引擎启用状态
 */
async function handleSetQuickEngineEnabled(
  _event: any,
  data: { engineId: string; enabled: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const service = getSearchEngineService()
    await service.setQuickEngineEnabled(data.engineId, data.enabled)
    // 广播配置变化
    broadcastConfigChanged()
    return { success: true }
  } catch (error) {
    console.error('设置快速搜索引擎启用状态失败:', error)
    return { success: false, error: String(error) }
  }
}