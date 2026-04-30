/**
 * 翻译 IPC 处理器
 * @module ipc/handlers/translation
 * @description 处理翻译相关的 IPC 请求
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { TranslationService } from '../../services/translation.service'
import { getDatabaseManager } from '../../database'
import type {
  TextTranslationRequest,
  FileTranslationRequest,
  TranslationHistoryQuery
} from '@shared/types/translation.types'
import type { IpcResponse } from '@shared/types/ipc.types'

/**
 * 注册翻译相关 IPC 处理器
 */
export function registerTranslationHandlers(): void {
  // 获取翻译提供商列表
  ipcMain.handle('translation:providers', handleGetProviders)

  // 文本翻译
  ipcMain.handle('translation:text', handleTextTranslation)

  // 文件翻译
  ipcMain.handle('translation:file', handleFileTranslation)

  // 选择文件
  ipcMain.handle('translation:select-file', handleSelectFile)

  // 获取翻译历史
  ipcMain.handle('translation:history', handleGetHistory)

  // 获取翻译详情
  ipcMain.handle('translation:get', handleGetTranslation)

  // 切换收藏
  ipcMain.handle('translation:toggle-favorite', handleToggleFavorite)

  // 删除翻译记录
  ipcMain.handle('translation:delete', handleDeleteTranslation)

  // 下载翻译结果
  ipcMain.handle('translation:download', handleDownloadTranslation)

  // 打开文件夹
  ipcMain.handle('translation:open-folder', handleOpenFolder)

  console.log('[TranslationHandlers] 翻译 IPC 处理器已注册')
}

/**
 * 处理获取翻译提供商列表
 */
async function handleGetProviders(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse<any[]>> {
  const response = await TranslationService.getProviders()
  return response as any
}

/**
 * 处理文本翻译
 */
async function handleTextTranslation(
  _event: IpcMainInvokeEvent,
  request: TextTranslationRequest
): Promise<IpcResponse<TextTranslationResponse['data']>> {
  const response = await TranslationService.translateText(request)
  return response
}

/**
 * 处理文件翻译
 */
async function handleFileTranslation(
  event: IpcMainInvokeEvent,
  request: FileTranslationRequest
): Promise<IpcResponse<FileTranslationRequest['data']>> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const response = await TranslationService.translateFile(window, request)
  return response as any
}

/**
 * 处理选择文件
 */
async function handleSelectFile(
  event: IpcMainInvokeEvent
): Promise<IpcResponse<{ path: string; name: string; size: number }>> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const response = await TranslationService.selectFile(window)
  return response
}

/**
 * 处理获取翻译历史
 */
async function handleGetHistory(
  _event: IpcMainInvokeEvent,
  query: TranslationHistoryQuery
): Promise<IpcResponse<{ list: any[]; total: number }>> {
  try {
    const repo = getDatabaseManager().translations
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
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<any>> {
  try {
    const repo = getDatabaseManager().translations
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
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<boolean>> {
  try {
    const repo = getDatabaseManager().translations
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
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<boolean>> {
  try {
    const repo = getDatabaseManager().translations
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
 * 处理下载翻译结果
 */
async function handleDownloadTranslation(
  event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<string>> {
  try {
    const repo = getDatabaseManager().translations
    if (!repo) {
      return { success: false, error: '数据库未初始化' }
    }
    const record = await repo.getById(id)

    if (!record || !record.targetFile) {
      return { success: false, error: '翻译结果不存在' }
    }

    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const { dialog } = require('electron')
    const path = require('path')
    const fs = require('fs')

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
 * 处理打开文件夹
 */
async function handleOpenFolder(
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<IpcResponse<boolean>> {
  try {
    const { shell } = require('electron')
    shell.showItemInFolder(filePath)
    return { success: true, data: true }
  } catch (error: any) {
    console.error('[handleOpenFolder] 错误:', error)
    return { success: false, error: error.message || '打开文件夹失败' }
  }
}