/**
 * 消息IPC处理器
 * @module core/packs/chat/handlers/message
 * @description 处理消息相关的IPC请求
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { Message, CreateMessageRequest, ListMessagesResponse } from '@shared/types'

/**
 * 注册消息相关IPC处理器
 */
export function registerMessageHandlers(): void {
  ipcBridge.handle('message:list', handleListMessages)
  ipcBridge.handle('message:create', handleCreateMessage)
  ipcBridge.handle('message:get', handleGetMessage)
  ipcBridge.handle('message:update', handleUpdateMessage)
  ipcBridge.handle('message:delete', handleDeleteMessages)
  ipcBridge.handle('message:deleteSingle', handleDeleteSingleMessage)
}

/**
 * 处理获取消息列表
 */
async function handleListMessages(
  _event: any,
  dialogId: string
): Promise<ListMessagesResponse> {
  try {
    const dbManager = getCoreDatabaseManager()
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
 * 处理获取单个消息
 */
async function handleGetMessage(
  _event: any,
  messageId: string
): Promise<{ success: boolean; message?: Message }> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.messages) {
      return { success: false }
    }

    const message = await dbManager.messages.getById(messageId)
    return { success: true, message: message || undefined }
  } catch (error) {
    console.error('获取消息失败:', error)
    return { success: false }
  }
}

/**
 * 处理创建消息
 */
async function handleCreateMessage(
  _event: any,
  payload: CreateMessageRequest
): Promise<{ success: boolean; message?: Message }> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.messages) {
      return { success: false }
    }

    const message = await dbManager.messages.create({
      dialogId: payload.dialogId,
      role: payload.role,
      content: payload.content,
      modelId: payload.modelId,
      tokensUsed: payload.tokensUsed,
      attachments: payload.attachments,
      metadata: payload.metadata
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
 * 处理更新消息
 */
async function handleUpdateMessage(
  _event: any,
  payload: { id: string; content?: string; metadata?: Message['metadata'] }
): Promise<{ success: boolean }> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.messages) {
      return { success: false }
    }

    // 支持简化调用：直接传 content 字符串
    if (typeof (payload as any).content === 'string') {
      await dbManager.messages.updateContent(payload.id, (payload as any).content)
    }

    return { success: true }
  } catch (error) {
    console.error('更新消息失败:', error)
    return { success: false }
  }
}

/**
 * 处理删除消息
 */
async function handleDeleteMessages(
  _event: any,
  dialogId: string
): Promise<{ success: boolean }> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.messages) {
      return { success: false }
    }

    await dbManager.messages.deleteByDialogId(dialogId)

    // 更新对话的消息计数
    if (dbManager.dialogs) {
      await dbManager.dialogs.updateMessageCount(dialogId, 0)
    }

    return { success: true }
  } catch (error) {
    console.error('删除消息失败:', error)
    return { success: false }
  }
}

/**
 * 处理删除单条消息
 */
async function handleDeleteSingleMessage(
  _event: any,
  messageId: string
): Promise<{ success: boolean }> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.messages) {
      return { success: false }
    }

    // 先获取消息以获得 dialogId
    const message = await dbManager.messages.getById(messageId)
    if (!message) {
      return { success: false }
    }

    await dbManager.messages.delete(messageId)

    // 更新对话的消息计数
    if (dbManager.dialogs) {
      const count = await dbManager.messages.count(message.dialogId)
      await dbManager.dialogs.updateMessageCount(message.dialogId, count)
    }

    return { success: true }
  } catch (error) {
    console.error('删除单条消息失败:', error)
    return { success: false }
  }
}

/**
 * 注销消息相关IPC处理器
 */
export function unregisterMessageHandlers(): void {
  ipcBridge.removeHandler('message:list')
  ipcBridge.removeHandler('message:create')
  ipcBridge.removeHandler('message:get')
  ipcBridge.removeHandler('message:update')
  ipcBridge.removeHandler('message:delete')
  ipcBridge.removeHandler('message:deleteSingle')
}
