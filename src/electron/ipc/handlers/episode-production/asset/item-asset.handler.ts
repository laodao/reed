/**
 * episode-production · 物品资产绑定 · IPC handler
 * @module electron/ipc/handlers/episode-production/asset/item-asset.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'

export function registerItemAssetHandlers(): void {
  // ==================== 物品绑定 ====================
  ipcBridge.handle('ep:get-item-bindings', handleGetItemBindings)
  ipcBridge.handle('ep:bind-item', handleBindItem)
  ipcBridge.handle('ep:update-item-binding', handleUpdateItemBinding)
  ipcBridge.handle('ep:delete-item-binding', handleDeleteItemBinding)
}

// ==================== 物品绑定处理器 ====================

async function handleGetItemBindings(
  _event: any,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.itemBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const bindings = await db.itemBindings.getByProjectId(projectId)
    return { success: true, data: bindings }
  } catch (error: any) {
    return { success: false, error: error.message || '获取物品绑定列表失败' }
  }
}

async function handleBindItem(
  _event: any,
  projectId: string,
  longWritingItemId: string,
  itemName: string,
  imagePaths?: string[],
  generateConfig?: any,
  generateImages?: boolean
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.itemBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 检查是否已存在绑定
    const existing = await db.itemBindings.getByLongWritingItemId(projectId, longWritingItemId)

    if (existing) {
      // 更新现有绑定
      const updated = await db.itemBindings.update(existing.id, {
        imagePaths,
        generateConfig,
        generateImages
      })
      return { success: true, data: updated }
    }

    // 创建新绑定
    const binding = await db.itemBindings.create({
      projectId,
      longWritingItemId,
      itemName,
      imagePaths,
      generateConfig,
      generateImages
    })
    return { success: true, data: binding }
  } catch (error: any) {
    return { success: false, error: error.message || '绑定物品失败' }
  }
}

async function handleUpdateItemBinding(
  _event: any,
  bindingId: string,
  data: { imagePaths?: string[]; thumbnailPath?: string | null; generateConfig?: any | null; generateImages?: boolean }
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.itemBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const updated = await db.itemBindings.update(bindingId, data)
    if (!updated) {
      return { success: false, error: '物品绑定不存在' }
    }
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message || '更新物品绑定失败' }
  }
}

async function handleDeleteItemBinding(
  _event: any,
  bindingId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.itemBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.itemBindings.delete(bindingId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除物品绑定失败' }
  }
}
