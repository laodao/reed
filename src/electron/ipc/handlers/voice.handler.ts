/**
 * 语音 IPC 处理器
 * @module ipc/handlers/voice
 * @description 处理语音相关的 IPC 请求
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { VoiceService } from '@core/services/voice.service'
import type {
  TTSRequest,
  STTRequest,
  VoiceCloneRequest,
  VoiceHistoryQuery
} from '@shared/types/voice.types'
import type { IpcResponse } from '@shared/types/ipc.types'

/**
 * 注册语音相关 IPC 处理器
 */
export function registerVoiceHandlers(): void {
  // 获取语音提供商列表
  ipcMain.handle('voice:providers', handleGetProviders)

  // 获取发音人列表
  ipcMain.handle('voice:voices', handleGetVoices)

  // 文本转语音
  ipcMain.handle('voice:tts', handleTTS)

  // 语音转文本
  ipcMain.handle('voice:stt', handleSTT)

  // 语音复刻
  ipcMain.handle('voice:clone', handleVoiceClone)

  // 选择音频文件
  ipcMain.handle('voice:select-file', handleSelectFile)

  // 获取语音历史
  ipcMain.handle('voice:history', handleGetHistory)

  // 删除语音记录
  ipcMain.handle('voice:delete', handleDeleteRecord)

  // 切换收藏
  ipcMain.handle('voice:toggle-favorite', handleToggleFavorite)

  // 获取复刻声音列表
  ipcMain.handle('voice:cloned-list', handleGetClonedVoices)

  // 删除复刻声音
  ipcMain.handle('voice:cloned-delete', handleDeleteClonedVoice)

  // 下载音频
  ipcMain.handle('voice:download', handleDownloadAudio)

  console.log('[VoiceHandlers] 语音 IPC 处理器已注册')
}

/**
 * 处理获取语音提供商列表
 */
async function handleGetProviders(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse<any[]>> {
  const response = await VoiceService.getProviders()
  return response as any
}

/**
 * 处理获取发音人列表
 */
async function handleGetVoices(
  _event: IpcMainInvokeEvent,
  providerId?: string,
  language?: string
): Promise<IpcResponse<any[]>> {
  const response = await VoiceService.getVoices(providerId, language)
  return response as any
}

/**
 * 处理文本转语音
 */
async function handleTTS(
  _event: IpcMainInvokeEvent,
  request: TTSRequest
): Promise<IpcResponse<any>> {
  const response = await VoiceService.generateSpeech(request)
  return response as any
}

/**
 * 处理语音转文本
 */
async function handleSTT(
  _event: IpcMainInvokeEvent,
  request: STTRequest
): Promise<IpcResponse<any>> {
  const response = await VoiceService.recognizeSpeech(request)
  return response as any
}

/**
 * 处理语音复刻
 */
async function handleVoiceClone(
  event: IpcMainInvokeEvent,
  request: VoiceCloneRequest
): Promise<IpcResponse<any>> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  // 语音复刻功能暂未实现
  return { success: false, error: '语音复刻功能暂未实现' }
}

/**
 * 处理选择音频文件
 */
async function handleSelectFile(
  event: IpcMainInvokeEvent
): Promise<IpcResponse<{ path: string; name: string; size: number }>> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  const result = await dialog.showOpenDialog(window, {
    title: '选择音频文件',
    filters: [
      { name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'webm'] },
    ],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: '未选择文件' }
  }

  const filePath = result.filePaths[0]
  const stats = fs.statSync(filePath)
  if (stats.size > 100 * 1024 * 1024) {
    return { success: false, error: '文件大小超过限制（最大 100MB）' }
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
 * 处理获取语音历史
 */
async function handleGetHistory(
  _event: IpcMainInvokeEvent,
  query: VoiceHistoryQuery
): Promise<IpcResponse<{ list: any[]; total: number }>> {
  const response = await VoiceService.getHistory(query)
  return response as any
}

/**
 * 处理删除语音记录
 */
async function handleDeleteRecord(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<boolean>> {
  const response = await VoiceService.deleteRecord(id)
  return response as any
}

/**
 * 处理切换收藏
 */
async function handleToggleFavorite(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<boolean>> {
  const response = await VoiceService.toggleFavorite(id)
  return response as any
}

/**
 * 处理获取复刻声音列表
 */
async function handleGetClonedVoices(
  _event: IpcMainInvokeEvent
): Promise<IpcResponse<any[]>> {
  // 暂未实现
  return { success: true, data: [] }
}

/**
 * 处理删除复刻声音
 */
async function handleDeleteClonedVoice(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<IpcResponse<boolean>> {
  // 暂未实现
  return { success: false, error: '功能暂未实现' }
}

/**
 * 处理下载音频
 */
async function handleDownloadAudio(
  event: IpcMainInvokeEvent,
  audioPath: string
): Promise<IpcResponse<{ savePath: string }>> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { success: false, error: '窗口不存在' }
  }

  if (!fs.existsSync(audioPath)) {
    return { success: false, error: '音频文件不存在' }
  }
  const fileName = path.basename(audioPath)

  const result = await dialog.showSaveDialog(window, {
    title: '保存音频文件',
    defaultPath: fileName,
    filters: [
      { name: 'WAV 音频', extensions: ['wav'] },
      { name: 'MP3 音频', extensions: ['mp3'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })

  if (result.canceled || !result.filePath) {
    return { success: false, error: '取消保存' }
  }

  const response = await VoiceService.copyAudio(audioPath, result.filePath)
  return response as any
}