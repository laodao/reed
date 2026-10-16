/**
 * DashScope TTS Provider
 * @module platform/providers/voice/dashscope-tts-provider
 * @description 实现阿里云 DashScope 平台的文本转语音 API
 */

import type { VoiceSpeaker } from '@shared/types/voice.types'
import { BaseVoiceProvider, type VoiceProviderConfig } from './base-voice-provider'

/**
 * DashScope TTS Provider
 *
 * 使用阿里云 DashScope 平台的 Qwen-TTS 模型进行语音合成。
 * 使用多模态生成 API 端点。
 *
 * @see https://help.aliyun.com/zh/model-studio/qwen-tts
 */
export class DashScopeTTSProvider extends BaseVoiceProvider {
  /**
   * 默认 TTS API URL
   * 使用多模态生成 API 端点
   */
  private static DEFAULT_TTS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

  /**
   * 支持的发音人列表
   * @see https://help.aliyun.com/zh/model-studio/qwen-tts
   */
  private static VOICES: VoiceSpeaker[] = [
    // DashScope Qwen-TTS 支持的发音人
    { id: 'Cherry', name: 'Cherry', language: 'zh', gender: 'female' },
    { id: 'Serena', name: 'Serena', language: 'zh', gender: 'female' },
    { id: 'Ethan', name: 'Ethan', language: 'zh', gender: 'male' },
    { id: 'Chelsie', name: 'Chelsie', language: 'zh', gender: 'female' },
    { id: 'Momo', name: 'Momo', language: 'zh', gender: 'female' },
    { id: 'Vivian', name: 'Vivian', language: 'zh', gender: 'female' },
    { id: 'Moon', name: 'Moon', language: 'zh', gender: 'male' },
    { id: 'Maia', name: 'Maia', language: 'zh', gender: 'female' },
    { id: 'Kai', name: 'Kai', language: 'zh', gender: 'male' },
    { id: 'Nofish', name: 'Nofish', language: 'zh', gender: 'male' },
  ]

  constructor(config: VoiceProviderConfig) {
    super(config)
  }

  /**
   * Provider ID
   */
  get id(): string {
    return 'dashscope-tts'
  }

  /**
   * Provider 名称
   */
  get name(): string {
    return 'DashScope TTS'
  }

  /**
   * 获取支持的发音人列表
   * 注意：所有发音人都支持多种语言
   */
  async getVoices(_language?: string): Promise<VoiceSpeaker[]> {
    // 所有发音人都支持多种语言，不再按语言过滤
    return DashScopeTTSProvider.VOICES
  }

  /**
   * 文本转语音
   *
   * @param text - 要转换的文本
   * @param voiceId - 发音人 ID
   * @param options - 可选参数，包含 language
   * @returns 音频数据（base64）
   */
  async synthesize(
    text: string,
    voiceId: string,
    options?: { speed?: number; pitch?: number; volume?: number; format?: string; language?: string }
  ): Promise<{ success: boolean; audioData?: string; error?: string }> {
    try {
      const url = this.config.baseUrl || DashScopeTTSProvider.DEFAULT_TTS_URL

      // 根据传入的语言或自动检测确定语言类型
      const languageType = options?.language
        ? this.getLanguageType(options.language)
        : this.detectLanguage(text)

      // 构建多模态生成 API 格式的请求体
      const body: Record<string, any> = {
        model: 'qwen3-tts-flash',
        input: {
          text: text,
          voice: voiceId,
          language_type: languageType
        }
      }

      console.log('[DashScope TTS] 发送请求:', {
        url,
        model: 'qwen3-tts-flash',
        voice: voiceId,
        textLength: text.length,
        languageType
      })

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[DashScope TTS] HTTP 错误:', response.status, errorText)

        let errorMessage = `HTTP ${response.status}`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorJson.error?.message || errorMessage
        } catch {
          if (errorText) {
            errorMessage = errorText
          }
        }

        return { success: false, error: errorMessage }
      }

      // 解析多模态生成 API 的响应
      const result = await response.json()

      console.log('[DashScope TTS] API 响应:', JSON.stringify(result, null, 2).substring(0, 500))

      // 检查是否有错误
      if (result.code && result.code !== 'Success' && result.code !== '200') {
        return { success: false, error: result.message || '语音合成失败' }
      }

      // 从 output.audio 中提取音频 URL
      // 多模态 API 返回格式: { output: { audio: { url: "http://...", data: "" } } }
      if (result.output?.audio?.url) {
        // 下载音频文件
        const audioUrl = result.output.audio.url
        console.log('[DashScope TTS] 音频 URL:', audioUrl)

        const audioResponse = await fetch(audioUrl)
        if (!audioResponse.ok) {
          return { success: false, error: '下载音频文件失败' }
        }

        const audioBuffer = await audioResponse.arrayBuffer()
        const audioBase64 = Buffer.from(audioBuffer).toString('base64')

        return {
          success: true,
          audioData: audioBase64
        }
      }

      // 从 output.choices[0].message.content 中提取音频（备用）
      if (result.output?.choices && result.output.choices.length > 0) {
        const content = result.output.choices[0].message?.content
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.audio) {
              // 如果是 URL，下载音频
              if (item.audio.url) {
                const audioResponse = await fetch(item.audio.url)
                if (audioResponse.ok) {
                  const audioBuffer = await audioResponse.arrayBuffer()
                  return {
                    success: true,
                    audioData: Buffer.from(audioBuffer).toString('base64')
                  }
                }
              }
              // 如果是 base64 数据
              const audioData = typeof item.audio === 'string' ? item.audio : item.audio.data
              if (audioData) {
                return { success: true, audioData }
              }
            }
          }
        }
      }

      // 检查是否有直接的 base64 音频数据
      if (result.output?.audio?.data) {
        return {
          success: true,
          audioData: result.output.audio.data
        }
      }

      console.error('[DashScope TTS] 未获取到音频数据, 响应:', JSON.stringify(result, null, 2))
      return { success: false, error: '未获取到音频数据' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      console.error('[DashScope TTS] 错误:', error)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 检测文本语言类型
   */
  private detectLanguage(text: string): string {
    // 语言检测
    const chineseRegex = /[\u4e00-\u9fa5]/
    const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/
    const koreanRegex = /[\uac00-\ud7af]/
    const cyrillicRegex = /[\u0400-\u04ff]/

    if (chineseRegex.test(text)) {
      return 'Chinese'
    }
    if (japaneseRegex.test(text)) {
      return 'Japanese'
    }
    if (koreanRegex.test(text)) {
      return 'Korean'
    }
    if (cyrillicRegex.test(text)) {
      return 'Russian'
    }
    // 默认英文（包括法语、德语、意大利语、西班牙语、葡萄牙语等拉丁字母语言）
    return 'English'
  }

  /**
   * 将语言代码转换为 DashScope API 语言类型
   */
  private getLanguageType(languageCode: string): string {
    const languageMap: Record<string, string> = {
      'zh': 'Chinese',
      'en': 'English',
      'fr': 'French',
      'de': 'German',
      'ru': 'Russian',
      'it': 'Italian',
      'es': 'Spanish',
      'pt': 'Portuguese',
      'ja': 'Japanese',
      'ko': 'Korean'
    }
    return languageMap[languageCode] || 'English'
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config.apiKey) {
      return { success: false, message: '未配置 API Key' }
    }

    try {
      // 尝试合成一个短文本测试
      // P5-T17 修：之前用 'longxiaochun' 不在 VOICES 列表里 → 改用首位 'Cherry'
      const result = await this.synthesize('测试', 'Cherry')
      if (result.success) {
        return { success: true, message: '连接成功' }
      }
      return { success: false, message: result.error || '连接失败' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, message: `连接失败: ${errorMessage}` }
    }
  }
}