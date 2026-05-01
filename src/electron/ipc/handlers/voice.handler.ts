/**
 * 语音 IPC 处理器
 * @module ipc/handlers/voice
 * @description 处理语音相关的 IPC 请求
 */

import * as fs from 'fs'
import * as path from 'path'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { VoiceService } from '@core/services/voice.service'
import type {
  TTSRequest,
  STTRequest,
  VoiceCloneRequest,
  VoiceHistoryQuery
} from '@shared/types/voice.types'
import type { IpcResponse } from '@shared/types/ipc.types'

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

function loadElectron(): { BrowserWindow?: any; dialog?: any } {
  if (!isElectron) return {}
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const e = require('electron')
  return { BrowserWindow: e.BrowserWindow, dialog: e.dialog }
}

/**
 * 注册语音相关 IPC 处理器
 */
export function registerVoiceHandlers(): void {
  ipcBridge.handle('voice:providers', handleGetProviders)
  ipcBridge.handle('voice:voices', handleGetVoices)
  ipcBridge.handle('voice:tts', handleTTS)
  ipcBridge.handle('voice:stt', handleSTT)
  ipcBridge.handle('voice:clone', handleVoiceClone)
  ipcBridge.handle('voice:select-file', handleSelectFile)
  ipcBridge.handle('voice:history', handleGetHistory)
  ipcBridge.handle('voice:delete', handleDeleteRecord)
  ipcBridge.handle('voice:toggle-favorite', handleToggleFavorite)
  ipcBridge.handle('voice:cloned-list', handleGetClonedVoices)
  ipcBridge.handle('voice:cloned-delete', handleDeleteClonedVoice)
  ipcBridge.handle('voice:download', handleDownloadAudio)

  console.log('[VoiceHandlers] 语音 IPC 处理器已注册')
}

async function handleGetProviders(_event: any): Promise<IpcResponse<any[]>> {
  const response = await VoiceService.getProviders()
  return response as any
}

async function handleGetVoices(
  _event: any,
  providerId?: string,
  language?: string
): Promise<IpcResponse<any[]>> {
  const response = await VoiceService.getVoices(providerId, language)
  return response as any
}

async function handleTTS(_event: any, request: TTSRequest): Promise<IpcResponse<any>> {
  const response = await VoiceService.generateSpeech(request)
  return response as any
}

async function handleSTT(_event: any, request: STTRequest): Promise<IpcResponse<any>> {
  const response = await VoiceService.recognizeSpeech(request)
  return response as any
}

async function handleVoiceClone(
  _event: any,
  _request: VoiceCloneRequest
): Promise<IpcResponse<any>> {
  return { success: false, error: '语音复刻功能暂未实现' }
}

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
    title: '选择音频文件',
    filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'webm'] }],
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

async function handleGetHistory(
  _event: any,
  query: VoiceHistoryQuery
): Promise<IpcResponse<{ list: any[]; total: number }>> {
  const response = await VoiceService.getHistory(query)
  return response as any
}

async function handleDeleteRecord(_event: any, id: string): Promise<IpcResponse<boolean>> {
  const response = await VoiceService.deleteRecord(id)
  return response as any
}

async function handleToggleFavorite(_event: any, id: string): Promise<IpcResponse<boolean>> {
  const response = await VoiceService.toggleFavorite(id)
  return response as any
}

async function handleGetClonedVoices(_event: any): Promise<IpcResponse<any[]>> {
  return { success: true, data: [] }
}

async function handleDeleteClonedVoice(
  _event: any,
  _id: string
): Promise<IpcResponse<boolean>> {
  return { success: false, error: '功能暂未实现' }
}

async function handleDownloadAudio(
  event: any,
  audioPath: string
): Promise<IpcResponse<{ savePath: string }>> {
  if (!isElectron) {
    // Web 端：直接返回相对路径，前端走 /assets 下载
    return { success: true, data: { savePath: audioPath } }
  }
  const { BrowserWindow, dialog } = loadElectron()
  const window = BrowserWindow?.fromWebContents(event?.sender)
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
