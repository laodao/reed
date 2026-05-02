/**
 * episode-production · 地点资产绑定 · IPC handler
 * @module electron/ipc/handlers/episode-production/asset/location-asset.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'

export function registerLocationAssetHandlers(): void {
  // ==================== 地点绑定 ====================
  ipcBridge.handle('ep:get-location-bindings', handleGetLocationBindings)
  ipcBridge.handle('ep:bind-location', handleBindLocation)
  ipcBridge.handle('ep:update-location-binding', handleUpdateLocationBinding)
  ipcBridge.handle('ep:delete-location-binding', handleDeleteLocationBinding)
}

// ==================== 地点绑定处理器 ====================

async function handleGetLocationBindings(
  _event: any,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.locationBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const bindings = await db.locationBindings.getByProjectId(projectId)
    return { success: true, data: bindings }
  } catch (error: any) {
    return { success: false, error: error.message || '获取地点绑定列表失败' }
  }
}

async function handleBindLocation(
  _event: any,
  projectId: string,
  longWritingLocationId: string,
  locationName: string,
  imagePaths?: string[],
  generateConfig?: any,
  generateImages?: boolean
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.locationBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 检查是否已存在绑定
    const existing = await db.locationBindings.getByLongWritingLocationId(projectId, longWritingLocationId)

    if (existing) {
      // 更新现有绑定
      const updated = await db.locationBindings.update(existing.id, {
        imagePaths,
        generateConfig,
        generateImages
      })
      return { success: true, data: updated }
    }

    // 创建新绑定
    const binding = await db.locationBindings.create({
      projectId,
      longWritingLocationId,
      locationName,
      imagePaths,
      generateConfig,
      generateImages
    })
    return { success: true, data: binding }
  } catch (error: any) {
    return { success: false, error: error.message || '绑定地点失败' }
  }
}

async function handleUpdateLocationBinding(
  _event: any,
  bindingId: string,
  data: { imagePaths?: string[]; thumbnailPath?: string | null; generateConfig?: any | null; generateImages?: boolean }
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.locationBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const updated = await db.locationBindings.update(bindingId, data)
    if (!updated) {
      return { success: false, error: '地点绑定不存在' }
    }
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message || '更新地点绑定失败' }
  }
}

async function handleDeleteLocationBinding(
  _event: any,
  bindingId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.locationBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.locationBindings.delete(bindingId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除地点绑定失败' }
  }
}
