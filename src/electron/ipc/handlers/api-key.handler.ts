/**
 * API密钥IPC处理器
 * @module ipc/handlers/api-key
 * @description 处理API密钥相关的IPC请求
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { SetApiKeyResponse, ListApiKeysResponse, TestApiKeyResponse, ApiKeyInfo } from '@shared/types'
import { SecureStorageService } from '../../services/secure-storage.service'

/**
 * 预定义的提供商列表
 */
const PROVIDERS = [
  { provider: 'openai', name: 'OpenAI' },
  { provider: 'anthropic', name: 'Anthropic (Claude)' },
  { provider: 'google', name: 'Google (Gemini)' },
  { provider: 'glm', name: '智谱 AI' },
  { provider: 'deepseek', name: 'DeepSeek' },
  { provider: 'volcengine', name: '火山引擎' }
]

/**
 * 注册API密钥相关IPC处理器
 */
export function registerApiKeyHandlers(): void {
  ipcBridge.handle('api-key:list', handleListApiKeys)
  ipcBridge.handle('api-key:set', handleSetApiKey)
  ipcBridge.handle('api-key:delete', handleDeleteApiKey)
  ipcBridge.handle('api-key:test', handleTestApiKey)
}

/**
 * 处理获取密钥列表请求
 */
async function handleListApiKeys(_event: any): Promise<ListApiKeysResponse> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.apiKeys) {
      return { success: true, keys: PROVIDERS.map(p => ({ provider: p.provider, name: p.name, configured: false })) }
    }

    const configuredKeys = await dbManager.apiKeys.getAll()
    const configuredSet = new Set(configuredKeys.map(k => k.provider))

    const keys: ApiKeyInfo[] = PROVIDERS.map(p => ({
      provider: p.provider,
      name: p.name,
      configured: configuredSet.has(p.provider),
      hasEndpoint: configuredKeys.find(k => k.provider === p.provider)?.hasEndpoint || false
    }))

    return { success: true, keys }
  } catch (error) {
    console.error('获取API密钥列表失败:', error)
    return { success: false, keys: [] }
  }
}

/**
 * 处理设置密钥请求
 */
async function handleSetApiKey(
  _event: any,
  request: { provider: string; key: string; endpoint?: string }
): Promise<SetApiKeyResponse> {
  try {
    const { provider, key, endpoint } = request

    if (!key || key.trim() === '') {
      return { success: false, error: 'API密钥不能为空' }
    }

    const dbManager = getCoreDatabaseManager()
    if (!dbManager.apiKeys) {
      return { success: false, error: '数据库未初始化' }
    }

    // 初始化安全存储
    const secureStorage = SecureStorageService.getInstance()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }

    // 加密密钥
    const encryptedKey = secureStorage.encrypt(key.trim())

    // 保存到数据库
    await dbManager.apiKeys.save(provider, encryptedKey, endpoint)

    return { success: true }
  } catch (error) {
    console.error('设置API密钥失败:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理删除密钥请求
 */
async function handleDeleteApiKey(
  _event: any,
  request: { provider: string }
): Promise<{ success: boolean }> {
  try {
    const { provider } = request

    const dbManager = getCoreDatabaseManager()
    if (!dbManager.apiKeys) {
      return { success: false }
    }

    await dbManager.apiKeys.delete(provider)
    return { success: true }
  } catch (error) {
    console.error('删除API密钥失败:', error)
    return { success: false }
  }
}

/**
 * 处理测试密钥请求
 */
async function handleTestApiKey(
  _event: any,
  request: { provider: string }
): Promise<TestApiKeyResponse> {
  try {
    const { provider } = request

    const dbManager = getCoreDatabaseManager()
    if (!dbManager.apiKeys) {
      return { success: false, message: '数据库未初始化' }
    }

    // 检查密钥是否存在
    const exists = await dbManager.apiKeys.exists(provider)
    if (!exists) {
      return { success: false, message: '未找到API密钥配置' }
    }

    // TODO: 实现实际的 API 连接测试
    // 目前只返回成功
    return { success: true, message: 'API密钥已配置' }
  } catch (error) {
    console.error('测试API密钥失败:', error)
    return { success: false, message: String(error) }
  }
}

/**
 * 注销API密钥相关IPC处理器
 */
export function unregisterApiKeyHandlers(): void {
  ipcBridge.removeHandler('api-key:list')
  ipcBridge.removeHandler('api-key:set')
  ipcBridge.removeHandler('api-key:delete')
  ipcBridge.removeHandler('api-key:test')
}
