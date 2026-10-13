/**
 * episode-production · 资产写回影响范围统计 · IPC handler（T01）
 * @module core/packs/episode-production/handlers/asset/asset-reference.handler
 * @description 双端共用 handler — PC 由 episodeProductionPack.activate() 注册，
 *              Web 由同一 register 函数经包内核激活注册。
 *              新 channel：ep:asset:get-write-impact（走 AssetReferenceService）。
 *
 * 用途：三处画廊编辑器在"设为主图" / 主图"重新生成"前查询影响面
 * （storyboardCount / episodeCount 估算值），storyboardCount>0 时弹确认。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  AssetReferenceService,
  type WriteImpactAssetType,
} from '@core/platform/episode-production/assets/services/asset-reference.service'

const VALID_TYPES: readonly string[] = ['character', 'location', 'item']

export function registerAssetReferenceHandlers(): void {
  ipcBridge.handle('ep:asset:get-write-impact', handleGetWriteImpact)
}

async function handleGetWriteImpact(
  _event: any,
  assetType: WriteImpactAssetType,
  assetId: string,
): Promise<IpcResponse> {
  try {
    if (!VALID_TYPES.includes(assetType)) {
      return { success: false, error: `assetType 不合法: ${assetType}` }
    }
    if (!assetId || !String(assetId).trim()) {
      return { success: false, error: 'assetId 不能为空' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }

    const svc = new AssetReferenceService(db.dataSource)
    const data = await svc.getWriteImpact(assetType, String(assetId).trim())
    return { success: true, data }
  } catch (e: any) {
    console.error('[handleGetWriteImpact] 统计写回影响失败:', e)
    return { success: false, error: e?.message ?? '统计写回影响失败' }
  }
}
