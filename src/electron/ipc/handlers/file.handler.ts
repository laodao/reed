/**
 * 文件操作 IPC 处理器
 * @module ipc/handlers/file
 */

import * as fs from 'fs'
import * as path from 'path'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { resolveAssetPath } from '@core/utils/asset-path'

/**
 * 把渲染端传来的路径统一解析为文件系统绝对路径：
 * - 'local-image://images/2026/x.png'（相对形态的 asset URL）→ 剥协议 → dataPath 拼接
 * - 'local-image:///C:/abs/x.png'（绝对形态的 asset URL）→ 剥协议 → 原样
 * - 普通绝对路径 → 原样
 * - 相对路径 → dataPath 拼接
 *
 * 此前由渲染端做字符串剥离（只处理了 'local-image:///' 三斜杠形态），
 * 新版相对路径 URL（两斜杠）剥不掉 → ENOENT（2026-07-25 下载报错修复）。
 */
function toFsPath(p: string): string {
  if (!p) return p
  const m = p.match(/^[a-z][a-z0-9+.-]*:\/\/\/?(.*)$/i)
  const stripped = m ? m[1] : p
  return resolveAssetPath(stripped)
}

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

function loadElectron(): { BrowserWindow?: any; dialog?: any } {
  if (!isElectron) return {}
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const e = require('electron')
  return { BrowserWindow: e.BrowserWindow, dialog: e.dialog }
}

const MIME_BY_EXT: Record<string, string> = {
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

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']

/**
 * 注册文件操作相关的 IPC 处理器
 */
export function registerFileHandlers(): void {
  ipcBridge.handle('file:open-dialog', handleOpenDialog)
  ipcBridge.handle('file:read-base64', handleReadBase64)
  ipcBridge.handle('file:save-dialog', handleSaveDialog)
  ipcBridge.handle('file:write-text', handleWriteText)
  ipcBridge.handle('file:open-folder-dialog', handleOpenFolderDialog)
  ipcBridge.handle('file:copy', handleCopy)
}

/**
 * 打开文件选择对话框
 */
async function handleOpenDialog(
  _event: any,
  options?: {
    multiple?: boolean
    filters?: Array<{ name: string; extensions: string[] }>
  }
): Promise<{ success: boolean; files?: any[]; error?: string }> {
  if (!isElectron) {
    // Web 端：通过 HTML <input type="file"> 实现，这里固定返回空列表，前端不应直接调用
    return { success: false, error: '请在前端使用 file input 选择文件', files: [] }
  }
  try {
    const { BrowserWindow, dialog } = loadElectron()
    const defaultFilters = [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
      { name: '文档文件', extensions: ['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
      { name: '所有文件', extensions: ['*'] }
    ]

    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: options?.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: options?.filters || defaultFilters
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, files: [] }
    }

    const files = result.filePaths.map((filePath: string) => {
      const stats = fs.statSync(filePath)
      const fileName = path.basename(filePath)
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream'
      const isImage = IMAGE_EXTS.includes(ext)
      return {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        fileName,
        filePath,
        fileSize: stats.size,
        mimeType,
        type: isImage ? 'image' : ('document' as const)
      }
    })

    return { success: true, files }
  } catch (error: any) {
    console.error('[file:open-dialog] 错误:', error)
    return { success: false, error: error.message, files: [] }
  }
}

/**
 * 读取文件为 Base64（用于图片预览）
 */
async function handleReadBase64(
  _event: any,
  filePath: string
): Promise<{ success: boolean; base64?: string; error?: string }> {
  try {
    const buffer = fs.readFileSync(filePath)
    const base64 = buffer.toString('base64')
    const ext = path.extname(filePath).toLowerCase().slice(1)
    const imageMime: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp'
    }
    const mimeType = imageMime[ext] || 'application/octet-stream'
    return { success: true, base64: `data:${mimeType};base64,${base64}` }
  } catch (error: any) {
    console.error('[file:read-base64] 错误:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 保存文件对话框
 */
async function handleSaveDialog(
  _event: any,
  options?: {
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }
): Promise<{ success: boolean; filePath?: string | null; error?: string }> {
  if (!isElectron) {
    return { success: false, error: '该功能仅在桌面端可用' }
  }
  try {
    const { BrowserWindow, dialog } = loadElectron()
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
}

/**
 * 写入文本文件
 */
async function handleWriteText(
  _event: any,
  data: { filePath: string; content: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    fs.writeFileSync(data.filePath, data.content, 'utf-8')
    return { success: true }
  } catch (error: any) {
    console.error('[file:write-text] 错误:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 打开文件夹选择对话框
 */
async function handleOpenFolderDialog(
  _event: any
): Promise<{ success: boolean; filePath?: string | null; error?: string }> {
  if (!isElectron) {
    return { success: false, error: '该功能仅在桌面端可用' }
  }
  try {
    const { BrowserWindow, dialog } = loadElectron()
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
}

/**
 * 复制文件
 */
async function handleCopy(
  _event: any,
  data: { sourcePath: string; targetPath: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    fs.copyFileSync(toFsPath(data.sourcePath), data.targetPath)
    return { success: true }
  } catch (error: any) {
    console.error('[file:copy] 错误:', error)
    return { success: false, error: error.message }
  }
}
