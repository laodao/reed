/**
 * 翻译 IPC 处理器
 * @module ipc/handlers/translation
 * @description 处理翻译相关的 IPC 请求
 */

import * as fs from 'fs'
import * as path from 'path'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { TranslationService } from '@core/services/translation.service'
import type {
  TextTranslationRequest,
  FileTranslationRequest,
  TranslationHistoryQuery
} from '@shared/types/translation.types'
import type { IpcResponse } from '@shared/types/ipc.types'

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

function loadElectron(): {
  BrowserWindow?: any
  dialog?: any
  shell?: any
} {
  if (!isElectron) return {}
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const e = require('electron')
  return { BrowserWindow: e.BrowserWindow, dialog: e.dialog, shell: e.shell }
}

/**
 * 注册翻译相关 IPC 处理器
 */
export function registerTranslationHandlers(): void {
  ipcBridge.handle('translation:providers', handleGetProviders)
  ipcBridge.handle('translation:text', handleTextTranslation)
  ipcBridge.handle('translation:file', handleFileTranslation)
  ipcBridge.handle('translation:select-file', handleSelectFile)
  ipcBridge.handle('translation:history', handleGetHistory)
  ipcBridge.handle('translation:get', handleGetTranslation)
  ipcBridge.handle('translation:toggle-favorite', handleToggleFavorite)
  ipcBridge.handle('translation:delete', handleDeleteTranslation)
  ipcBridge.handle('translation:download', handleDownloadTranslation)
  ipcBridge.handle('translation:open-folder', handleOpenFolder)

  console.log('[TranslationHandlers] 翻译 IPC 处理器已注册')
}

/**
 * 处理获取翻译提供商列表
 */
async function handleGetProviders(
  _event: any
): Promise<IpcResponse<any[]>> {
  const response = await TranslationService.getProviders()
  return response as any
}

/**
 * 处理文本翻译
 */
async function handleTextTranslation(
  _event: any,
  request: TextTranslationRequest
): Promise<IpcResponse<any>> {
  const response = await TranslationService.translateText(request)
  return response
}

/**
 * 处理文件翻译
 */
async function handleFileTranslation(
  _event: any,
  request: FileTranslationRequest
): Promise<IpcResponse<any>> {
  const response = await TranslationService.translateFile(request)
  return response as any
}

/**
 * 处理选择文件（dialog 仅在 Electron 端可用）
 */
async function handleSelectFile(
  event: any
): Promise<IpcResponse<{ path: string; name: string; size: number }>> {
  if (!isElectron) {
    return { success: false, error: '该功能仅在桌面端可用' }
  }
  const { BrowserWindow, dialog } = loadElectron()
  const window = BrowserWindow?.fromWebContents(event?.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const result = await dialog.showOpenDialog(window, {
    title: '选择要翻译的文件',
    filters: [{ name: '支持的文件', extensions: ['md', 'txt'] }],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: '未选择文件' }
  }

  const filePath = result.filePaths[0]
  const stats = fs.statSync(filePath)

  if (stats.size > 5 * 1024 * 1024) {
    return { success: false, error: '文件大小超过限制（最大 5MB）' }
  }

  return {
    success: true,
    data: {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
    },
  }
}

/**
 * 处理获取翻译历史
 */
async function handleGetHistory(
  _event: any,
  query: TranslationHistoryQuery
): Promise<IpcResponse<{ list: any[]; total: number }>> {
  try {
    const repo = getCoreDatabaseManager().translations
    if (!repo) {
      return { success: false, error: '数据库未初始化' }
    }
    const result = await repo.getList(query)
    return { success: true, data: result }
  } catch (error: any) {
    console.error('[handleGetHistory] 错误:', error)
    return { success: false, error: error.message || '获取历史失败' }
  }
}

/**
 * 处理获取翻译详情
 */
async function handleGetTranslation(
  _event: any,
  id: string
): Promise<IpcResponse<any>> {
  try {
    const repo = getCoreDatabaseManager().translations
    if (!repo) {
      return { success: false, error: '数据库未初始化' }
    }
    const record = await repo.getById(id)
    return { success: true, data: record }
  } catch (error: any) {
    console.error('[handleGetTranslation] 错误:', error)
    return { success: false, error: error.message || '获取详情失败' }
  }
}

/**
 * 处理切换收藏
 */
async function handleToggleFavorite(
  _event: any,
  id: string
): Promise<IpcResponse<boolean>> {
  try {
    const repo = getCoreDatabaseManager().translations
    if (!repo) {
      return { success: false, error: '数据库未初始化' }
    }
    const newFavorite = await repo.toggleFavorite(id)
    return { success: true, data: newFavorite }
  } catch (error: any) {
    console.error('[handleToggleFavorite] 错误:', error)
    return { success: false, error: error.message || '切换收藏失败' }
  }
}

/**
 * 处理删除翻译记录
 */
async function handleDeleteTranslation(
  _event: any,
  id: string
): Promise<IpcResponse<boolean>> {
  try {
    const repo = getCoreDatabaseManager().translations
    if (!repo) {
      return { success: false, error: '数据库未初始化' }
    }
    await repo.delete(id)
    return { success: true, data: true }
  } catch (error: any) {
    console.error('[handleDeleteTranslation] 错误:', error)
    return { success: false, error: error.message || '删除失败' }
  }
}

/**
 * 处理下载翻译结果（Electron 端通过 dialog；Web 端直接返回原文件路径，由前端走 /assets 下载）
 */
async function handleDownloadTranslation(
  event: any,
  id: string
): Promise<IpcResponse<string>> {
  try {
    const repo = getCoreDatabaseManager().translations
    if (!repo) {
      return { success: false, error: '数据库未初始化' }
    }
    const record = await repo.getById(id)

    if (!record || !record.targetFile) {
      return { success: false, error: '翻译结果不存在' }
    }

    if (!isElectron) {
      // Web 端：返回 targetFile 相对路径，前端通过 /assets 下载
      return { success: true, data: record.targetFile }
    }

    const { BrowserWindow, dialog } = loadElectron()
    const window = BrowserWindow?.fromWebContents(event?.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const result = await dialog.showSaveDialog(window, {
      title: '保存翻译结果',
      defaultPath: path.basename(record.targetFile),
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: 'Markdown 文件', extensions: ['md'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: '取消保存' }
    }

    fs.copyFileSync(record.targetFile, result.filePath)

    return { success: true, data: result.filePath }
  } catch (error: any) {
    console.error('[handleDownloadTranslation] 错误:', error)
    return { success: false, error: error.message || '下载失败' }
  }
}

/**
 * 处理打开文件夹（仅 Electron 端可用）
 */
async function handleOpenFolder(
  _event: any,
  filePath: string
): Promise<IpcResponse<boolean>> {
  if (!isElectron) {
    return { success: false, error: '该功能仅在桌面端可用' }
  }
  try {
    const { shell } = loadElectron()
    shell.showItemInFolder(filePath)
    return { success: true, data: true }
  } catch (error: any) {
    console.error('[handleOpenFolder] 错误:', error)
    return { success: false, error: error.message || '打开文件夹失败' }
  }
}
