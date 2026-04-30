/**
 * 图像生成 IPC 处理器
 * @module ipc/handlers/image
 * @description 处理渲染进程与主进程之间的图像生成相关通信
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { ImageService } from '@core/services/image.service'
import { getDatabaseManager } from '../../database'
import type { IpcResponse } from '@shared/types/ipc.types'
import type {
  ImageGenerationRequest,
  ImageTaskStatus,
  ImageProvider,
  ImageModel
} from '@shared/types/image-provider.types'
import type { ImageRecord } from '@shared/types'

/**
 * 注册图像生成相关 IPC 处理器
 */
export function registerImageHandlers(): void {
  // 图像生成相关
  ipcMain.handle('image:generate', handleImageGenerate)
  ipcMain.handle('image:task-status', handleImageTaskStatus)
  ipcMain.handle('image:stop', handleImageStop)

  // 图像管理相关
  ipcMain.handle('image:list', handleImageList)
  ipcMain.handle('image:get', handleImageGet)
  ipcMain.handle('image:toggle-favorite', handleImageToggleFavorite)
  ipcMain.handle('image:delete', handleImageDelete)
  ipcMain.handle('image:delete-many', handleImageDeleteMany)

  // Provider 相关
  ipcMain.handle('image:providers', handleImageProviders)
  ipcMain.handle('image:models', handleImageModels)
  ipcMain.handle('image:test-provider', handleImageTestProvider)

  // 下载相关
  ipcMain.handle('image:download', handleImageDownload)

  // 参考图片选择
  ipcMain.handle('image:select-file', handleImageSelectFile)
}

/**
 * 取消注册图像生成相关 IPC 处理器
 */
export function unregisterImageHandlers(): void {
  // 图像生成相关
  ipcMain.removeHandler('image:generate')
  ipcMain.removeHandler('image:task-status')
  ipcMain.removeHandler('image:stop')

  // 图像管理相关
  ipcMain.removeHandler('image:list')
  ipcMain.removeHandler('image:get')
  ipcMain.removeHandler('image:toggle-favorite')
  ipcMain.removeHandler('image:delete')
  ipcMain.removeHandler('image:delete-many')

  // Provider 相关
  ipcMain.removeHandler('image:providers')
  ipcMain.removeHandler('image:models')
  ipcMain.removeHandler('image:test-provider')

  // 下载相关
  ipcMain.removeHandler('image:download')

  // 参考图片选择
  ipcMain.removeHandler('image:select-file')
}

// ==================== 图像生成处理器 ====================

/**
 * 处理图像生成请求
 */
async function handleImageGenerate(
  _event: IpcMainInvokeEvent,
  request: ImageGenerationRequest
): Promise<IpcResponse<{ taskId: string }>> {
  try {
    const result = await ImageService.generateImage(request)
    if (result.success && result.taskId) {
      return { success: true, data: { taskId: result.taskId } }
    }
    return { success: false, error: result.error || '图像生成失败' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理查询任务状态请求
 */
async function handleImageTaskStatus(
  _event: IpcMainInvokeEvent,
  taskId: string
): Promise<IpcResponse<ImageTaskStatus>> {
  try {
    const result = await ImageService.getTaskStatus(taskId)
    return { success: true, data: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理停止生成请求
 */
async function handleImageStop(
  _event: IpcMainInvokeEvent,
  taskId: string
): Promise<IpcResponse<boolean>> {
  try {
    const result = await ImageService.stopGeneration(taskId)
    return { success: true, data: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

// ==================== 图像管理处理器 ====================

/**
 * 处理获取图像列表请求
 */
async function handleImageList(
  _event: IpcMainInvokeEvent,
  page?: number,
  pageSize?: number,
  favoriteOnly?: boolean,
  status?: string
): Promise<IpcResponse<{ images: ImageRecord[]; total: number; hasMore: boolean }>> {
  try {
    const result = await ImageService.getList(page, pageSize, favoriteOnly, status)
    // 服务层已经返回正确的响应结构，直接返回
    return result as IpcResponse<{ images: ImageRecord[]; total: number; hasMore: boolean }>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理获取单个图像请求
 */
async function handleImageGet(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<ImageRecord>> {
  try {
    const result = await ImageService.getById(id)
    // 服务层已经返回正确的响应结构，直接返回
    return result as IpcResponse<ImageRecord>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理切换收藏状态请求
 */
async function handleImageToggleFavorite(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<boolean>> {
  try {
    const result = await ImageService.toggleFavorite(id)
    // 服务层已经返回正确的响应结构，直接返回
    return result as IpcResponse<boolean>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理删除图像请求
 */
async function handleImageDelete(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<void>> {
  try {
    const result = await ImageService.delete(id)
    // 服务层已经返回正确的响应结构，直接返回
    return result as IpcResponse<void>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理批量删除图像请求
 */
async function handleImageDeleteMany(
  _event: IpcMainInvokeEvent,
  ids: string[]
): Promise<IpcResponse<number>> {
  try {
    const result = await ImageService.deleteMany(ids)
    // 服务层已经返回正确的响应结构，直接返回
    return result as IpcResponse<number>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

// ==================== Provider 处理器 ====================

/**
 * 处理获取 Provider 列表请求
 */
async function handleImageProviders(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse<ImageProvider[]>> {
  try {
    const result = await ImageService.getProviders()
    // 服务层已经返回正确的响应结构，直接返回
    return result as IpcResponse<ImageProvider[]>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理获取模型列表请求
 */
async function handleImageModels(
  _event: IpcMainInvokeEvent,
  providerId?: string
): Promise<IpcResponse<ImageModel[]>> {
  try {
    const result = await ImageService.getModels(providerId)
    // 服务层已经返回正确的响应结构，直接返回
    return result as IpcResponse<ImageModel[]>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理测试 Provider 连接请求
 */
async function handleImageTestProvider(
  _event: IpcMainInvokeEvent,
  providerId: string
): Promise<IpcResponse<{ success: boolean; message: string }>> {
  try {
    const result = await ImageService.testProvider(providerId)
    // testProvider 返回的是 { success, message }，需要包装成标准响应格式
    return { success: true, data: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 处理下载图像请求
 */
async function handleImageDownload(
  event: IpcMainInvokeEvent,
  imageId: string
): Promise<IpcResponse<string>> {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const dbManager = getDatabaseManager()
    if (!dbManager.images) {
      return { success: false, error: '数据库未初始化' }
    }
    const image = await dbManager.images.getById(imageId)
    if (!image) return { success: false, error: '图像不存在' }
    if (!image.filePath || !fs.existsSync(image.filePath)) {
      return { success: false, error: '图像文件不存在' }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const ext = path.extname(image.filePath) || '.png'
    const defaultName = `image_${timestamp}${ext}`

    const result = await dialog.showSaveDialog(window, {
      title: '保存图像',
      defaultPath: defaultName,
      filters: [
        { name: 'PNG 图像', extensions: ['png'] },
        { name: 'JPEG 图像', extensions: ['jpg', 'jpeg'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: '用户取消保存' }
    }

    fs.copyFileSync(image.filePath, result.filePath)
    return { success: true, data: result.filePath }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 获取文件的 MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * 处理选择参考图片请求
 */
async function handleImageSelectFile(
  event: IpcMainInvokeEvent
): Promise<IpcResponse<{ path: string; base64: string; name: string }>> {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const result = await dialog.showOpenDialog(window, {
      title: '选择参考图片',
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '未选择文件' }
    }

    const filePath = result.filePaths[0]

    // 检查文件大小（最大 10MB）
    const stats = fs.statSync(filePath)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (stats.size > maxSize) {
      return { success: false, error: '图片文件过大，最大支持 10MB' }
    }

    // 读取文件并转为 base64
    const buffer = fs.readFileSync(filePath)
    const base64 = buffer.toString('base64')
    const mimeType = getMimeType(filePath)
    const fileName = path.basename(filePath)

    return {
      success: true,
      data: {
        path: filePath,
        base64: `data:${mimeType};base64,${base64}`,
        name: fileName
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}