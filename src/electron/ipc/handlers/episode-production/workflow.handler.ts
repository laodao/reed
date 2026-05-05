/**
 * episode-production · 工作流与状态机 · IPC handler
 * @module electron/ipc/handlers/episode-production/workflow.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 *
 * 暴露 channel：
 *   - ep:calculate-episode-progress(episodeId) → EpisodeProgress
 *     供顶部 6 段阶段进度条 UI 使用（spec §2.1 + §2.2 · P6-T13）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { ProgressCalculator } from '@core/modules/episode-production/workflow/progress-calculator'

/**
 * 注册工作流相关 IPC 处理器
 */
export function registerWorkflowHandlers(): void {
  ipcBridge.handle('ep:calculate-episode-progress', handleCalculateEpisodeProgress)
}

/**
 * 计算指定剧集的 6 阶段进度 + 整剧进度。
 *
 * 顶部进度条（spec §2.1）使用：
 *   - 6 段 ① 内容 / ② 资产 / ③ 剧本 / ④ 分镜 / ⑤ 画面音频 / ⑥ 合成
 *   - 每段视觉标记 ✓（已完成）/ ●（进行中）/ ○（未到）
 *   - 软引导跳转：UI 调 stage-gate 决定能否跳
 */
async function handleCalculateEpisodeProgress(
  _event: any,
  episodeId: string,
): Promise<IpcResponse> {
  try {
    if (!episodeId) {
      return { success: false, error: 'episodeId 不能为空' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }
    const calc = new ProgressCalculator(db.dataSource)
    const progress = await calc.calculateEpisodeProgress(episodeId)
    return { success: true, data: progress }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '计算剧集进度失败' }
  }
}
