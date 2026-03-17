/**
 * 消息IPC处理器
 * @module ipc/handlers/message
 * @description 处理消息相关的IPC请求
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getDatabaseManager } from '../../database'
import type { Message, ListMessagesResponse } from '../../../shared/types'

/**
 * 注册消息相关IPC处理器
 */
export function registerMessageHandlers(): void {
  ipcMain.handle('message:list', handleListMessages)
  ipcMain.handle('message:create', handleCreateMessage)
  ipcMain.handle('message:delete', handleDeleteMessages)
}

/**
 * 处理获取消息列表
 */
async function handleListMessages(
  event: IpcMainInvokeEvent,
  dialogId: string
): Promise<ListMessagesResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.messages) {
      return { success: false, messages: [] }
    }

    const messages = await dbManager.messages.getByDialogId(dialogId)
    return { success: true, messages }
  } catch (error) {
    console.error('获取消息列表失败:', error)
    return { success: false, messages: [] }
  }
}

/**
 * 处理创建消息
 */
async function handleCreateMessage(
  event: IpcMainInvokeEvent,
  payload: {
    dialogId: string
    role: string
    content: string
    modelId?: string
    tokensUsed?: number
  }
): Promise<{ success: boolean; message?: Message }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.messages) {
      return { success: false }
    }

    const message = await dbManager.messages.create({
      dialogId: payload.dialogId,
      role: payload.role as 'user' | 'assistant' | 'system',
      content: payload.content,
      modelId: payload.modelId,
      tokensUsed: payload.tokensUsed
    })

    // 更新对话的消息计数和时间戳
    if (dbManager.dialogs) {
      const count = await dbManager.messages.count(payload.dialogId)
      await dbManager.dialogs.updateMessageCount(payload.dialogId, count)
      await dbManager.dialogs.touch(payload.dialogId)
    }

    return { success: true, message }
  } catch (error) {
    console.error('创建消息失败:', error)
    return { success: false }
  }
}

/**
 * 处理删除消息
 */
async function handleDeleteMessages(
  event: IpcMainInvokeEvent,
  dialogId: string
): Promise<{ success: boolean }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.messages) {
      return { success: false }
    }

    await dbManager.messages.deleteByDialogId(dialogId)
    return { success: true }
  } catch (error) {
    console.error('删除消息失败:', error)
    return { success: false }
  }
}

/**
 * 注销消息相关IPC处理器
 */
export function unregisterMessageHandlers(): void {
  ipcMain.removeHandler('message:list')
  ipcMain.removeHandler('message:create')
  ipcMain.removeHandler('message:delete')
}
