/**
 * 对话IPC处理器
 * @module core/packs/chat/handlers/dialog
 * @description 处理对话相关的IPC请求
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { CreateDialogRequest, UpdateDialogRequest, ListDialogsResponse, GetDialogResponse, CreateDialogResponse } from '@shared/types'

/**
 * 注册对话相关IPC处理器
 */
export function registerDialogHandlers(): void {
  ipcBridge.handle('dialog:list', handleListDialogs)
  ipcBridge.handle('dialog:list-by-role', handleListDialogsByRole)
  ipcBridge.handle('dialog:get', handleGetDialog)
  ipcBridge.handle('dialog:create', handleCreateDialog)
  ipcBridge.handle('dialog:update', handleUpdateDialog)
  ipcBridge.handle('dialog:delete', handleDeleteDialog)
  ipcBridge.handle('dialog:touch', handleTouchDialog)
}

/**
 * 处理获取对话列表
 */
async function handleListDialogs(_event: any): Promise<ListDialogsResponse> {
  try {
    const dbManager = getCoreDatabaseManager()
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
  _event: any,
  roleId: string | null
): Promise<ListDialogsResponse> {
  try {
    const dbManager = getCoreDatabaseManager()
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
  _event: any,
  dialogId: string
): Promise<GetDialogResponse> {
  try {
    const dbManager = getCoreDatabaseManager()
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
  _event: any,
  request: CreateDialogRequest
): Promise<CreateDialogResponse> {
  try {
    const dbManager = getCoreDatabaseManager()
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
      contextConfig: request.contextConfig,
      agentEnabled: request.agentEnabled === true
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
  _event: any,
  payload: { id: string; data: UpdateDialogRequest }
): Promise<{ success: boolean }> {
  console.log('[handleUpdateDialog] 收到更新请求:', JSON.stringify(payload, null, 2))
  try {
    const dbManager = getCoreDatabaseManager()
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
  _event: any,
  dialogId: string
): Promise<{ success: boolean }> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.dialogs) {
      return { success: false }
    }

    await dbManager.dialogs.delete(dialogId)
    // M8 级联清理：agent_sessions/trajectories 残留会造成工作台幽灵会话（32 号登记）
    try {
      const { purgeAgentDataForScopes } = await import('@core/platform/agent-runtime/memory/session-purge')
      await purgeAgentDataForScopes(dbManager.dataSource, [
        { conversationId: `system-chat-agent:dialog:${dialogId}`, scopeKey: `dialog:${dialogId}` },
      ])
    } catch (purgeError) {
      console.error('Agent 数据级联清理失败（不影响删除）:', purgeError)
    }
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
  _event: any,
  dialogId: string
): Promise<{ success: boolean }> {
  try {
    const dbManager = getCoreDatabaseManager()
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
  ipcBridge.removeHandler('dialog:list')
  ipcBridge.removeHandler('dialog:list-by-role')
  ipcBridge.removeHandler('dialog:get')
  ipcBridge.removeHandler('dialog:create')
  ipcBridge.removeHandler('dialog:update')
  ipcBridge.removeHandler('dialog:delete')
  ipcBridge.removeHandler('dialog:touch')
}
