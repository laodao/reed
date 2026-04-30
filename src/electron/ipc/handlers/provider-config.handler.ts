/**
 * 提供商配置 IPC 处理器
 * @module ipc/handlers/provider-config
 * @description 处理提供商配置相关的 IPC 请求
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { getDatabaseManager } from '../../database'
import {
  providerTemplateService,
  PROVIDER_TEMPLATES
} from '@core/services/provider-template.service'
import { SecureStorageService } from '../../services/secure-storage.service'
import type {
  ProviderTemplateListResponse,
  ProviderConfigListResponse,
  ProviderConfigResponse,
  TestProviderConfigResponse,
  SaveProviderConfigRequest,
  UserProviderConfig
} from '@shared/types/provider-template.types'

/**
 * 广播配置变化事件到所有窗口
 */
function broadcastConfigChanged(): void {
  const windows = BrowserWindow.getAllWindows()
  for (const window of windows) {
    window.webContents.send('provider-config:changed')
  }
}

/**
 * 注册提供商配置相关 IPC 处理器
 */
export function registerProviderConfigHandlers(): void {
  ipcMain.handle('provider-template:list', handleListTemplates)
  ipcMain.handle('provider-config:list', handleListConfigs)
  ipcMain.handle('provider-config:get', handleGetConfig)
  ipcMain.handle('provider-config:create', handleCreateConfig)
  ipcMain.handle('provider-config:update', handleUpdateConfig)
  ipcMain.handle('provider-config:delete', handleDeleteConfig)
  ipcMain.handle('provider-config:test', handleTestConfig)
  ipcMain.handle('provider-config:set-default', handleSetDefault)
}

/**
 * 处理获取模板列表请求
 */
async function handleListTemplates(event: IpcMainInvokeEvent): Promise<ProviderTemplateListResponse> {
  try {
    return {
      success: true,
      templates: PROVIDER_TEMPLATES
    }
  } catch (error) {
    console.error('获取模板列表失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理获取配置列表请求
 */
async function handleListConfigs(event: IpcMainInvokeEvent): Promise<ProviderConfigListResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.providerConfigs) {
      return { success: true, configs: [] }
    }

    const configs = await dbManager.providerConfigs.getAll()

    // 隐藏 API 密钥
    const safeConfigs = configs.map((config) => ({
      ...config,
      apiKey: config.apiKey ? '******' : undefined,
      accessKeySecret: config.accessKeySecret ? '******' : undefined
    }))

    return { success: true, configs: safeConfigs }
  } catch (error) {
    console.error('获取配置列表失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理获取单个配置请求
 */
async function handleGetConfig(
  event: IpcMainInvokeEvent,
  configId: string
): Promise<ProviderConfigResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    const config = await dbManager.providerConfigs.getById(configId)
    if (!config) {
      return { success: false, error: '配置不存在' }
    }

    // 隐藏 API 密钥
    const safeConfig = {
      ...config,
      apiKey: config.apiKey ? '******' : undefined,
      accessKeySecret: config.accessKeySecret ? '******' : undefined
    }

    return { success: true, config: safeConfig }
  } catch (error) {
    console.error('获取配置失败:', error)
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
  request: SaveProviderConfigRequest
): Promise<ProviderConfigResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    // 验证模板是否存在
    const template = providerTemplateService.getTemplateById(request.templateId)
    if (!template) {
      return { success: false, error: '模板不存在' }
    }

    // 加密 API 密钥
    let encryptedApiKey: string | undefined
    if (request.apiKey) {
      const secureStorage = SecureStorageService.getInstance()
      if (!secureStorage.isInitialized()) {
        await secureStorage.initialize()
      }
      encryptedApiKey = secureStorage.encrypt(request.apiKey)
    }

    // 加密 Access Key Secret
    let encryptedAccessKeySecret: string | undefined
    if (request.accessKeySecret) {
      const secureStorage = SecureStorageService.getInstance()
      if (!secureStorage.isInitialized()) {
        await secureStorage.initialize()
      }
      encryptedAccessKeySecret = secureStorage.encrypt(request.accessKeySecret)
    }

    // 如果设置为默认，先清除其他默认
    if (request.isDefault) {
      const existingConfigs = await dbManager.providerConfigs.getAll()
      for (const config of existingConfigs) {
        if (config.isDefault) {
          await dbManager.providerConfigs.update(config.id, { isDefault: false })
        }
      }
    }

    // 创建配置
    const config = await dbManager.providerConfigs.create({
      templateId: request.templateId,
      name: request.name,
      shortId: request.shortId,
      apiKey: encryptedApiKey,
      accessKeyId: request.accessKeyId,
      accessKeySecret: encryptedAccessKeySecret,
      baseUrl: request.baseUrl,
      imageBaseUrl: request.imageBaseUrl,
      videoBaseUrl: request.videoBaseUrl,
      audioBaseUrl: request.audioBaseUrl,
      customHeaders: request.customHeaders,
      customParams: request.customParams,
      models: request.models,
      isEnabled: request.isEnabled ?? true,
      isDefault: request.isDefault ?? false
    })

    // 广播配置变化事件
    broadcastConfigChanged()

    // 返回时隐藏 API 密钥
    const safeConfig = {
      ...config,
      apiKey: config.apiKey ? '******' : undefined,
      accessKeySecret: config.accessKeySecret ? '******' : undefined
    }

    return { success: true, config: safeConfig }
  } catch (error) {
    console.error('创建配置失败:', error)
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
  request: { id: string; data: Partial<SaveProviderConfigRequest> }
): Promise<ProviderConfigResponse> {
  try {
    const { id, data } = request
    const dbManager = getDatabaseManager()
    if (!dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    // 检查配置是否存在
    const existing = await dbManager.providerConfigs.getById(id)
    if (!existing) {
      return { success: false, error: '配置不存在' }
    }

    // 准备更新数据
    const updates: Partial<UserProviderConfig> = {}

    if (data.name !== undefined) updates.name = data.name
    if (data.shortId !== undefined) updates.shortId = data.shortId
    if (data.baseUrl !== undefined) updates.baseUrl = data.baseUrl
    if (data.imageBaseUrl !== undefined) updates.imageBaseUrl = data.imageBaseUrl
    if (data.videoBaseUrl !== undefined) updates.videoBaseUrl = data.videoBaseUrl
    if (data.audioBaseUrl !== undefined) updates.audioBaseUrl = data.audioBaseUrl
    if (data.customHeaders !== undefined) updates.customHeaders = data.customHeaders
    if (data.customParams !== undefined) updates.customParams = data.customParams
    if (data.models !== undefined) updates.models = data.models
    if (data.isEnabled !== undefined) updates.isEnabled = data.isEnabled
    if (data.isDefault !== undefined) updates.isDefault = data.isDefault

    // 处理 API 密钥更新
    if (data.apiKey !== undefined) {
      if (data.apiKey && data.apiKey !== '******') {
        const secureStorage = SecureStorageService.getInstance()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        updates.apiKey = secureStorage.encrypt(data.apiKey)
      } else if (data.apiKey === '') {
        updates.apiKey = undefined
      }
    }

    // 处理 Access Key ID 更新
    if (data.accessKeyId !== undefined) {
      updates.accessKeyId = data.accessKeyId || undefined
    }

    // 处理 Access Key Secret 更新
    if (data.accessKeySecret !== undefined) {
      if (data.accessKeySecret && data.accessKeySecret !== '******') {
        const secureStorage = SecureStorageService.getInstance()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        updates.accessKeySecret = secureStorage.encrypt(data.accessKeySecret)
      } else if (data.accessKeySecret === '') {
        updates.accessKeySecret = undefined
      }
    }

    // 如果设置为默认，先清除其他默认
    if (data.isDefault) {
      const allConfigs = await dbManager.providerConfigs.getAll()
      for (const config of allConfigs) {
        if (config.isDefault && config.id !== id) {
          await dbManager.providerConfigs.update(config.id, { isDefault: false })
        }
      }
    }

    const config = await dbManager.providerConfigs.update(id, updates)
    if (!config) {
      return { success: false, error: '更新失败' }
    }

    // 广播配置变化事件
    broadcastConfigChanged()

    // 返回时隐藏 API 密钥
    const safeConfig = {
      ...config,
      apiKey: config.apiKey ? '******' : undefined,
      accessKeySecret: config.accessKeySecret ? '******' : undefined
    }

    return { success: true, config: safeConfig }
  } catch (error) {
    console.error('更新配置失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 处理删除配置请求
 */
async function handleDeleteConfig(
  event: IpcMainInvokeEvent,
  configId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    const deleted = await dbManager.providerConfigs.delete(configId)
    if (deleted) {
      // 广播配置变化事件
      broadcastConfigChanged()
    }
    return { success: deleted }
  } catch (error) {
    console.error('删除配置失败:', error)
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
  request: {
    configId?: string
    templateId?: string
    apiKey?: string
    accessKeyId?: string
    accessKeySecret?: string
    baseUrl?: string
  }
): Promise<TestProviderConfigResponse> {
  try {
    const { configId, templateId, apiKey, accessKeyId, accessKeySecret, baseUrl } = request

    let testTemplateId = templateId
    let testApiKey = apiKey
    let testAccessKeyId = accessKeyId
    let testAccessKeySecret = accessKeySecret
    let testBaseUrl = baseUrl

    // 如果提供了配置 ID，从数据库获取配置
    if (configId) {
      const dbManager = getDatabaseManager()
      if (!dbManager.providerConfigs) {
        return { success: false, message: '数据库未初始化' }
      }

      const config = await dbManager.providerConfigs.getById(configId)
      if (!config) {
        return { success: false, message: '配置不存在' }
      }

      testTemplateId = config.templateId
      testBaseUrl = testBaseUrl || config.baseUrl
      testAccessKeyId = testAccessKeyId || config.accessKeyId

      // 解密 API 密钥
      if (config.apiKey) {
        const secureStorage = SecureStorageService.getInstance()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        testApiKey = testApiKey || secureStorage.decrypt(config.apiKey)
      }

      // 解密 Access Key Secret
      if (config.accessKeySecret) {
        const secureStorage = SecureStorageService.getInstance()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        testAccessKeySecret = testAccessKeySecret || secureStorage.decrypt(config.accessKeySecret)
      }

      // 测试连接
      const result = await providerTemplateService.testConnection({
        templateId: testTemplateId,
        apiKey: testApiKey,
        accessKeyId: testAccessKeyId,
        accessKeySecret: testAccessKeySecret,
        baseUrl: testBaseUrl
      })

      // 更新测试结果
      // 获取模板中定义的有效模型 ID 列表
      const template = providerTemplateService.getTemplateById(testTemplateId)
      const templateModels = template?.models.map(m => m.id)

      await dbManager.providerConfigs.updateTestResult(
        configId,
        result.success ? 'success' : 'failed',
        result.models,
        templateModels
      )

      return result
    }

    // 直接测试（未保存的配置）
    if (!testTemplateId) {
      return { success: false, message: '请提供模板 ID 或配置 ID' }
    }

    return await providerTemplateService.testConnection({
      templateId: testTemplateId,
      apiKey: testApiKey,
      accessKeyId: testAccessKeyId,
      accessKeySecret: testAccessKeySecret,
      baseUrl: testBaseUrl
    })
  } catch (error) {
    console.error('测试配置失败:', error)
    return {
      success: false,
      message: String(error)
    }
  }
}

/**
 * 处理设置默认配置请求
 */
async function handleSetDefault(
  event: IpcMainInvokeEvent,
  configId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await dbManager.providerConfigs.setDefault(configId)
    if (success) {
      // 广播配置变化事件
      broadcastConfigChanged()
    }
    return { success }
  } catch (error) {
    console.error('设置默认配置失败:', error)
    return {
      success: false,
      error: String(error)
    }
  }
}

/**
 * 注销提供商配置相关 IPC 处理器
 */
export function unregisterProviderConfigHandlers(): void {
  ipcMain.removeHandler('provider-template:list')
  ipcMain.removeHandler('provider-config:list')
  ipcMain.removeHandler('provider-config:get')
  ipcMain.removeHandler('provider-config:create')
  ipcMain.removeHandler('provider-config:update')
  ipcMain.removeHandler('provider-config:delete')
  ipcMain.removeHandler('provider-config:test')
  ipcMain.removeHandler('provider-config:set-default')
}
