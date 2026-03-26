/**
 * 文件操作 IPC 处理器
 * @module ipc/handlers/file
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 注册文件操作相关的 IPC 处理器
 */
export function registerFileHandlers(): void {
  /**
   * 打开文件选择对话框
   */
  ipcMain.handle('file:open-dialog', async (_event, options?: {
    multiple?: boolean
    filters?: Array<{ name: string; extensions: string[] }>
  }) => {
    try {
      const defaultFilters = [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
        { name: '文档文件', extensions: ['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
        { name: '所有文件', extensions: ['*'] }
      ]

      const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
        properties: options?.multiple
          ? ['openFile', 'multiSelections']
          : ['openFile'],
        filters: options?.filters || defaultFilters
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, files: [] }
      }

      // 获取文件信息
      const files = result.filePaths.map(filePath => {
        const stats = fs.statSync(filePath)
        const fileName = path.basename(filePath)
        const ext = path.extname(filePath).toLowerCase().slice(1)

        // 根据 extension 确定 MIME 类型
        const mimeTypes: Record<string, string> = {
          // 图片
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
          bmp: 'image/bmp',
          // 文档
          pdf: 'application/pdf',
          txt: 'text/plain',
          md: 'text/markdown',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ppt: 'application/vnd.ms-powerpoint',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        }

        const mimeType = mimeTypes[ext] || 'application/octet-stream'

        // 判断文件类型
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)

        return {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          fileName,
          filePath,
          fileSize: stats.size,
          mimeType,
          type: isImage ? 'image' : 'document' as const
        }
      })

      return { success: true, files }
    } catch (error: any) {
      console.error('[file:open-dialog] 错误:', error)
      return { success: false, error: error.message, files: [] }
    }
  })

  /**
   * 读取文件为 Base64（用于图片预览）
   */
  ipcMain.handle('file:read-base64', async (_event, filePath: string) => {
    try {
      const buffer = fs.readFileSync(filePath)
      const base64 = buffer.toString('base64')

      // 获取 MIME 类型
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const mimeTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp'
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'

      return {
        success: true,
        base64: `data:${mimeType};base64,${base64}`
      }
    } catch (error: any) {
      console.error('[file:read-base64] 错误:', error)
      return { success: false, error: error.message }
    }
  })

  /**
   * 保存文件对话框
   */
  ipcMain.handle('file:save-dialog', async (_event, options?: {
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }) => {
    try {
      const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
        defaultPath: options?.defaultPath,
        filters: options?.filters || [
          { name: 'Markdown 文件', extensions: ['md'] },
          { name: '文本文件', extensions: ['txt'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: true, filePath: null }
      }

      return { success: true, filePath: result.filePath }
    } catch (error: any) {
      console.error('[file:save-dialog] 错误:', error)
      return { success: false, error: error.message }
    }
  })

  /**
   * 写入文本文件
   */
  ipcMain.handle('file:write-text', async (_event, data: { filePath: string; content: string }) => {
    try {
      fs.writeFileSync(data.filePath, data.content, 'utf-8')
      return { success: true }
    } catch (error: any) {
      console.error('[file:write-text] 错误:', error)
      return { success: false, error: error.message }
    }
  })

  /**
   * 打开文件夹选择对话框
   */
  ipcMain.handle('file:open-folder-dialog', async () => {
    try {
      const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
        properties: ['openDirectory', 'createDirectory']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, filePath: null }
      }

      return { success: true, filePath: result.filePaths[0] }
    } catch (error: any) {
      console.error('[file:open-folder-dialog] 错误:', error)
      return { success: false, error: error.message }
    }
  })
}
