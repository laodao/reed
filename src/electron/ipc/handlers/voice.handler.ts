/**
 * 语音 IPC 处理器
 * @module electron/ipc/handlers/voice
 * @description 处理语音相关的 IPC 请求
 */

import * as fs from 'fs'
import * as path from 'path'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { VoiceService } from '@core/platform/services/voice.service'
import { VoiceCloneService } from '@core/platform/services/voice-clone.service'
import { VoiceDesignService } from '@core/platform/services/voice-design.service'
import { VoiceCloneJobScheduler } from '@core/platform/services/voice-clone-job-scheduler'
import type {
  TTSRequest,
  STTRequest,
  ClonedVoiceStatus,
  DesignedVoiceStatus,
  VoiceCloneCreateRequest,
  VoiceDesignCreateRequest,
  VoiceHistoryQuery,
} from '@shared/types/voice.types'
import type { IpcResponse } from '@shared/types/ipc.types'

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

function loadElectron(): { BrowserWindow?: any; dialog?: any } {
  if (!isElectron) return {}
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
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
  ipcBridge.handle('voice:clone-refresh-status', handleRefreshCloneStatus)
  ipcBridge.handle('voice:preview', handlePreviewClonedVoice)
  ipcBridge.handle('voice:download', handleDownloadAudio)
  // 新增：音频分析（使用 ffprobe，避免渲染进程崩溃）
  ipcBridge.handle('voice:analyze-audio', handleAnalyzeAudio)
  // 新增：声音设计（通过文本描述创建音色）
  ipcBridge.handle('voice:design', handleVoiceDesign)
  ipcBridge.handle('voice:designed-list', handleGetDesignedVoices)
  ipcBridge.handle('voice:designed-delete', handleDeleteDesignedVoice)
  ipcBridge.handle('voice:design-refresh-status', handleRefreshDesignStatus)
  ipcBridge.handle('voice:design-preview', handlePreviewDesignedVoice)

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
  request: VoiceCloneCreateRequest,
): Promise<IpcResponse<any>> {
  const result = await VoiceCloneService.cloneVoice(request)
  // 创建成功后立刻把 id 加入 scheduler 轮询队列
  if (result.success && result.data?.id) {
    try {
      VoiceCloneJobScheduler.getInstance().scheduleOne(result.data.id)
    } catch (e: any) {
      console.warn('[voice:clone] scheduler 入队失败（不影响主流程）:', e?.message ?? e)
    }
  }
  return result as any
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

/**
 * 分析音频文件（使用 ffprobe）
 * 返回时长（秒）和声道数
 *
 * 此处理器用于替代前端 Web Audio API 的 decodeAudioData，
 * 避免某些音频格式导致渲染进程崩溃。
 */
async function handleAnalyzeAudio(
  _event: any,
  filePath: string,
): Promise<IpcResponse<{ durationSec: number; channels: number }>> {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: '音频文件不存在' }
  }

  try {
    // 使用 ffprobe 分析音频
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const ffprobePath = require('@ffprobe-installer/ffprobe').path

    // 使用 spawn 执行 ffprobe
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { spawnSync } = require('child_process')

    const result = spawnSync(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=channels',
      '-of', 'json',
      filePath,
    ], {
      encoding: 'utf8',
      timeout: 10000, // 10秒超时
    })

    if (result.error) {
      console.error('[voice:analyze-audio] ffprobe 执行错误:', result.error)
      return { success: false, error: `音频分析失败：${result.error.message}` }
    }

    if (result.status !== 0) {
      console.error('[voice:analyze-audio] ffprobe 返回非零状态:', result.stderr)
      return { success: false, error: `音频分析失败：ffprobe 返回错误` }
    }

    const jsonOutput = JSON.parse(result.stdout)

    // 从 format 提取时长
    const duration = parseFloat(jsonOutput.format?.duration || '0')

    // 从 stream 提取声道数（取第一个音频流）
    const streams = jsonOutput.streams || []
    const audioStream = streams.find((s: any) => s.channels !== undefined)
    const channels = audioStream?.channels || 1

    if (duration <= 0) {
      return { success: false, error: '无法获取音频时长' }
    }

    return {
      success: true,
      data: {
        durationSec: duration,
        channels: channels,
      },
    }
  } catch (e: any) {
    console.error('[voice:analyze-audio] 异常:', e)
    return { success: false, error: `音频分析异常：${e?.message || e}` }
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

async function handleGetClonedVoices(
  _event: any,
  status?: ClonedVoiceStatus,
): Promise<IpcResponse<any[]>> {
  const r = await VoiceCloneService.listClonedVoices(status)
  return r as any
}

async function handleDeleteClonedVoice(
  _event: any,
  id: string,
): Promise<IpcResponse<{ deleted: boolean }>> {
  const r = await VoiceCloneService.deleteClonedVoice(id)
  return r as any
}

async function handleRefreshCloneStatus(
  _event: any,
  id: string,
): Promise<IpcResponse<any>> {
  const r = await VoiceCloneService.refreshClonedVoiceStatus(id)
  return r as any
}

async function handlePreviewClonedVoice(
  _event: any,
  id: string,
  text?: string,
): Promise<IpcResponse<{ audioPath: string }>> {
  const r = await VoiceCloneService.previewClonedVoice(id, text)
  return r as any
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

// ===== 声音设计 handlers =====

async function handleVoiceDesign(
  _event: any,
  request: VoiceDesignCreateRequest,
): Promise<IpcResponse<any>> {
  const result = await VoiceDesignService.designVoice(request)
  return result as any
}

async function handleGetDesignedVoices(
  _event: any,
  status?: DesignedVoiceStatus,
): Promise<IpcResponse<any[]>> {
  const r = await VoiceDesignService.listDesignedVoices(status)
  return r as any
}

async function handleDeleteDesignedVoice(
  _event: any,
  id: string,
): Promise<IpcResponse<{ deleted: boolean }>> {
  const r = await VoiceDesignService.deleteDesignedVoice(id)
  return r as any
}

async function handleRefreshDesignStatus(
  _event: any,
  id: string,
): Promise<IpcResponse<any>> {
  const r = await VoiceDesignService.refreshDesignedVoiceStatus(id)
  return r as any
}

async function handlePreviewDesignedVoice(
  _event: any,
  id: string,
): Promise<IpcResponse<{ audioPath: string }>> {
  const r = await VoiceDesignService.previewDesignedVoice(id)
  return r as any
}
