/**
 * 对话IPC处理器
 * @module ipc/handlers/dialog
 * @description 处理对话相关的IPC请求
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getDatabaseManager } from '../../database'
import type { Dialog, CreateDialogRequest, UpdateDialogRequest, ListDialogsResponse, GetDialogResponse, CreateDialogResponse } from '../../../shared/types'

/**
 * 注册对话相关IPC处理器
 */
export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:list', handleListDialogs)
  ipcMain.handle('dialog:list-by-role', handleListDialogsByRole)
  ipcMain.handle('dialog:get', handleGetDialog)
  ipcMain.handle('dialog:create', handleCreateDialog)
  ipcMain.handle('dialog:update', handleUpdateDialog)
  ipcMain.handle('dialog:delete', handleDeleteDialog)
  ipcMain.handle('dialog:touch', handleTouchDialog)
}

/**
 * 处理获取对话列表
 */
async function handleListDialogs(event: IpcMainInvokeEvent): Promise<ListDialogsResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.dialogs) {
      return { success: false, dialogs: [] }
    }

    const dialogs = await dbManager.dialogs.getAll()
    return { success: true, dialogs }
  } catch (error) {
    console.error('获取对话列表失败:', error)
    return { success: false, dialogs: [] }
  }
}

/**
 * 处理按角色获取对话列表
 */
async function handleListDialogsByRole(
  event: IpcMainInvokeEvent,
  roleId: string | null
): Promise<ListDialogsResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.dialogs) {
      return { success: false, dialogs: [] }
    }

    const dialogs = await dbManager.dialogs.getByRoleId(roleId)
    return { success: true, dialogs }
  } catch (error) {
    console.error('获取对话列表失败:', error)
    return { success: false, dialogs: [] }
  }
}

/**
 * 处理获取单个对话
 */
async function handleGetDialog(
  event: IpcMainInvokeEvent,
  dialogId: string
): Promise<GetDialogResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.dialogs) {
      return { success: false }
    }

    const dialog = await dbManager.dialogs.getById(dialogId)
    return { success: true, dialog: dialog || undefined }
  } catch (error) {
    console.error('获取对话失败:', error)
    return { success: false }
  }
}

/**
 * 处理创建对话
 */
async function handleCreateDialog(
  event: IpcMainInvokeEvent,
  request: CreateDialogRequest
): Promise<CreateDialogResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.dialogs) {
      return { success: false, error: '数据库未初始化' }
    }

    // 默认助手的对话在数据库中 roleId 为 null
    // 如果前端传了 roleId 且不是 'default-assistant'，使用该值
    // 否则使用 null（表示默认助手）
    const roleId = (request.roleId && request.roleId !== 'default-assistant')
      ? request.roleId
      : null

    // 获取角色的系统提示词
    let systemPrompt: string | undefined = request.systemPrompt
    if (roleId && dbManager.roles && !systemPrompt) {
      const role = await dbManager.roles.getById(roleId)
      if (role) {
        systemPrompt = role.systemPrompt
      }
    }

    const dialog = await dbManager.dialogs.create({
      title: request.title || '新对话',
      modelId: request.modelId,
      providerConfigId: request.providerConfigId,
      roleId,
      systemPrompt,
      contextConfig: request.contextConfig
    })

    return { success: true, dialog }
  } catch (error) {
    console.error('创建对话失败:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理更新对话
 */
async function handleUpdateDialog(
  event: IpcMainInvokeEvent,
  payload: { id: string; data: UpdateDialogRequest }
): Promise<{ success: boolean }> {
  console.log('[handleUpdateDialog] 收到更新请求:', JSON.stringify(payload, null, 2))
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.dialogs) {
      console.error('[handleUpdateDialog] 数据库未初始化')
      return { success: false }
    }

    console.log('[handleUpdateDialog] 开始更新对话, id:', payload.id, ', data:', payload.data)
    await dbManager.dialogs.update(payload.id, payload.data)
    console.log('[handleUpdateDialog] 更新成功')

    // 验证更新结果
    const updatedDialog = await dbManager.dialogs.getById(payload.id)
    console.log('[handleUpdateDialog] 更新后的对话:', JSON.stringify(updatedDialog, null, 2))

    return { success: true }
  } catch (error) {
    console.error('更新对话失败:', error)
    return { success: false }
  }
}

/**
 * 处理删除对话
 */
async function handleDeleteDialog(
  event: IpcMainInvokeEvent,
  dialogId: string
): Promise<{ success: boolean }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.dialogs) {
      return { success: false }
    }

    await dbManager.dialogs.delete(dialogId)
    return { success: true }
  } catch (error) {
    console.error('删除对话失败:', error)
    return { success: false }
  }
}

/**
 * 处理更新对话时间戳（用于记录最后访问的对话）
 */
async function handleTouchDialog(
  event: IpcMainInvokeEvent,
  dialogId: string
): Promise<{ success: boolean }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.dialogs) {
      return { success: false }
    }

    await dbManager.dialogs.touch(dialogId)
    return { success: true }
  } catch (error) {
    console.error('更新对话时间戳失败:', error)
    return { success: false }
  }
}

/**
 * 注销对话相关IPC处理器
 */
export function unregisterDialogHandlers(): void {
  ipcMain.removeHandler('dialog:list')
  ipcMain.removeHandler('dialog:list-by-role')
  ipcMain.removeHandler('dialog:get')
  ipcMain.removeHandler('dialog:create')
  ipcMain.removeHandler('dialog:update')
  ipcMain.removeHandler('dialog:delete')
  ipcMain.removeHandler('dialog:touch')
}
