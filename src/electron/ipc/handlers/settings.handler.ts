/**
 * 设置 IPC 处理器
 * @module ipc/handlers/settings
 * @description 处理设置相关的 IPC 请求；通过 ipcBridge 同时注册到 Electron ipcMain
 *              和跨平台 IPC 桥（Web 端 HTTP /api/ipc/* 用同一份注册表派发）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'

/**
 * 注册设置相关 IPC 处理器
 */
export function registerSettingsHandlers(): void {
  ipcBridge.handle('settings:get', handleGetSettings)
  ipcBridge.handle('settings:set', handleSetSettings)
}

/**
 * 处理获取设置请求
 * @param _event - IPC 事件对象（Web 端为 fake；不被使用）
 * @param key - 设置键名（可选）
 */
async function handleGetSettings(
  _event: any,
  key?: string,
): Promise<{ success: boolean; data?: any }> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.settings) {
      return { success: false }
    }

    if (key) {
      const value = await dbManager.settings.get(key)
      return { success: true, data: value }
    } else {
      const allSettings = await dbManager.settings.getAll()
      return { success: true, data: allSettings }
    }
  } catch (error) {
    console.error('获取设置失败:', error)
    return { success: false }
  }
}

/**
 * 处理保存设置请求
 */
async function handleSetSettings(
  _event: any,
  payload: { key: string; value: any },
): Promise<{ success: boolean }> {
  try {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.settings) {
      return { success: false }
    }

    await dbManager.settings.set(payload.key, payload.value)
    return { success: true }
  } catch (error) {
    console.error('保存设置失败:', error)
    return { success: false }
  }
}

/**
 * 注销设置相关 IPC 处理器
 */
export function unregisterSettingsHandlers(): void {
  ipcBridge.removeHandler('settings:get')
  ipcBridge.removeHandler('settings:set')
}
