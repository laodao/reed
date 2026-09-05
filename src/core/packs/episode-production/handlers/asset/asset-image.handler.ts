/**
 * episode-production · 资产统一图谱（asset_image） · IPC handler
 * @module core/packs/episode-production/handlers/asset/asset-image.handler
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
  ipcBridge.handle('ep:asset:image:save-prompt', handleSavePrompt)
  ipcBridge.handle('ep:asset:image:generate-main', handleGenerateMain)
  ipcBridge.handle('ep:asset:image:upload-main-file', handleUploadMainFile)
  ipcBridge.handle('ep:asset:image:upload-main-add', handleUploadAdditionalMain)
  ipcBridge.handle('ep:asset:image:upload-ref', handleUploadRefImage)
  // spec 2026-05-09 多主图模型新增 channel
  ipcBridge.handle('ep:asset:image:add-main', handleAddAdditionalMain)
  ipcBridge.handle('ep:asset:image:switch-main', handleSwitchDefaultMain)
  ipcBridge.handle('ep:asset:image:update-metadata', handleUpdateMetadata)
  // spec 2026-05-09 ep-redesign §3.2 B3 · 角色多角度参考图（一键三视图）
  ipcBridge.handle('ep:asset:character:generate-three-views', handleGenerateThreeViews)
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
    // 带错误码 NOT_FOUND：前端据此区分"行已被删除/替换"做占位重建，
    // 不再依赖错误文案正则（文案一改回退逻辑会静默退化）。
    if (err?.message?.includes('不存在')) {
      return { success: false, code: 'NOT_FOUND', error: err?.message ?? String(err) }
    }
    return { success: false, error: err?.message ?? String(err) }
  }
}

/**
 * 保存某图集 slot 的提示词（有图更新行；无图创建占位行承载提示词）。
 * 解决"待生成资产提示词无法保存"：asset_image 尚无记录时也能落盘，
 * 生成主图时占位行会被复用（见 MainImageGeneratorService.generateMain）。
 */
async function handleSavePrompt(
  _event: any,
  input: {
    assetType: AssetType
    assetId: string
    category: AssetImageCategory
    label?: string | null
    prompt: string
  },
): Promise<IpcResponse> {
  try {
    const data = await buildService().savePrompt(input)
    return { success: true, data }
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
 * 上传参考图文件（不落 asset_image 行）：保存到 asset-images/ 返回相对路径，
 * 供"新增主图（换装）"把用户上传的图作为生成 reference。
 */
async function handleUploadRefImage(
  _event: any,
  input: { fileName: string; base64: string },
): Promise<IpcResponse> {
  try {
    const ds = requireDataSource()
    const imageSvc = new AssetImageService(ds)
    const svc = new MainImageUploadService(getPathProvider(), imageSvc)
    const data = await svc.saveReferenceFile({
      buffer: Buffer.from(input.base64, 'base64'),
      fileName: input.fileName,
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
 * 上传一张图作为"新增主图"（多主图模型：不替换旧主图，新图成为默认 isMain=1）。
 */
async function handleUploadAdditionalMain(
  _event: any,
  input: {
    fileName: string
    base64: string
    assetType: AssetType
    assetId: string
    label?: string | null
  },
): Promise<IpcResponse> {
  try {
    const ds = requireDataSource()
    const imageSvc = new AssetImageService(ds)
    const svc = new MainImageUploadService(getPathProvider(), imageSvc)
    const data = await svc.uploadAdditionalMain({
      buffer: Buffer.from(input.base64, 'base64'),
      fileName: input.fileName,
      assetType: input.assetType,
      assetId: input.assetId,
      label: input.label,
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

/**
 * spec 2026-05-09 ep-redesign §3.2 B3 · 角色一键多角度参考图（character bible：正/3q左/3q右）
 *
 * 串行调 imageGen 3 次（同一 base 主图作 reference 保一致性），落 3 个 view 行。
 */
async function handleGenerateThreeViews(
  _event: any,
  input: {
    assetType: AssetType
    assetId: string
    prompt: string
    negativePrompt?: string
    baseImageId?: string | null
  },
): Promise<IpcResponse> {
  try {
    if (input.assetType !== 'character') {
      return { success: false, error: '仅 character 资产支持多角度参考图' }
    }
    const ds = requireDataSource()
    const imageSvc = new AssetImageService(ds)
    const svc = new MainImageGeneratorService(
      imageSvc,
      createGalleryImageGenerator(),
      ds,
    )
    const data = await svc.generateThreeViews(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
