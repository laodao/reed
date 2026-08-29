/**
 * 角色IPC处理器
 * @module core/packs/chat/handlers/role
 * @description 处理角色相关的IPC请求
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { CreateRoleRequest, UpdateRoleRequest, ListRolesResponse, GetRoleResponse, CreateRoleResponse } from '@shared/types'

/**
 * 注册角色相关IPC处理器
 */
export function registerRoleHandlers(): void {
  ipcBridge.handle('role:list', handleListRoles)
  ipcBridge.handle('role:get', handleGetRole)
  ipcBridge.handle('role:create', handleCreateRole)
  ipcBridge.handle('role:update', handleUpdateRole)
  ipcBridge.handle('role:delete', handleDeleteRole)
  ipcBridge.handle('role:dialog-count', handleGetDialogCount)
}

/**
 * 处理获取角色列表
 */
async function handleListRoles(_event: any): Promise<ListRolesResponse> {
  try {
    const dbManager = getCoreDatabaseManager()
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
async function handleGetRole(_event: any, id: string): Promise<GetRoleResponse> {
  try {
    const dbManager = getCoreDatabaseManager()
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
  _event: any,
  request: CreateRoleRequest
): Promise<CreateRoleResponse> {
  try {
    const dbManager = getCoreDatabaseManager()
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
  _event: any,
  payload: { id: string; data: UpdateRoleRequest }
): Promise<{ success: boolean }> {
  try {
    const dbManager = getCoreDatabaseManager()
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
  _event: any,
  id: string
): Promise<{ success: boolean; dialogCount?: number; error?: string }> {
  try {
    const dbManager = getCoreDatabaseManager()
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
  _event: any,
  id: string
): Promise<{ success: boolean; count?: number }> {
  try {
    const dbManager = getCoreDatabaseManager()
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
  ipcBridge.removeHandler('role:list')
  ipcBridge.removeHandler('role:get')
  ipcBridge.removeHandler('role:create')
  ipcBridge.removeHandler('role:update')
  ipcBridge.removeHandler('role:delete')
  ipcBridge.removeHandler('role:dialog-count')
}
