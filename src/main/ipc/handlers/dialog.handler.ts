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

    // 默认助手 ID（'default-assistant' 是对话首页创建对话时的默认助手）
    const DEFAULT_ROLE_ID = 'default-assistant'

    // 如果没有指定角色，使用默认助手
    const roleId = request.roleId || DEFAULT_ROLE_ID

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
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.dialogs) {
      return { success: false }
    }

    await dbManager.dialogs.update(payload.id, payload.data)
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
 * 注销对话相关IPC处理器
 */
export function unregisterDialogHandlers(): void {
  ipcMain.removeHandler('dialog:list')
  ipcMain.removeHandler('dialog:list-by-role')
  ipcMain.removeHandler('dialog:get')
  ipcMain.removeHandler('dialog:create')
  ipcMain.removeHandler('dialog:update')
  ipcMain.removeHandler('dialog:delete')
}
