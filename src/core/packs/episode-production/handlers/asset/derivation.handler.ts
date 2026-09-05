/**
 * episode-production · 图谱派生（spec §3.5） · IPC handler
 * @module core/packs/episode-production/handlers/asset/derivation.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 *
 * V2.5 加入 ep:asset:derive:* channel；P3c follow-up #64 把 stubImageGenerator
 * 替换为 createGalleryImageGenerator() —— 走通用 ImageService.generateImage（按用户
 * 配置的 enabled provider 路由）真实出图，1024×1024 派生图。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  GalleryDerivationService,
  type DeriveSingleInput,
  type DeriveBatchInput,
} from '@core/modules/episode-production/assets/services/gallery-derivation.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { createGalleryImageGenerator } from '@core/modules/episode-production/assets/services/image-provider-adapter'

export function registerDerivationHandlers(): void {
  ipcBridge.handle('ep:asset:derive:single', handleDeriveSingle)
  ipcBridge.handle('ep:asset:derive:batch', handleDeriveBatch)
}

/** 取 DataSource；未初始化则抛错 */
function requireDataSource() {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) {
    throw new Error('数据库未初始化')
  }
  return db.dataSource
}

function buildService(): GalleryDerivationService {
  const ds = requireDataSource()
  const imageSvc = new AssetImageService(ds)
  // 第三个参数 ds 让 service 内部 loadEffective 取资产身份段，
  // 给派生 prompt 自动加 name / description / styleAnchors / 故事背景（spec 2026-05-09 review）。
  return new GalleryDerivationService(imageSvc, createGalleryImageGenerator(), ds)
}

async function handleDeriveSingle(
  _event: any,
  input: DeriveSingleInput,
): Promise<IpcResponse> {
  try {
    const data = await buildService().deriveSingle(input)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleDeriveBatch(
  _event: any,
  input: DeriveBatchInput,
): Promise<IpcResponse> {
  try {
    await buildService().deriveBatch(input)
    return { success: true, data: { ok: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
