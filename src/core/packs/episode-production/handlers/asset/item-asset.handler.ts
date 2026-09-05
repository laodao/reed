/**
 * episode-production · 物品资产绑定 · IPC handler
 * @module core/packs/episode-production/handlers/asset/item-asset.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：V2 物品绑定（保留：老 UI 在用）+ V2.5 资产域 channel（ep:asset:item:* · 走
 *      ItemAssetService 双源投影）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  ItemAssetService,
  type CreateStandaloneItemInput,
  type CreateLinkedLwItemInput,
  type ItemOverridePatch,
  type ItemStandalonePatch,
} from '@core/modules/episode-production/assets/services/item-asset.service'

export function registerItemAssetHandlers(): void {
  // ==================== V2 物品绑定（保留：老 UI 在用） ====================
  ipcBridge.handle('ep:get-item-bindings', handleGetItemBindings)
  ipcBridge.handle('ep:bind-item', handleBindItem)
  ipcBridge.handle('ep:update-item-binding', handleUpdateItemBinding)
  ipcBridge.handle('ep:delete-item-binding', handleDeleteItemBinding)

  // ==================== V2.5 资产域：ItemAssetService 包装 ====================
  ipcBridge.handle('ep:asset:item:list', handleAssetItemList)
  ipcBridge.handle('ep:asset:item:get', handleAssetItemGet)
  ipcBridge.handle('ep:asset:item:effective', handleAssetItemEffective)
  ipcBridge.handle('ep:asset:item:create-standalone', handleAssetItemCreateStandalone)
  ipcBridge.handle('ep:asset:item:create-linked-lw', handleAssetItemCreateLinkedLw)
  ipcBridge.handle('ep:asset:item:update-override', handleAssetItemUpdateOverride)
  ipcBridge.handle('ep:asset:item:update-standalone', handleAssetItemUpdateStandalone)
  ipcBridge.handle('ep:asset:item:update-extra', handleAssetItemUpdateExtra)
  ipcBridge.handle('ep:asset:item:delete', handleAssetItemDelete)
}

/** 取 DataSource；未初始化则抛错 */
function requireDataSource() {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) {
    throw new Error('数据库未初始化')
  }
  return db.dataSource
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

// ==================== V2.5 资产域处理器 · 走 ItemAssetService ====================

async function handleAssetItemList(
  _event: any,
  projectId: string,
): Promise<IpcResponse> {
  try {
    const svc = new ItemAssetService(requireDataSource())
    const data = await svc.listByProject(projectId)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetItemGet(
  _event: any,
  id: string,
): Promise<IpcResponse> {
  try {
    const svc = new ItemAssetService(requireDataSource())
    const data = await svc.getById(id)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetItemEffective(
  _event: any,
  id: string,
): Promise<IpcResponse> {
  try {
    const svc = new ItemAssetService(requireDataSource())
    const data = await svc.getEffectiveData(id)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetItemCreateStandalone(
  _event: any,
  input: CreateStandaloneItemInput,
): Promise<IpcResponse> {
  try {
    const svc = new ItemAssetService(requireDataSource())
    const data = await svc.createStandalone(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetItemCreateLinkedLw(
  _event: any,
  input: CreateLinkedLwItemInput,
): Promise<IpcResponse> {
  try {
    const svc = new ItemAssetService(requireDataSource())
    const data = await svc.createLinkedLw(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetItemUpdateOverride(
  _event: any,
  id: string,
  override: ItemOverridePatch,
): Promise<IpcResponse> {
  try {
    const svc = new ItemAssetService(requireDataSource())
    await svc.updateOverride(id, override)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetItemUpdateStandalone(
  _event: any,
  id: string,
  patch: ItemStandalonePatch,
): Promise<IpcResponse> {
  try {
    const svc = new ItemAssetService(requireDataSource())
    await svc.updateStandalone(id, patch)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetItemUpdateExtra(
  _event: any,
  id: string,
  patch: { styleAnchors?: string[] | null },
): Promise<IpcResponse> {
  try {
    const svc = new ItemAssetService(requireDataSource())
    await svc.updateExtra(id, patch)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetItemDelete(
  _event: any,
  id: string,
): Promise<IpcResponse> {
  try {
    const svc = new ItemAssetService(requireDataSource())
    await svc.delete(id)
    return { success: true, data: { deleted: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
