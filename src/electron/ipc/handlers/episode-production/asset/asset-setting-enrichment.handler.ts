/**
 * episode-production · 资产设定反推 IPC handler
 * @module electron/ipc/handlers/episode-production/asset/asset-setting-enrichment.handler
 */
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { AssetSettingEnrichmentService } from '@core/modules/episode-production/assets/services/asset-setting-enrichment.service'
import { callAI } from '@core/modules/episode-production/narrative/ai/_helpers'

export function registerAssetSettingEnrichmentHandlers(): void {
  ipcBridge.handle('ep:asset:enrich-settings', handleEnrich)
}

async function handleEnrich(
  _event: any,
  input: { projectId: string },
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new AssetSettingEnrichmentService(db.dataSource, callAI)
    const data = await svc.enrich({ projectId: input.projectId })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
