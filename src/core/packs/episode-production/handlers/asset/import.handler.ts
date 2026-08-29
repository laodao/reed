/**
 * episode-production · 引用导入（spec §3.11） · IPC handler
 * @module core/packs/episode-production/handlers/asset/import.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * V2.5 新增 channel（ep:asset:import:* · 走 AssetImportService）：把外部 portrait_variants /
 * images 表的图引用到 asset_image 统一图谱（不复制文件、不写 derivedFromImageId）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  AssetImportService,
  type ImportFromPortraitVariantInput,
  type ImportFromImageInput,
} from '@core/modules/episode-production/assets/services/asset-import.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'

export function registerImportHandlers(): void {
  ipcBridge.handle('ep:asset:import:from-portrait', handleImportFromPortrait)
  ipcBridge.handle('ep:asset:import:from-image', handleImportFromImage)
}

/** 取 DataSource；未初始化则抛错 */
function requireDataSource() {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) {
    throw new Error('数据库未初始化')
  }
  return db.dataSource
}

function buildService(): AssetImportService {
  const ds = requireDataSource()
  return new AssetImportService(ds, new AssetImageService(ds))
}

async function handleImportFromPortrait(
  _event: any,
  input: ImportFromPortraitVariantInput,
): Promise<IpcResponse> {
  try {
    const data = await buildService().importFromPortraitVariant(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleImportFromImage(
  _event: any,
  input: ImportFromImageInput,
): Promise<IpcResponse> {
  try {
    const data = await buildService().importFromImage(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
