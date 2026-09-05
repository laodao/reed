/**
 * episode-production · 地点资产绑定 · IPC handler
 * @module core/packs/episode-production/handlers/asset/location-asset.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：V2 地点绑定（保留：老 UI 在用）+ V2.5 资产域 channel（ep:asset:location:* · 走
 *      LocationAssetService 双源投影 + 变体降级 pickBestVariant）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  LocationAssetService,
  type CreateStandaloneLocationInput,
  type CreateLinkedLwLocationInput,
  type LocationOverridePatch,
  type LocationStandalonePatch,
  type LocationExtraPatch,
  type PickVariantInput,
} from '@core/modules/episode-production/assets/services/location-asset.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'

export function registerLocationAssetHandlers(): void {
  // ==================== V2 地点绑定（保留：老 UI 在用） ====================
  ipcBridge.handle('ep:get-location-bindings', handleGetLocationBindings)
  ipcBridge.handle('ep:bind-location', handleBindLocation)
  ipcBridge.handle('ep:update-location-binding', handleUpdateLocationBinding)
  ipcBridge.handle('ep:delete-location-binding', handleDeleteLocationBinding)

  // ==================== V2.5 资产域：LocationAssetService 包装 ====================
  ipcBridge.handle('ep:asset:location:list', handleAssetLocationList)
  ipcBridge.handle('ep:asset:location:get', handleAssetLocationGet)
  ipcBridge.handle('ep:asset:location:effective', handleAssetLocationEffective)
  ipcBridge.handle('ep:asset:location:create-standalone', handleAssetLocationCreateStandalone)
  ipcBridge.handle('ep:asset:location:create-linked-lw', handleAssetLocationCreateLinkedLw)
  ipcBridge.handle('ep:asset:location:pick-best-variant', handleAssetLocationPickBestVariant)
  ipcBridge.handle('ep:asset:location:update-override', handleAssetLocationUpdateOverride)
  ipcBridge.handle('ep:asset:location:update-standalone', handleAssetLocationUpdateStandalone)
  // FU5-C3 场景类型 + 规模 + 氛围 + 风格锚点 + 默认时间/天气
  ipcBridge.handle('ep:asset:location:update-extra', handleAssetLocationUpdateExtra)
  ipcBridge.handle('ep:asset:location:delete', handleAssetLocationDelete)
}

/** 取 DataSource；未初始化则抛错 */
function requireDataSource() {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) {
    throw new Error('数据库未初始化')
  }
  return db.dataSource
}

/** 构造 LocationAssetService（注入 AssetImageService 用于 pickBestVariant） */
function buildLocationService(): LocationAssetService {
  const ds = requireDataSource()
  return new LocationAssetService(ds, new AssetImageService(ds))
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

// ==================== V2.5 资产域处理器 · 走 LocationAssetService ====================

async function handleAssetLocationList(
  _event: any,
  projectId: string,
): Promise<IpcResponse> {
  try {
    const data = await buildLocationService().listByProject(projectId)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetLocationGet(
  _event: any,
  id: string,
): Promise<IpcResponse> {
  try {
    const data = await buildLocationService().getById(id)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetLocationEffective(
  _event: any,
  id: string,
): Promise<IpcResponse> {
  try {
    const data = await buildLocationService().getEffectiveData(id)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetLocationCreateStandalone(
  _event: any,
  input: CreateStandaloneLocationInput,
): Promise<IpcResponse> {
  try {
    const data = await buildLocationService().createStandalone(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetLocationCreateLinkedLw(
  _event: any,
  input: CreateLinkedLwLocationInput,
): Promise<IpcResponse> {
  try {
    const data = await buildLocationService().createLinkedLw(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetLocationPickBestVariant(
  _event: any,
  bindingId: string,
  input: PickVariantInput,
): Promise<IpcResponse> {
  try {
    const data = await buildLocationService().pickBestVariant(bindingId, input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetLocationUpdateOverride(
  _event: any,
  id: string,
  override: LocationOverridePatch,
): Promise<IpcResponse> {
  try {
    await buildLocationService().updateOverride(id, override)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetLocationUpdateStandalone(
  _event: any,
  id: string,
  patch: LocationStandalonePatch,
): Promise<IpcResponse> {
  try {
    await buildLocationService().updateStandalone(id, patch)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetLocationUpdateExtra(
  _event: any,
  id: string,
  patch: LocationExtraPatch,
): Promise<IpcResponse> {
  try {
    await buildLocationService().updateExtra(id, patch)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetLocationDelete(
  _event: any,
  id: string,
): Promise<IpcResponse> {
  try {
    await buildLocationService().delete(id)
    return { success: true, data: { deleted: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
