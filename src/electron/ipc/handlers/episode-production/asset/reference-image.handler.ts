/**
 * 资产参考图（character / location / item）IPC handler · spec 2026-05-09
 * @module electron/ipc/handlers/episode-production/asset/reference-image
 *
 * 用户在 ② 资产 stage 设定卡上传参考图：base64 流到 disk
 * `<dataPath>/asset-references/<bindingId>/<fileId>.<ext>`，落 binding.reference_image_path
 * （相对 dataPath 路径，与 image_assets.image_path 同一约定）。
 *
 * 主图生成（generateMain）会读 binding.referenceImagePath 拼到 imageGen.referenceImagePaths。
 *
 * 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { randomBytes } from 'crypto'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { CharacterAssetService } from '@core/modules/episode-production/assets/services/character-asset.service'
import { LocationAssetService } from '@core/modules/episode-production/assets/services/location-asset.service'
import { ItemAssetService } from '@core/modules/episode-production/assets/services/item-asset.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'

type AssetType = 'character' | 'location' | 'item'

interface SetReferenceImageInput {
  assetType: AssetType
  bindingId: string
  base64?: string
  fileName?: string
  mimeType?: string
  clear?: boolean
}

export function registerAssetReferenceImageHandlers(): void {
  ipcBridge.handle('ep:asset:set-reference-image', handleSetReferenceImage)
}

async function handleSetReferenceImage(
  _event: any,
  input: SetReferenceImageInput,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }

    // bindingId 用作目录名，硬性限制字符集防路径穿越
    if (!/^[a-zA-Z0-9_-]+$/.test(input.bindingId)) {
      return { success: false, error: `非法 bindingId: ${input.bindingId}` }
    }

    const svc = pickService(input.assetType, db.dataSource)
    if (!svc) {
      return { success: false, error: `未知 assetType: ${input.assetType}` }
    }

    if (input.clear) {
      await svc.setReferenceImagePath(input.bindingId, null)
      return { success: true, data: { referenceImagePath: null } }
    }

    if (!input.base64) {
      return { success: false, error: '缺 base64 上传内容' }
    }

    const ext = inferExt(input.fileName, input.mimeType)
    const fileId = `ref_${randomBytes(8).toString('hex')}`
    const relPath = path.posix.join(
      'asset-references',
      input.bindingId,
      `${fileId}.${ext}`,
    )
    const dataPath = getPathProvider().getDataPath()
    const absPath = path.join(dataPath, relPath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, Buffer.from(input.base64, 'base64'))

    await svc.setReferenceImagePath(input.bindingId, relPath)
    return { success: true, data: { referenceImagePath: relPath } }
  } catch (e: any) {
    console.error('[handleSetReferenceImage] 失败:', e)
    return { success: false, error: e?.message ?? '保存参考图失败' }
  }
}

function pickService(
  assetType: AssetType,
  ds: any,
): {
  setReferenceImagePath(id: string, p: string | null): Promise<void>
} | null {
  if (assetType === 'character') return new CharacterAssetService(ds)
  if (assetType === 'location') return new LocationAssetService(ds, new AssetImageService(ds))
  if (assetType === 'item') return new ItemAssetService(ds)
  return null
}

function inferExt(fileName?: string, mimeType?: string): string {
  if (fileName) {
    const m = /\.([a-zA-Z0-9]+)$/.exec(fileName)
    if (m) {
      const e = m[1].toLowerCase()
      if (e === 'jpeg') return 'jpg'
      if (['png', 'jpg', 'webp', 'gif', 'bmp', 'avif'].includes(e)) return e
    }
  }
  if (mimeType) {
    const m = /image\/(\w+)/.exec(mimeType)
    if (m) {
      const e = m[1].toLowerCase()
      if (e === 'jpeg') return 'jpg'
      return e
    }
  }
  return 'png'
}
