/**
 * 聊天 IPC 处理器
 * @module core/packs/chat/handlers/chat
 * @description 处理聊天相关的 IPC 请求
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { ChatService } from '../services/chat.service'

/**
 * 注册聊天相关 IPC 处理器
 */
export function registerChatHandlers(): void {
  ipcBridge.handle('chat:send', handleChatSend)
  ipcBridge.handle('chat:stop', handleChatStop)
}

/**
 * 处理发送聊天消息
 */
async function handleChatSend(
  _event: any,
  request: {
    dialogId: string
    content: string
    attachments?: Array<{
      id: string
      type: 'image' | 'document'
      fileName: string
      filePath: string
      fileSize: number
      mimeType: string
    }>
    enableWebSearch?: boolean
    enableThinkingChain?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await ChatService.sendMessage(request)
    return result
  } catch (error: any) {
    console.error('[handleChatSend] 错误:', error.message)
    return { success: false, error: error.message || '发送失败' }
  }
}

/**
 * 处理停止流式响应（普通对话与 agent 模式双通道——dialogId 同键）
 */
async function handleChatStop(
  _event: any,
  dialogId: string
): Promise<{ success: boolean }> {
  try {
    const stopped = ChatService.stopStream(dialogId)
    const { SystemAgentChatService } = await import('../services/system-agent/system-agent.service')
    const stoppedAgent = SystemAgentChatService.stopStream(dialogId)
    return { success: stopped || stoppedAgent }
  } catch (error) {
    console.error('停止流式响应失败:', error)
    return { success: false }
  }
}

/**
 * 注销聊天相关 IPC 处理器
 */
export function unregisterChatHandlers(): void {
  ipcBridge.removeHandler('chat:send')
  ipcBridge.removeHandler('chat:stop')
}
