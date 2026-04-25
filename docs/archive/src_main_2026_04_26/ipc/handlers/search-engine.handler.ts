/**
 * 搜索引擎 IPC 处理器
 * @module ipc/handlers/search-engine.handler
 * @description 处理搜索引擎相关的 IPC 请求
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { getSearchEngineService } from '../../services/search-engine.service'
import type {
  SearchEngineTemplateListResponse,
  SearchEngineConfigListResponse,
  SearchEngineConfigResponse,
  TestSearchEngineConfigResponse,
  SaveSearchEngineConfigRequest,
  WebSearchResponse
} from '../../../shared/types/search-engine.types'

/**
 * 广播配置变化事件到所有窗口
 */
function broadcastConfigChanged(): void {
  const windows = BrowserWindow.getAllWindows()
  for (const window of windows) {
    window.webContents.send('search-engine:changed')
  }
}

/**
 * 注册搜索引擎相关 IPC 处理器
 */
export function registerSearchEngineHandlers(): void {
  ipcMain.handle('search-engine:templates', handleListTemplates)
  ipcMain.handle('search-engine:list', handleListConfigs)
  ipcMain.handle('search-engine:get', handleGetConfig)
  ipcMain.handle('search-engine:create', handleCreateConfig)
  ipcMain.handle('search-engine:update', handleUpdateConfig)
  ipcMain.handle('search-engine:delete', handleDeleteConfig)
  ipcMain.handle('search-engine:test', handleTestConfig)
  ipcMain.handle('search-engine:set-default', handleSetDefault)
  ipcMain.handle('search-engine:search', handleSearch)
  // 快速搜索引擎启用/停用
  ipcMain.handle('search-engine:get-disabled-quick', handleGetDisabledQuickEngines)
  ipcMain.handle('search-engine:set-quick-enabled', handleSetQuickEngineEnabled)
}

/**
 * 处理获取模板列表请求
 */
async function handleListTemplates(event: IpcMainInvokeEvent): Promise<SearchEngineTemplateListResponse> {
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
async function handleListConfigs(event: IpcMainInvokeEvent): Promise<SearchEngineConfigListResponse> {
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
      configs: safeConfigs
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
async function handleGetConfig(event: IpcMainInvokeEvent, id: string): Promise<SearchEngineConfigResponse> {
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
  event: IpcMainInvokeEvent,
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
  event: IpcMainInvokeEvent,
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
async function handleDeleteConfig(event: IpcMainInvokeEvent, id: string): Promise<{ success: boolean; error?: string }> {
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
  event: IpcMainInvokeEvent,
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
async function handleSetDefault(event: IpcMainInvokeEvent, id: string): Promise<{ success: boolean; error?: string }> {
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
  event: IpcMainInvokeEvent,
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
  event: IpcMainInvokeEvent
): Promise<{ success: boolean; disabledEngines?: string[]; error?: string }> {
  try {
    const service = getSearchEngineService()
    const disabledEngines = service.getDisabledQuickEngines()
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
  event: IpcMainInvokeEvent,
  data: { engineId: string; enabled: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const service = getSearchEngineService()
    service.setQuickEngineEnabled(data.engineId, data.enabled)
    // 广播配置变化
    broadcastConfigChanged()
    return { success: true }
  } catch (error) {
    console.error('设置快速搜索引擎启用状态失败:', error)
    return { success: false, error: String(error) }
  }
}