/**
 * episode-production · AI 用量统计 · IPC handler（tasks/2026-09-16-ep-studio-polish S-09）
 * @module core/packs/episode-production/handlers/usage.handler
 * @description 双端共用 handler — 随 registerEpisodeProductionHandlers 统一激活。
 *
 * Channels：
 *   - ep:ai-usage-stats  输入 projectId（可选）→ 按 call_type+model 聚合
 *                        次数 / 总耗时 / 平均耗时；projectId 缺省 = 全量聚合
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'

export interface AiUsageStatRow {
  callType: string
  modelId: string | null
  count: number
  totalMs: number
  avgMs: number
}

export function registerUsageHandlers(): void {
  ipcBridge.handle('ep:ai-usage-stats', handleAiUsageStats)
}

async function handleAiUsageStats(
  _event: any,
  projectId?: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const ds = db.dataSource
    const isPg = ds.options.type === 'postgres'

    const hasProject = !!(projectId && projectId.trim())
    const where = hasProject ? `WHERE project_id = ${isPg ? '$1' : '?'}` : ''
    const params = hasProject ? [projectId!.trim()] : []

    const rows: Array<{
      call_type: string
      model_id: string | null
      cnt: number | string
      total_ms: number | string | null
      avg_ms: number | string | null
    }> = await ds.query(
      `SELECT call_type, model_id,
              COUNT(*) AS cnt,
              SUM(duration_ms) AS total_ms,
              AVG(duration_ms) AS avg_ms
       FROM ai_call_stats
       ${where}
       GROUP BY call_type, model_id
       ORDER BY total_ms DESC`,
      params,
    )

    const data: AiUsageStatRow[] = rows.map(r => ({
      callType: r.call_type,
      modelId: r.model_id,
      count: Number(r.cnt ?? 0),
      totalMs: Number(r.total_ms ?? 0),
      avgMs: Math.round(Number(r.avg_ms ?? 0)),
    }))
    return { success: true, data }
  } catch (e: any) {
    // 老库/测试库表未建时返回空聚合，面板可正常渲染
    if (/no such table|does not exist/i.test(e?.message ?? '')) {
      return { success: true, data: [] }
    }
    return { success: false, error: e?.message || '读取用量统计失败' }
  }
}
