/**
 * OSS 配置 IPC 处理器
 * @module ipc/handlers/oss.handler
 * @description 处理图床/OSS配置相关的 IPC 请求
 */

import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { DatabaseManager } from '../../database/index'
import { OSSService } from '../../services/oss.service'
import { SecureStorageService } from '../../services/secure-storage.service'
import type { IpcResponse } from '../../../shared/types/ipc.types'
import type {
  OSSConfig,
  CreateOSSConfigRequest,
  UpdateOSSConfigRequest,
  OSSUploadRequest
} from '../../../shared/types/oss.types'

/**
 * 注册 OSS 相关 IPC 处理器
 */
export function registerOSSHandlers(): void {
  // 配置管理
  ipcMain.handle('oss:list-configs', handleListConfigs)
  ipcMain.handle('oss:get-config', handleGetConfig)
  ipcMain.handle('oss:create-config', handleCreateConfig)
  ipcMain.handle('oss:update-config', handleUpdateConfig)
  ipcMain.handle('oss:delete-config', handleDeleteConfig)
  ipcMain.handle('oss:set-default', handleSetDefault)
  ipcMain.handle('oss:toggle-enabled', handleToggleEnabled)
  ipcMain.handle('oss:test-connection', handleTestConnection)

  // 文件上传
  ipcMain.handle('oss:upload-file', handleUploadFile)

  console.log('[OSSHandlers] OSS 配置 IPC 处理器已注册')
}

/**
 * 获取所有 OSS 配置
 */
async function handleListConfigs(_event: IpcMainInvokeEvent): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.ossConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    const configs = db.ossConfigs.getAll()

    // 隐藏敏感信息
    const safeConfigs = configs.map(config => ({
      ...config,
      accessKeySecret: '******' // 不返回密钥
    }))

    return { success: true, data: safeConfigs }
  } catch (error: any) {
    return { success: false, error: error.message || '获取配置失败' }
  }
}

/**
 * 获取单个 OSS 配置
 */
async function handleGetConfig(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.ossConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    const config = db.ossConfigs.getById(id)
    if (!config) {
      return { success: false, error: '配置不存在' }
    }

    // 隐藏敏感信息
    const safeConfig = {
      ...config,
      accessKeySecret: '******'
    }

    return { success: true, data: safeConfig }
  } catch (error: any) {
    return { success: false, error: error.message || '获取配置失败' }
  }
}

/**
 * 创建 OSS 配置
 */
async function handleCreateConfig(
  _event: IpcMainInvokeEvent,
  request: CreateOSSConfigRequest
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.ossConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    // 加密密钥
    const secureStorage = SecureStorageService.getInstance()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }
    const encryptedSecret = secureStorage.encrypt(request.accessKeySecret)

    // 生成 ID
    const id = `oss_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // 创建配置
    const config = db.ossConfigs.create({
      id,
      ...request,
      accessKeySecret: encryptedSecret
    })

    // 返回不含密钥的配置
    const safeConfig = {
      ...config,
      accessKeySecret: '******'
    }

    return { success: true, data: safeConfig }
  } catch (error: any) {
    return { success: false, error: error.message || '创建配置失败' }
  }
}

/**
 * 更新 OSS 配置
 */
async function handleUpdateConfig(
  _event: IpcMainInvokeEvent,
  request: UpdateOSSConfigRequest
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.ossConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    // 如果有新密钥，需要加密
    let updateData: any = { ...request }
    if (request.accessKeySecret) {
      const secureStorage = SecureStorageService.getInstance()
      if (!secureStorage.isInitialized()) {
        await secureStorage.initialize()
      }
      updateData.accessKeySecret = secureStorage.encrypt(request.accessKeySecret)
    }

    const success = db.ossConfigs.update(request.id, updateData)
    if (!success) {
      return { success: false, error: '更新配置失败' }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || '更新配置失败' }
  }
}

/**
 * 删除 OSS 配置
 */
async function handleDeleteConfig(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.ossConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = db.ossConfigs.delete(id)
    if (!success) {
      return { success: false, error: '删除配置失败' }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || '删除配置失败' }
  }
}

/**
 * 设置默认配置
 */
async function handleSetDefault(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.ossConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = db.ossConfigs.setDefault(id)
    if (!success) {
      return { success: false, error: '设置默认配置失败' }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || '设置默认配置失败' }
  }
}

/**
 * 切换启用状态
 */
async function handleToggleEnabled(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.ossConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = db.ossConfigs.toggleEnabled(id)
    if (!success) {
      return { success: false, error: '切换状态失败' }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || '切换状态失败' }
  }
}

/**
 * 测试 OSS 连接
 */
async function handleTestConnection(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse> {
  try {
    const ossService = OSSService.getInstance()
    const result = await ossService.testConnection(id)

    return { success: result.success, data: result }
  } catch (error: any) {
    return { success: false, error: error.message || '测试连接失败' }
  }
}

/**
 * 上传文件到 OSS
 */
async function handleUploadFile(
  _event: IpcMainInvokeEvent,
  request: OSSUploadRequest
): Promise<IpcResponse> {
  try {
    const ossService = OSSService.getInstance()
    const result = await ossService.uploadFile(request)

    return { success: result.success, data: result }
  } catch (error: any) {
    return { success: false, error: error.message || '上传失败' }
  }
}