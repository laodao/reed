/**
 * 设置IPC处理器
 * @module ipc/handlers/settings
 * @description 处理设置相关的IPC请求
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getDatabaseManager } from '../../database'

/**
 * 注册设置相关IPC处理器
 */
export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', handleGetSettings)
  ipcMain.handle('settings:set', handleSetSettings)
}

/**
 * 处理获取设置请求
 * @param event - IPC事件对象
 * @param key - 设置键名（可选）
 * @returns Promise<{ success: boolean, data?: any }>
 */
async function handleGetSettings(
  event: IpcMainInvokeEvent,
  key?: string
): Promise<{ success: boolean; data?: any }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.settings) {
      return { success: false }
    }

    if (key) {
      const value = dbManager.settings.get(key)
      return { success: true, data: value }
    } else {
      const allSettings = dbManager.settings.getAll()
      return { success: true, data: allSettings }
    }
  } catch (error) {
    console.error('获取设置失败:', error)
    return { success: false }
  }
}

/**
 * 处理保存设置请求
 * @param event - IPC事件对象
 * @param payload - { key: string, value: any }
 * @returns Promise<{ success: boolean }>
 */
async function handleSetSettings(
  event: IpcMainInvokeEvent,
  payload: { key: string; value: any }
): Promise<{ success: boolean }> {
  try {
    const dbManager = getDatabaseManager()
    if (!dbManager.settings) {
      return { success: false }
    }

    dbManager.settings.set(payload.key, payload.value)
    return { success: true }
  } catch (error) {
    console.error('保存设置失败:', error)
    return { success: false }
  }
}

/**
 * 注销设置相关IPC处理器
 */
export function unregisterSettingsHandlers(): void {
  ipcMain.removeHandler('settings:get')
  ipcMain.removeHandler('settings:set')
}
