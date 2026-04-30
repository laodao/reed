/**
 * 语音服务
 * @module services/voice-service
 * @description 处理文本转语音、语音转文本、语音复刻等核心功能
 */

import { BrowserWindow, dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDatabaseManager } from '../database'
import { VoiceRepository } from '@core/database/repositories/voice.repository'
import { ClonedVoiceRepository } from '@core/database/repositories/cloned-voice.repository'
import { PROVIDER_TEMPLATES } from './provider-template.service'
import { SecureStorageService } from './secure-storage.service'
import { DataPathService } from './data-path.service'
import { DashScopeTTSProvider } from '@core/voice-providers/dashscope-tts-provider'
import { DashScopeSTTProvider } from '@core/voice-providers/dashscope-stt-provider'
import type {
  TTSRequest,
  TTSResponse,
  STTRequest,
  STTResponse,
  VoiceProvider,
  VoiceSpeaker
} from '@shared/types/voice.types'

/**
 * 语音服务
 */
export class VoiceService {
  /**
   * 获取语音仓库（复用 DatabaseManager 集中管理的实例）
   */
  private static getVoiceRepository(): VoiceRepository {
    const repo = getDatabaseManager().voices
    if (!repo) throw new Error('VoiceRepository not initialized')
    return repo
  }

  /**
   * 获取复刻声音仓库（复用 DatabaseManager 集中管理的实例）
   */
  private static getClonedVoiceRepository(): ClonedVoiceRepository {
    const repo = getDatabaseManager().clonedVoices
    if (!repo) throw new Error('ClonedVoiceRepository not initialized')
    return repo
  }

  /**
   * 获取语音数据目录
   */
  private static getVoiceDataDir(): string {
    // 使用 DataPathService 获取正确的数据路径
    const dataPathService = DataPathService.getInstance()
    const userDataPath = dataPathService.getDataPath()
    const voiceDir = path.join(userDataPath, 'voice')

    // 确保目录存在
    if (!fs.existsSync(voiceDir)) {
      fs.mkdirSync(voiceDir, { recursive: true })
    }

    return voiceDir
  }

  /**
   * 获取TTS音频目录
   */
  private static getTTSDir(): string {
    const ttsDir = path.join(this.getVoiceDataDir(), 'tts')
    if (!fs.existsSync(ttsDir)) {
      fs.mkdirSync(ttsDir, { recursive: true })
    }
    return ttsDir
  }

  /**
   * 获取STT音频目录
   */
  private static getSTTDir(): string {
    const sttDir = path.join(this.getVoiceDataDir(), 'stt')
    if (!fs.existsSync(sttDir)) {
      fs.mkdirSync(sttDir, { recursive: true })
    }
    return sttDir
  }

  /**
   * 获取复刻声音样本目录
   */
  private static getCloneDir(): string {
    const cloneDir = path.join(this.getVoiceDataDir(), 'clone')
    if (!fs.existsSync(cloneDir)) {
      fs.mkdirSync(cloneDir, { recursive: true })
    }
    return cloneDir
  }

  /**
   * 获取语音提供商列表
   * 注意：语音功能使用已有的 AI 提供商配置
   */
  static async getProviders(): Promise<{ success: boolean; data?: VoiceProvider[]; error?: string }> {
    try {
      const dbManager = getDatabaseManager()
      if (!dbManager.providerConfigs) {
        return { success: false, error: '数据库未初始化' }
      }

      const configs = await dbManager.providerConfigs.getEnabled()
      const providers: VoiceProvider[] = []

      for (const config of configs) {
        // 检查是否已配置 API Key
        const configured = !!config.apiKey
        if (!configured) {
          continue
        }

        const models: Array<{ id: string; name: string }> = []

        // 从配置中获取模型 - 只保留音频模型
        if (config.models && Array.isArray(config.models)) {
          for (const model of config.models) {
            // 只包含音频类型的模型
            if (model.type === 'audio') {
              models.push({
                id: model.id,
                name: model.name || model.id
              })
            }
          }
        }

        // 如果没有音频模型，跳过这个提供商
        if (models.length === 0) {
          continue
        }

        providers.push({
          id: config.id,
          name: config.name,
          type: 'both', // 支持 TTS 和 STT
          models,
          configured
        })
      }

      return { success: true, data: providers }
    } catch (error: any) {
      console.error('[VoiceService.getProviders] 错误:', error)
      return { success: false, error: error.message || '获取提供商列表失败' }
    }
  }

  /**
   * 获取可用发音人列表
   */
  static async getVoices(providerId?: string, language?: string): Promise<{ success: boolean; data?: VoiceSpeaker[]; error?: string }> {
    try {
      // 使用 DashScope TTS Provider 获取发音人
      const ttsProvider = new DashScopeTTSProvider({ apiKey: '' })
      const dashscopeVoices = await ttsProvider.getVoices(language)

      // 获取用户复刻的声音
      const clonedVoiceRepo = this.getClonedVoiceRepository()
      const clonedVoices = await clonedVoiceRepo.getByStatus('ready')

      const clonedSpeakers: VoiceSpeaker[] = clonedVoices.map(v => ({
        id: v.voiceId || v.id,
        name: `${v.name} (复刻)`,
        language: 'zh',
        isCloned: true
      }))

      // 合并预置发音人和复刻声音
      const allVoices = [...dashscopeVoices, ...clonedSpeakers]

      return { success: true, data: allVoices }
    } catch (error: any) {
      console.error('[VoiceService.getVoices] 错误:', error)
      return { success: false, error: error.message || '获取发音人列表失败' }
    }
  }

  /**
   * 文本转语音
   */
  static async generateSpeech(
    window: BrowserWindow,
    request: TTSRequest
  ): Promise<TTSResponse> {
    try {
      // 文本长度检查
      if (!request.text || request.text.length === 0) {
        return { success: false, error: '文本不能为空' }
      }
      if (request.text.length > 5000) {
        return { success: false, error: '文本超过 5000 字符限制' }
      }

      const dbManager = getDatabaseManager()
      if (!dbManager.providerConfigs) {
        return { success: false, error: '数据库未初始化' }
      }

      // 获取提供商配置
      let providerConfig = null
      if (request.providerId) {
        providerConfig = await dbManager.providerConfigs.getById(request.providerId)
      }
      if (!providerConfig) {
        providerConfig = await dbManager.providerConfigs.getDefault()
      }
      if (!providerConfig) {
        const enabledConfigs = await dbManager.providerConfigs.getEnabled()
        if (enabledConfigs.length > 0) {
          providerConfig = enabledConfigs[0]
        }
      }

      if (!providerConfig) {
        return { success: false, error: '暂无可用的语音服务，请先配置 AI 提供商' }
      }

      if (!providerConfig.apiKey) {
        return { success: false, error: `提供商 "${providerConfig.name}" 未配置 API 密钥` }
      }

      // 解密 API 密钥
      let decryptedApiKey: string
      try {
        const secureStorage = SecureStorageService.getInstance()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        decryptedApiKey = secureStorage.decrypt(providerConfig.apiKey)
      } catch (decryptError) {
        return { success: false, error: 'API 密钥解密失败，请重新配置提供商' }
      }

      // 创建语音记录
      const voiceRepo = this.getVoiceRepository()
      const record = await voiceRepo.create({
        type: 'tts',
        status: 'processing',
        inputText: request.text,
        voiceId: request.voiceId,
        voiceName: request.voiceId,
        language: request.language,
        speed: request.speed,
        pitch: request.pitch,
        volume: request.volume,
        emotion: request.emotion,
        style: request.style,
        providerId: providerConfig.id,
        modelId: request.modelId,
        favorite: false
      })

      // 使用 DashScope TTS Provider
      // 注意：audioBaseUrl 可能配置的是其他服务的 URL，所以优先使用默认 TTS URL
      const ttsProvider = new DashScopeTTSProvider({
        apiKey: decryptedApiKey,
        baseUrl: undefined // 使用默认的 DashScope TTS URL
      })

      // 调用 TTS API
      const result = await ttsProvider.synthesize(request.text, request.voiceId, {
        speed: request.speed,
        pitch: request.pitch,
        volume: request.volume,
        language: request.language
      })

      if (!result.success) {
        await voiceRepo.update(record.id, {
          status: 'failed',
          errorMessage: result.error || '语音生成失败'
        })
        return { success: false, error: result.error || '语音生成失败' }
      }

      // 保存音频文件（WAV 格式）
      const audioFileName = `${record.id}.wav`
      const audioPath = path.join(this.getTTSDir(), audioFileName)

      if (result.audioData) {
        // 确保 audioData 是字符串
        const audioBase64 = typeof result.audioData === 'string'
          ? result.audioData
          : JSON.stringify(result.audioData)

        if (typeof result.audioData !== 'string') {
          console.error('[VoiceService] audioData 不是字符串:', typeof result.audioData)
        }

        const audioBuffer = Buffer.from(audioBase64, 'base64')
        fs.writeFileSync(audioPath, audioBuffer)
      } else {
        await voiceRepo.update(record.id, {
          status: 'failed',
          errorMessage: '未获取到音频数据'
        })
        return { success: false, error: '未获取到音频数据' }
      }

      // 更新记录
      await voiceRepo.update(record.id, {
        status: 'completed',
        outputAudioPath: audioPath
      })

      // 通知前端完成
      window.webContents.send('voice:tts-completed', {
        recordId: record.id,
        audioPath
      })

      return {
        success: true,
        data: {
          audioPath,
          duration: 0 // TODO: 计算音频时长
        }
      }
    } catch (error: any) {
      console.error('[VoiceService.generateSpeech] 错误:', error)
      return { success: false, error: error.message || '语音生成失败' }
    }
  }

  /**
   * 语音转文本
   */
  static async recognizeSpeech(
    window: BrowserWindow,
    request: STTRequest
  ): Promise<STTResponse> {
    try {
      const dbManager = getDatabaseManager()
      if (!dbManager.providerConfigs) {
        return { success: false, error: '数据库未初始化' }
      }

      // 获取提供商配置
      let providerConfig = null
      if (request.providerId) {
        providerConfig = await dbManager.providerConfigs.getById(request.providerId)
      }
      if (!providerConfig) {
        providerConfig = await dbManager.providerConfigs.getDefault()
      }
      if (!providerConfig) {
        const enabledConfigs = await dbManager.providerConfigs.getEnabled()
        if (enabledConfigs.length > 0) {
          providerConfig = enabledConfigs[0]
        }
      }

      if (!providerConfig) {
        return { success: false, error: '暂无可用的语音服务，请先配置 AI 提供商' }
      }

      if (!providerConfig.apiKey) {
        return { success: false, error: `提供商 "${providerConfig.name}" 未配置 API 密钥` }
      }

      // 解密 API 密钥
      let decryptedApiKey: string
      try {
        const secureStorage = SecureStorageService.getInstance()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        decryptedApiKey = secureStorage.decrypt(providerConfig.apiKey)
      } catch (decryptError) {
        return { success: false, error: 'API 密钥解密失败，请重新配置提供商' }
      }

      // 创建语音记录
      const voiceRepo = this.getVoiceRepository()
      const record = await voiceRepo.create({
        type: 'stt',
        status: 'processing',
        inputAudioPath: request.audioPath,
        providerId: providerConfig.id,
        modelId: request.modelId,
        favorite: false
      })

      // 获取音频数据
      let audioData: Buffer | null = null
      if (request.audioPath && fs.existsSync(request.audioPath)) {
        audioData = fs.readFileSync(request.audioPath)
      } else if (request.audioData) {
        audioData = Buffer.from(request.audioData, 'base64')
      }

      if (!audioData) {
        await voiceRepo.update(record.id, {
          status: 'failed',
          errorMessage: '无法读取音频数据'
        })
        return { success: false, error: '无法读取音频数据' }
      }

      // 使用 DashScope STT Provider
      const sttProvider = new DashScopeSTTProvider({
        apiKey: decryptedApiKey,
        baseUrl: undefined // 使用默认 URL
      })

      // 调用 STT API
      const result = await sttProvider.transcribe(audioData, {
        language: request.language
      })

      if (!result.success) {
        await voiceRepo.update(record.id, {
          status: 'failed',
          errorMessage: result.error || '语音识别失败'
        })
        return { success: false, error: result.error || '语音识别失败' }
      }

      const recognizedText = result.text || ''

      // 更新记录
      await voiceRepo.update(record.id, {
        status: 'completed',
        outputText: recognizedText
      })

      // 通知前端完成
      window.webContents.send('voice:stt-completed', {
        recordId: record.id,
        text: recognizedText
      })

      return {
        success: true,
        data: {
          text: recognizedText,
          duration: 0,
          detectedLanguage: request.language
        }
      }
    } catch (error: any) {
      console.error('[VoiceService.recognizeSpeech] 错误:', error)
      return { success: false, error: error.message || '语音识别失败' }
    }
  }

  /**
   * 选择音频文件
   */
  static async selectAudioFile(
    window: BrowserWindow
  ): Promise<{ success: boolean; data?: { path: string; name: string; size: number }; error?: string }> {
    const result = await dialog.showOpenDialog(window, {
      title: '选择音频文件',
      filters: [
        { name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'webm'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '未选择文件' }
    }

    const filePath = result.filePaths[0]
    const stats = fs.statSync(filePath)

    // 检查文件大小（100MB 限制）
    if (stats.size > 100 * 1024 * 1024) {
      return { success: false, error: '文件大小超过限制（最大 100MB）' }
    }

    return {
      success: true,
      data: {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size
      }
    }
  }

  /**
   * 获取语音历史
   */
  static async getHistory(query: { page: number; pageSize: number; type?: string; favorite?: boolean }) {
    try {
      const voiceRepo = this.getVoiceRepository()
      const result = await voiceRepo.getList(query)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[VoiceService.getHistory] 错误:', error)
      return { success: false, error: error.message || '获取历史失败' }
    }
  }

  /**
   * 删除语音记录
   */
  static async deleteRecord(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const voiceRepo = this.getVoiceRepository()
      const record = await voiceRepo.getById(id)

      if (record?.outputAudioPath && fs.existsSync(record.outputAudioPath)) {
        fs.unlinkSync(record.outputAudioPath)
      }
      if (record?.inputAudioPath && fs.existsSync(record.inputAudioPath)) {
        fs.unlinkSync(record.inputAudioPath)
      }

      await voiceRepo.delete(id)
      return { success: true }
    } catch (error: any) {
      console.error('[VoiceService.deleteRecord] 错误:', error)
      return { success: false, error: error.message || '删除失败' }
    }
  }

  /**
   * 切换收藏
   */
  static async toggleFavorite(id: string): Promise<{ success: boolean; data?: boolean; error?: string }> {
    try {
      const voiceRepo = this.getVoiceRepository()
      const newFavorite = await voiceRepo.toggleFavorite(id)
      return { success: true, data: newFavorite }
    } catch (error: any) {
      console.error('[VoiceService.toggleFavorite] 错误:', error)
      return { success: false, error: error.message || '操作失败' }
    }
  }

  /**
   * 下载音频文件
   */
  static async downloadAudio(
    window: BrowserWindow,
    audioPath: string
  ): Promise<{ success: boolean; data?: { savePath: string }; error?: string }> {
    try {
      if (!fs.existsSync(audioPath)) {
        return { success: false, error: '音频文件不存在' }
      }

      // 获取文件名
      const fileName = path.basename(audioPath)

      // 弹出保存对话框
      const result = await dialog.showSaveDialog(window, {
        title: '保存音频文件',
        defaultPath: fileName,
        filters: [
          { name: 'WAV 音频', extensions: ['wav'] },
          { name: 'MP3 音频', extensions: ['mp3'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: '取消保存' }
      }

      // 复制文件到目标位置
      fs.copyFileSync(audioPath, result.filePath)

      return { success: true, data: { savePath: result.filePath } }
    } catch (error: any) {
      console.error('[VoiceService.downloadAudio] 错误:', error)
      return { success: false, error: error.message || '下载失败' }
    }
  }
}