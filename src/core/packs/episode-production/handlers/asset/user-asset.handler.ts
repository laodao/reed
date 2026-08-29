/**
 * episode-production · 跨项目角色库 IPC handler
 * @module core/packs/episode-production/handlers/asset/user-asset.handler
 *
 * spec 2026-05-09 ep-redesign §3.2 D2 · P-7
 *
 * 5 个 IPC：
 *   - ep:user-asset:list                  列我的库
 *   - ep:user-asset:add-from-binding      "加入我的库"
 *   - ep:user-asset:create-binding        "从我的库引用"到新项目
 *   - ep:user-asset:delete                删库 + 目录
 *   - ep:user-asset:get                   单个查询（用于 UI 详情）
 *
 * 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import path from 'path'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { getCurrentUserId } from '@core/context/user-context'
import type { IpcResponse } from '@shared/types/ipc.types'
import { UserAssetService } from '@core/modules/episode-production/user-asset/user-asset.service'

export function registerUserAssetHandlers(): void {
  ipcBridge.handle('ep:user-asset:list', handleList)
  ipcBridge.handle('ep:user-asset:add-from-binding', handleAddFromBinding)
  ipcBridge.handle('ep:user-asset:create-binding', handleCreateBinding)
  ipcBridge.handle('ep:user-asset:delete', handleDelete)
}

function userAssetStorageRoot(): string {
  return path.join(getPathProvider().getUserDataPath(), 'user-assets')
}

function projectAssetStorageRoot(): string {
  return path.join(getPathProvider().getUserDataPath(), 'asset-images')
}

async function handleList(
  _event: any,
  input: { assetType?: 'character' | 'location' | 'item'; keyword?: string } = {},
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new UserAssetService(db.dataSource)
    const data = await svc.listLibrary({
      assetType: input.assetType,
      keyword: input.keyword,
      userId: getCurrentUserId(),
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAddFromBinding(
  _event: any,
  input: { bindingId: string; bindingType: 'character' | 'location' | 'item' },
): Promise<IpcResponse> {
  try {
    if (!input?.bindingId || !input?.bindingType) {
      return { success: false, error: '参数不完整：bindingId / bindingType 必填' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new UserAssetService(db.dataSource)
    const data = await svc.addToLibrary({
      bindingId: input.bindingId,
      bindingType: input.bindingType,
      storageRoot: userAssetStorageRoot(),
      userId: getCurrentUserId(),
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleCreateBinding(
  _event: any,
  input: { userAssetId: string; targetProjectId: string },
): Promise<IpcResponse> {
  try {
    if (!input?.userAssetId || !input?.targetProjectId) {
      return { success: false, error: '参数不完整：userAssetId / targetProjectId 必填' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new UserAssetService(db.dataSource)
    const data = await svc.createFromLibrary({
      userAssetId: input.userAssetId,
      targetProjectId: input.targetProjectId,
      projectAssetRoot: projectAssetStorageRoot(),
      userId: getCurrentUserId(),
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleDelete(
  _event: any,
  input: { userAssetId: string },
): Promise<IpcResponse> {
  try {
    if (!input?.userAssetId) {
      return { success: false, error: '参数不完整：userAssetId 必填' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new UserAssetService(db.dataSource)
    await svc.deleteFromLibrary({
      userAssetId: input.userAssetId,
      storageRoot: userAssetStorageRoot(),
      userId: getCurrentUserId(),
    })
    return { success: true, data: { deleted: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
