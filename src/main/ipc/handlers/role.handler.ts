/**
 * 角色IPC处理器
 * @module ipc/handlers/role
 * @description 处理角色相关的IPC请求
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getDatabaseManager } from '../../database'
import type { Role, CreateRoleRequest, ListRolesResponse, GetRoleResponse, CreateRoleResponse } from '../../../shared/types'

/**
 * 注册角色相关IPC处理器
 */
export function registerRoleHandlers(): void {
  ipcMain.handle('role:list', handleListRoles)
  ipcMain.handle('role:get', handleGetRole)
  ipcMain.handle('role:create', handleCreateRole)
  ipcMain.handle('role:update', handleUpdateRole)
  ipcMain.handle('role:delete', handleDeleteRole)
  ipcMain.handle('role:dialog-count', handleGetDialogCount)
}

/**
 * 处理获取角色列表
 */
async function handleListRoles(event: IpcMainInvokeEvent): Promise<ListRolesResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.roles) {
      return { success: false, roles: [] }
    }

    const roles = await dbManager.roles.getAll()
    return { success: true, roles }
  } catch (error) {
    console.error('获取角色列表失败:', error)
    return { success: false, roles: [] }
  }
}

/**
 * 处理获取单个角色
 */
async function handleGetRole(event: IpcMainInvokeEvent, id: string): Promise<GetRoleResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.roles) {
      return { success: false }
    }

    const role = await dbManager.roles.getById(id)
    return { success: true, role: role || undefined }
  } catch (error) {
    console.error('获取角色失败:', error)
    return { success: false }
  }
}

/**
 * 处理创建角色
 */
async function handleCreateRole(
  event: IpcMainInvokeEvent,
  request: CreateRoleRequest
): Promise<CreateRoleResponse> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.roles) {
      return { success: false, error: '数据库未初始化' }
    }

    const role = await dbManager.roles.create(request)
    return { success: true, role }
  } catch (error) {
    console.error('创建角色失败:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理更新角色
 */
async function handleUpdateRole(
  event: IpcMainInvokeEvent,
  payload: { id: string; data: Partial<Role> }
): Promise<{ success: boolean }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.roles) {
      return { success: false }
    }

    await dbManager.roles.update(payload.id, payload.data)
    return { success: true }
  } catch (error) {
    console.error('更新角色失败:', error)
    return { success: false }
  }
}

/**
 * 处理删除角色
 */
async function handleDeleteRole(
  event: IpcMainInvokeEvent,
  id: string
): Promise<{ success: boolean; dialogCount?: number; error?: string }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.roles) {
      return { success: false, error: '数据库未初始化' }
    }

    const result = await dbManager.roles.delete(id)
    if (!result.deleted) {
      return { success: false, error: '无法删除内置角色或角色不存在' }
    }

    return { success: true, dialogCount: result.dialogCount }
  } catch (error) {
    console.error('删除角色失败:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理获取角色关联的对话数量
 */
async function handleGetDialogCount(
  event: IpcMainInvokeEvent,
  id: string
): Promise<{ success: boolean; count?: number }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.roles) {
      return { success: false }
    }

    const count = await dbManager.roles.getDialogCount(id)
    return { success: true, count }
  } catch (error) {
    console.error('获取对话数量失败:', error)
    return { success: false }
  }
}

/**
 * 注销角色相关IPC处理器
 */
export function unregisterRoleHandlers(): void {
  ipcMain.removeHandler('role:list')
  ipcMain.removeHandler('role:get')
  ipcMain.removeHandler('role:create')
  ipcMain.removeHandler('role:update')
  ipcMain.removeHandler('role:delete')
  ipcMain.removeHandler('role:dialog-count')
}
