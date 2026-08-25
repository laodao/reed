/**
 * episode-production · 对话式制作 Agent · IPC handler
 * @module electron/ipc/handlers/episode-production/agent.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 *
 * 暴露 channel：
 *   - ep:agent:send(projectId, episodeId, message, providerConfigId?, modelId?) → EpAgentSendResult
 *   - ep:agent:history(episodeId) → EpAgentHistoryItem[]
 *   - ep:agent:state(projectId, episodeId) → EpAgentProductionState
 *   - ep:agent:cancel(episodeId)
 *   事件通道：ep-agent:${projectId}:${episodeId}（前端 onAgentEvent 订阅）
 *   总结流式正文：ep-agent:generate:${summaryEventId}（reply:start 携带 summaryEventId）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { EpisodeProductionAgentService } from '@core/modules/episode-production/agent/ep-agent-workflow.service'

/**
 * 注册剧集制作 Agent 相关 IPC 处理器
 */
export function registerEpisodeAgentHandlers(): void {
  ipcBridge.handle('ep:agent:send', async (_event, projectId: string, episodeId: string, message: string, providerConfigId?: string, modelId?: string) => {
    try {
      const result = await EpisodeProductionAgentService.getInstance().sendMessage(projectId, episodeId, message, { providerConfigId, modelId })
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[EpAgentHandler] agent:send 失败:', error)
      return { success: false, error: error?.message ?? String(error) }
    }
  })

  ipcBridge.handle('ep:agent:history', async (_event, episodeId: string) => {
    try {
      return { success: true, data: await EpisodeProductionAgentService.getInstance().getHistory(episodeId) }
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) }
    }
  })

  ipcBridge.handle('ep:agent:state', async (_event, projectId: string, episodeId: string) => {
    try {
      return { success: true, data: await EpisodeProductionAgentService.getInstance().getState(projectId, episodeId) }
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) }
    }
  })

  ipcBridge.handle('ep:agent:cancel', async (_event, projectId: string, episodeId: string) => {
    try {
      EpisodeProductionAgentService.getInstance().cancel(projectId, episodeId)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) }
    }
  })
}
