/**
 * episode-production · 资产统一图谱（asset_image） · IPC handler
 * @module electron/ipc/handlers/episode-production/asset/asset-image.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * V2.5 新增 channel（ep:asset:image:* · 走 AssetImageService）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  AssetImageService,
  type AssetType,
  type AssetImageCategory,
  type AddImageInput,
} from '@core/modules/episode-production/assets/services/asset-image.service'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

/** updateImage 接受的 patch 子集（与 AssetImageService.updateImage 第二参一致） */
type UpdateImagePatch = Partial<
  Pick<
    AssetImageEntity,
    | 'label'
    | 'prompt'
    | 'negativePrompt'
    | 'imagePath'
    | 'thumbnailPath'
    | 'sortOrder'
    | 'metadata'
    | 'derivedFromImageId'
  >
>

export function registerAssetImageHandlers(): void {
  ipcBridge.handle('ep:asset:image:list-by-asset', handleListByAsset)
  ipcBridge.handle('ep:asset:image:list-by-category', handleListByCategory)
  ipcBridge.handle('ep:asset:image:get-main', handleGetMain)
  ipcBridge.handle('ep:asset:image:add', handleAddImage)
  ipcBridge.handle('ep:asset:image:set-as-main', handleSetAsMain)
  ipcBridge.handle('ep:asset:image:delete', handleDeleteImage)
  ipcBridge.handle('ep:asset:image:update', handleUpdateImage)
}

/** 取 DataSource；未初始化则抛错 */
function requireDataSource() {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) {
    throw new Error('数据库未初始化')
  }
  return db.dataSource
}

function buildService(): AssetImageService {
  return new AssetImageService(requireDataSource())
}

async function handleListByAsset(
  _event: any,
  assetType: AssetType,
  assetId: string,
): Promise<IpcResponse> {
  try {
    const data = await buildService().listByAsset(assetType, assetId)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleListByCategory(
  _event: any,
  assetType: AssetType,
  assetId: string,
  category: AssetImageCategory,
): Promise<IpcResponse> {
  try {
    const data = await buildService().listByCategory(assetType, assetId, category)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleGetMain(
  _event: any,
  assetType: AssetType,
  assetId: string,
): Promise<IpcResponse> {
  try {
    const data = await buildService().getMainImage(assetType, assetId)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAddImage(
  _event: any,
  input: AddImageInput,
): Promise<IpcResponse> {
  try {
    const data = await buildService().addImage(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleSetAsMain(
  _event: any,
  imageId: string,
): Promise<IpcResponse> {
  try {
    await buildService().setAsMain(imageId)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleDeleteImage(
  _event: any,
  imageId: string,
): Promise<IpcResponse> {
  try {
    await buildService().deleteImage(imageId)
    return { success: true, data: { deleted: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleUpdateImage(
  _event: any,
  imageId: string,
  patch: UpdateImagePatch,
): Promise<IpcResponse> {
  try {
    await buildService().updateImage(imageId, patch)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
