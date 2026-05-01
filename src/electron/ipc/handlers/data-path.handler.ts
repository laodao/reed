/**
 * 数据路径 IPC 处理器
 * @module ipc/handlers/data-path
 * @description 处理数据路径相关的 IPC 请求。Web 端数据路径由服务器统一管理（按用户隔离），
 *              本组 channel 仅在 Electron 端注册。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import type { IpcResponse } from '@shared/types/ipc.types'

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

/**
 * 注册数据路径相关 IPC 处理器（仅在 Electron 端注册）
 */
export function registerDataPathHandlers(): void {
  if (!isElectron) {
    console.log('[DataPathHandlers] 跳过注册：当前运行在 Web 端')
    return
  }

  ipcBridge.handle('data-path:get-config', handleGetConfig)
  ipcBridge.handle('data-path:select', handleSelectPath)
  ipcBridge.handle('data-path:set', handleSetPath)
  ipcBridge.handle('data-path:reset', handleResetPath)
  ipcBridge.handle('data-path:migration-status', handleGetMigrationStatus)
  ipcBridge.handle('data-path:calculate-size', handleCalculateSize)
  ipcBridge.handle('data-path:open-folder', handleOpenFolder)
}

function loadElectron(): { BrowserWindow?: any } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const e = require('electron')
  return { BrowserWindow: e.BrowserWindow }
}

async function getService() {
  const mod = await import('../../services/data-path.service')
  return mod.DataPathService.getInstance()
}

async function handleGetConfig(_event: any): Promise<IpcResponse> {
  try {
    const service = await getService()
    const config = await service.getConfig()
    return { success: true, data: config }
  } catch (error: any) {
    return { success: false, error: error.message || '获取配置失败' }
  }
}

async function handleSelectPath(event: any): Promise<IpcResponse> {
  try {
    const { BrowserWindow } = loadElectron()
    const window = BrowserWindow?.fromWebContents(event?.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }
    const service = await getService()
    return await service.selectDataPath(window)
  } catch (error: any) {
    return { success: false, error: error.message || '选择路径失败' }
  }
}

async function handleSetPath(
  _event: any,
  newPath: string,
  migrate: boolean = true
): Promise<IpcResponse> {
  try {
    const service = await getService()
    return await service.setDataPath(newPath, migrate)
  } catch (error: any) {
    return { success: false, error: error.message || '设置路径失败' }
  }
}

async function handleResetPath(
  _event: any,
  migrate: boolean = true
): Promise<IpcResponse> {
  try {
    const service = await getService()
    return await service.resetToDefault(migrate)
  } catch (error: any) {
    return { success: false, error: error.message || '重置路径失败' }
  }
}

async function handleGetMigrationStatus(_event: any): Promise<IpcResponse> {
  try {
    const service = await getService()
    return { success: true, data: service.getMigrationStatus() }
  } catch (error: any) {
    return { success: false, error: error.message || '获取迁移状态失败' }
  }
}

async function handleCalculateSize(_event: any): Promise<IpcResponse> {
  try {
    const service = await getService()
    const sizeInfo = await service.calculateDataSize()
    return { success: true, data: sizeInfo }
  } catch (error: any) {
    return { success: false, error: error.message || '计算数据大小失败' }
  }
}

async function handleOpenFolder(_event: any): Promise<IpcResponse> {
  try {
    const service = await getService()
    return await service.openDataFolder()
  } catch (error: any) {
    return { success: false, error: error.message || '打开目录失败' }
  }
}
