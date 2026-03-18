/**
 * 聊天 IPC 处理器
 * @module ipc/handlers/chat
 * @description 处理聊天相关的 IPC 请求
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { ChatService } from '../../services/chat.service'

/**
 * 注册聊天相关 IPC 处理器
 */
export function registerChatHandlers(): void {
  ipcMain.handle('chat:send', handleChatSend)
  ipcMain.handle('chat:stop', handleChatStop)
}

/**
 * 处理发送聊天消息
 */
async function handleChatSend(
  event: IpcMainInvokeEvent,
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
  console.log('[handleChatSend] 收到聊天请求:', request)
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      console.error('[handleChatSend] 错误: 窗口不存在')
      return { success: false, error: '窗口不存在' }
    }

    console.log('[handleChatSend] 调用 ChatService.sendMessage')
    const result = await ChatService.sendMessage(window, request)
    console.log('[handleChatSend] ChatService 返回结果:', result)
    return result
  } catch (error: any) {
    console.error('[handleChatSend] 捕获异常:', error)
    console.error('[handleChatSend] 异常消息:', error.message)
    console.error('[handleChatSend] 异常堆栈:', error.stack)
    return { success: false, error: error.message || '发送失败' }
  }
}

/**
 * 处理停止流式响应
 */
async function handleChatStop(
  event: IpcMainInvokeEvent,
  dialogId: string
): Promise<{ success: boolean }> {
  try {
    const stopped = ChatService.stopStream(dialogId)
    return { success: stopped }
  } catch (error) {
    console.error('停止流式响应失败:', error)
    return { success: false }
  }
}

/**
 * 注销聊天相关 IPC 处理器
 */
export function unregisterChatHandlers(): void {
  ipcMain.removeHandler('chat:send')
  ipcMain.removeHandler('chat:stop')
}
