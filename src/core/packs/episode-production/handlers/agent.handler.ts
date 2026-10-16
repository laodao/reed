/**
 * episode-production · 对话式制作 Agent · IPC handler
 * @module core/packs/episode-production/handlers/agent.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 *
 * scope（界面域，2026-10-15）：剧本/资产(各类别)/分镜/合成等界面各自独立会话——
 * 会话 id `ep-agent:<episodeId>[:<scope>]`、事件通道 `ep-agent:<projectId>:<episodeId>[:<scope>]`；
 * 缺省=无域全局会话（存量兼容）。
 *
 * 暴露 channel：
 *   - ep:agent:send(projectId, episodeId, message, providerConfigId?, modelId?, contextHint?, scope?) → EpAgentSendResult
 *   - ep:agent:history(episodeId, scope?) → EpAgentHistoryItem[]
 *   - ep:agent:state(projectId, episodeId) → EpAgentProductionState
 *   - ep:agent:cancel(projectId, episodeId, scope?)
 *   事件通道：ep-agent:${projectId}:${episodeId}[:${scope}]（前端 onAgentEvent 订阅）
 *   总结流式正文：ep-agent:generate:${summaryEventId}（reply:start 携带 summaryEventId）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { EpisodeProductionAgentService } from '@core/platform/episode-production/agent/ep-agent-workflow.service'
import { isEpAgentHarnessEnabled } from '@core/platform/episode-production/agent/ep-agent.types'
import { EpAgentHarnessService } from '@core/platform/episode-production/agent/ep-agent-harness.service'

/**
 * 注册剧集制作 Agent 相关 IPC 处理器
 */
export function registerEpisodeAgentHandlers(): void {
  ipcBridge.handle('ep:agent:send', async (_event, projectId: string, episodeId: string, message: string, providerConfigId?: string, modelId?: string, contextHint?: string, scope?: string) => {
    try {
      const result = isEpAgentHarnessEnabled()
        ? await EpAgentHarnessService.getInstance().sendMessage(projectId, episodeId, message, { providerConfigId, modelId, contextHint, scope })
        : await EpisodeProductionAgentService.getInstance().sendMessage(projectId, episodeId, message, { providerConfigId, modelId, scope })
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[EpAgentHandler] agent:send 失败:', error)
      return { success: false, error: error?.message ?? String(error) }
    }
  })

  ipcBridge.handle('ep:agent:history', async (_event, episodeId: string, scope?: string) => {
    try {
      return { success: true, data: await EpisodeProductionAgentService.getInstance().getHistory(episodeId, undefined, scope) }
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

  ipcBridge.handle('ep:agent:decide', async (_event, projectId: string, episodeId: string, approvalId: string, action: 'select' | 'reject', selected?: string, scope?: string) => {
    try {
      if (!isEpAgentHarnessEnabled()) return { success: false, error: '审批通路仅在 harness 模式可用' }
      const ok = EpAgentHarnessService.getInstance().decideChoice(projectId, episodeId, approvalId, action, selected, scope)
      return ok ? { success: true, data: { decided: true } } : { success: false, error: '审批不存在或已过期' }
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) }
    }
  })

  ipcBridge.handle('ep:agent:list-pending', async (_event, projectId: string, episodeId: string, scope?: string) => {
    try {
      if (!isEpAgentHarnessEnabled()) return { success: true, data: [] }
      return { success: true, data: EpAgentHarnessService.getInstance().listPendingChoices(projectId, episodeId, scope) }
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) }
    }
  })

  ipcBridge.handle('ep:agent:cancel', async (_event, projectId: string, episodeId: string, scope?: string) => {
    try {
      if (isEpAgentHarnessEnabled()) {
        EpAgentHarnessService.getInstance().cancel(projectId, episodeId, scope)
        return { success: true }
      }
      EpisodeProductionAgentService.getInstance().cancel(projectId, episodeId, scope)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) }
    }
  })
}
