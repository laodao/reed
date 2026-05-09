/**
 * episode-production · 资产统一图谱（asset_image） · IPC handler
 * @module electron/ipc/handlers/episode-production/asset/asset-image.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * V2.5 新增 channel（ep:asset:image:* · 走 AssetImageService）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  AssetImageService,
  type AssetType,
  type AssetImageCategory,
  type AddImageInput,
} from '@core/modules/episode-production/assets/services/asset-image.service'
import {
  MainImageGeneratorService,
  type GenerateMainInput,
} from '@core/modules/episode-production/assets/services/main-image-generator.service'
import {
  MainImageUploadService,
  MainImageUploadValidationError,
} from '@core/modules/episode-production/assets/services/main-image-upload.service'
import { createGalleryImageGenerator } from '@core/modules/episode-production/assets/services/image-provider-adapter'
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
  ipcBridge.handle('ep:asset:image:generate-main', handleGenerateMain)
  ipcBridge.handle('ep:asset:image:upload-main-file', handleUploadMainFile)
  // spec 2026-05-09 多主图模型新增 channel
  ipcBridge.handle('ep:asset:image:add-main', handleAddAdditionalMain)
  ipcBridge.handle('ep:asset:image:switch-main', handleSwitchDefaultMain)
  ipcBridge.handle('ep:asset:image:update-metadata', handleUpdateMetadata)
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

async function handleGenerateMain(
  _event: any,
  input: GenerateMainInput,
): Promise<IpcResponse> {
  try {
    const ds = requireDataSource()
    const imageSvc = new AssetImageService(ds)
    const svc = new MainImageGeneratorService(
      imageSvc,
      createGalleryImageGenerator(),
      ds,
    )
    const data = await svc.generateMain(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleUploadMainFile(
  _event: any,
  input: {
    fileName: string
    base64: string
    assetType: AssetType
    assetId: string
  },
): Promise<IpcResponse> {
  try {
    const ds = requireDataSource()
    const imageSvc = new AssetImageService(ds)
    const svc = new MainImageUploadService(getPathProvider(), imageSvc)
    const data = await svc.upload({
      buffer: Buffer.from(input.base64, 'base64'),
      fileName: input.fileName,
      assetType: input.assetType,
      assetId: input.assetId,
    })
    return { success: true, data }
  } catch (err: any) {
    if (err instanceof MainImageUploadValidationError) {
      return { success: false, error: `[${err.code}] ${err.message}` }
    }
    return { success: false, error: err?.message ?? String(err) }
  }
}

/**
 * spec 2026-05-09 多主图模型 IPC：在已有主图基础上追加一张新主图。
 * 与 generate-main 区别：不降级旧主图；新主图 isMain=0（除非显式 makeDefault=true）。
 */
async function handleAddAdditionalMain(
  _event: any,
  input: GenerateMainInput & {
    label: string
    makeDefault?: boolean
    metadata?: Record<string, unknown> | null
  },
): Promise<IpcResponse> {
  try {
    const ds = requireDataSource()
    const imageSvc = new AssetImageService(ds)
    const svc = new MainImageGeneratorService(
      imageSvc,
      createGalleryImageGenerator(),
      ds,
    )
    const data = await svc.addAdditionalMain(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

/**
 * 切换默认主图（多主图模型下 is_main=1 标记的归属）。
 * 不动 category（不像 setAsMain 会强制降旧主图为 view）。
 */
async function handleSwitchDefaultMain(
  _event: any,
  imageId: string,
): Promise<IpcResponse> {
  try {
    await buildService().switchDefaultMain(imageId)
    return { success: true, data: { switched: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

/**
 * 更新单图 metadata（angle/time/weather/...）让评分系统按维度命中。
 */
async function handleUpdateMetadata(
  _event: any,
  imageId: string,
  metadata: Record<string, unknown> | null,
): Promise<IpcResponse> {
  try {
    await buildService().updateMetadata(imageId, metadata)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
