/**
 * episode-production · 资产项目级聚合 · IPC handler（FU5-C1）
 * @module core/packs/episode-production/handlers/asset/asset-summary
 *
 * 给 ② 资产盘点页 v2 用：一次性返回项目下所有 binding 的主图状态 + 图谱细分计数
 * + voice 列表（含绑定关系）+ 全局聚合数（解锁原 AssetStageView 写死 0 的占位）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  AssetProjectSummaryService,
  type ProjectAssetSummary,
  type VoiceSummary,
} from '@core/platform/episode-production/assets/services/asset-project-summary.service'
import { VoiceAssetService } from '@core/platform/episode-production/assets/services/voice-asset.service'

export function registerAssetSummaryHandlers(): void {
  ipcBridge.handle('ep:asset:project-summary', handleProjectSummary)
}

async function handleProjectSummary(
  _event: any,
  projectId: string,
): Promise<IpcResponse> {
  try {
    if (!projectId) return { success: false, error: 'projectId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }

    const sumSvc = new AssetProjectSummaryService(db.dataSource)
    const summary: ProjectAssetSummary = await sumSvc.summarizeProject(projectId)

    // voices：跨域填充（VoiceAssetService 读 ClonedVoice + 反向查角色绑定）
    try {
      const voiceSvc = new VoiceAssetService(db.dataSource)
      const all = await voiceSvc.listAvailableVoices()
      const voices: VoiceSummary[] = []
      for (const v of all) {
        const chars = await voiceSvc
          .listCharactersByVoice(v.id)
          .catch(() => [] as any[])
        voices.push({
          voiceId: v.id,
          name: v.name ?? v.id,
          type: ((v as any).type as 'system' | 'cloned') ?? 'cloned',
          boundCharacterNames: chars.map(
            (c: any) =>
              c.standaloneName ?? c.overrideName ?? c.name ?? c.id,
          ),
        })
      }
      summary.voices = voices
    } catch (e) {
      console.warn('[handleProjectSummary] voice 聚合失败:', e)
      summary.voices = []
    }

    return { success: true, data: summary }
  } catch (e: any) {
    console.error('[handleProjectSummary] 异常:', e)
    return { success: false, error: e?.message ?? '获取项目资产摘要失败' }
  }
}
