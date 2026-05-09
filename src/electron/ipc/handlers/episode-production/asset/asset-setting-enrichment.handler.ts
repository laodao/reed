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
  // spec 2026-05-09 ep-redesign §3.2 B2 · AI 正向字段提取
  ipcBridge.handle('ep:asset:extract-fields', handleExtractFields)
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

/**
 * spec 2026-05-09 ep-redesign §3.2 B2 · AI 正向字段提取
 *
 * 用户在自由文本"人物描述"里写完，调本 IPC → LLM 抽出结构化字段。
 * 不覆盖逻辑放前端（service 只返回 LLM 结果）。
 */
async function handleExtractFields(
  _event: any,
  input: {
    assetType: 'character' | 'location' | 'item'
    description: string
    projectId: string
  },
): Promise<IpcResponse> {
  try {
    if (!input?.assetType || !input?.description?.trim()) {
      return { success: false, error: '参数不完整：assetType / description 必填' }
    }
    if (input.description.trim().length < 10) {
      return { success: false, error: '描述太短（建议至少 10 字）' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new AssetSettingEnrichmentService(db.dataSource, callAI)
    const data = await svc.extractFieldsFromDescription({
      assetType: input.assetType,
      description: input.description,
      projectId: input.projectId,
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
