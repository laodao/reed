/**
 * episode-production · 图谱派生（spec §3.5） · IPC handler
 * @module electron/ipc/handlers/episode-production/asset/derivation.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * V2.5 新增 channel（ep:asset:derive:* · 走 GalleryDerivationService）。
 *
 * **重要 · TODO(P5)**：本 handler 注入的 ImageGenerator 是 stub 占位 —— 调 generate 直接抛错。
 *   真实接入要 wire 到 ImageService.generateImage（接口签名复杂、含 provider 选择 / 多模型路由），
 *   留给 P5 渲染域 task 完成；当前阶段只先把 IPC 契约打通，service 编排逻辑已稳定。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  GalleryDerivationService,
  type DeriveSingleInput,
  type DeriveBatchInput,
  type ImageGenerator,
} from '@core/modules/episode-production/assets/services/gallery-derivation.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'

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

/**
 * Stub ImageGenerator：调用 generate 直接抛错。
 * TODO(P5)：替换为真实 ImageService.generateImage wrapper。
 */
const stubImageGenerator: ImageGenerator = {
  async generate(_opts) {
    throw new Error('图像派生 API 待 P5 task 接入 ImageService.generateImage')
  },
}

function buildService(): GalleryDerivationService {
  const ds = requireDataSource()
  const imageSvc = new AssetImageService(ds)
  return new GalleryDerivationService(imageSvc, stubImageGenerator)
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
