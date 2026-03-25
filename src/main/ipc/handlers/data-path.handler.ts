/**
 * 数据路径 IPC 处理器
 * @module ipc/handlers/data-path
 * @description 处理数据路径相关的 IPC 请求
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { DataPathService } from '../../services/data-path.service'
import type { IpcResponse } from '../../../shared/types/ipc.types'

/**
 * 注册数据路径相关 IPC 处理器
 */
export function registerDataPathHandlers(): void {
  // 获取数据路径配置
  ipcMain.handle('data-path:get-config', handleGetConfig)

  // 选择数据路径
  ipcMain.handle('data-path:select', handleSelectPath)

  // 设置数据路径
  ipcMain.handle('data-path:set', handleSetPath)

  // 重置为默认路径
  ipcMain.handle('data-path:reset', handleResetPath)

  // 获取迁移状态
  ipcMain.handle('data-path:migration-status', handleGetMigrationStatus)

  // 计算数据大小
  ipcMain.handle('data-path:calculate-size', handleCalculateSize)

  // 打开数据目录
  ipcMain.handle('data-path:open-folder', handleOpenFolder)
}

/**
 * 获取数据路径配置
 */
async function handleGetConfig(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse> {
  try {
    const service = DataPathService.getInstance()
    const config = await service.getConfig()
    return { success: true, data: config }
  } catch (error: any) {
    return { success: false, error: error.message || '获取配置失败' }
  }
}

/**
 * 选择数据路径
 */
async function handleSelectPath(
  event: IpcMainInvokeEvent
): Promise<IpcResponse> {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const service = DataPathService.getInstance()
    const result = await service.selectDataPath(window)
    return result
  } catch (error: any) {
    return { success: false, error: error.message || '选择路径失败' }
  }
}

/**
 * 设置数据路径
 */
async function handleSetPath(
  _event: IpcMainInvokeEvent,
  newPath: string,
  migrate: boolean = true
): Promise<IpcResponse> {
  try {
    const service = DataPathService.getInstance()
    const result = await service.setDataPath(newPath, migrate)
    return result
  } catch (error: any) {
    return { success: false, error: error.message || '设置路径失败' }
  }
}

/**
 * 重置为默认路径
 */
async function handleResetPath(
  _event: IpcMainInvokeEvent,
  migrate: boolean = true
): Promise<IpcResponse> {
  try {
    const service = DataPathService.getInstance()
    const result = await service.resetToDefault(migrate)
    return result
  } catch (error: any) {
    return { success: false, error: error.message || '重置路径失败' }
  }
}

/**
 * 获取迁移状态
 */
async function handleGetMigrationStatus(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse> {
  try {
    const service = DataPathService.getInstance()
    const status = service.getMigrationStatus()
    return { success: true, data: status }
  } catch (error: any) {
    return { success: false, error: error.message || '获取迁移状态失败' }
  }
}

/**
 * 计算数据大小
 */
async function handleCalculateSize(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse> {
  try {
    const service = DataPathService.getInstance()
    const sizeInfo = await service.calculateDataSize()
    return { success: true, data: sizeInfo }
  } catch (error: any) {
    return { success: false, error: error.message || '计算数据大小失败' }
  }
}

/**
 * 打开数据目录
 */
async function handleOpenFolder(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse> {
  try {
    const service = DataPathService.getInstance()
    const result = await service.openDataFolder()
    return result
  } catch (error: any) {
    return { success: false, error: error.message || '打开目录失败' }
  }
}