/**
 * DashScope CosyVoice TTS Provider
 * @module voice-providers/dashscope-cosyvoice-tts-provider
 *
 * 用于合成使用自定义音色（复刻/设计）的语音。
 * 与 DashScopeTTSProvider 不同，本 Provider：
 *   - 使用 CosyVoice 模型（cosyvoice-v3.5-plus 等）
 *   - 支持 custom voice_id（复刻/设计创建的音色）
 *   - 使用 DashScope SpeechSynthesizer API 端点（与 qwen-tts 不同）
 *
 * API 格式：
 *   POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer
 *   {
 *     "model": "cosyvoice-v3.5-plus",
 *     "input": {
 *       "text": "要合成的文本",
 *       "voice": "cosyvoice-v3-plus-{prefix}-xxxxxxxx",
 *       "format": "wav",
 *       "sample_rate": 24000
 *     }
 *   }
 *
 * 注意：voice_id 必须与创建时使用的 target_model 匹配，否则合成失败。
 *
 * 参考：
 * - https://www.alibabacloud.com/help/zh/model-studio/cosyvoice-clone-design-api
 */

import type { VoiceLanguageCode } from '@shared/types/voice.types'
import { BaseVoiceProvider, type VoiceProviderConfig } from './base-voice-provider'

/**
 * DashScope CosyVoice TTS Provider
 *
 * 用于合成自定义音色（复刻/设计）的语音。
 */
export class DashScopeCosyVoiceTTSProvider extends BaseVoiceProvider {
  /**
   * CosyVoice TTS API URL（SpeechSynthesizer 端点，与 qwen-tts 的 multimodal-generation 不同）
   */
  private static DEFAULT_TTS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'

  /**
   * 默认 CosyVoice 模型
   */
  static readonly DEFAULT_MODEL = 'cosyvoice-v3.5-plus'

  constructor(config: VoiceProviderConfig) {
    super(config)
  }

  /**
   * Provider ID
   */
  get id(): string {
    return 'dashscope-cosyvoice-tts'
  }

  /**
   * Provider 名称
   */
  get name(): string {
    return 'DashScope CosyVoice TTS'
  }

  /**
   * 检测 voiceId 是否为 CosyVoice 自定义音色
   * 格式：cosyvoice-v3-plus-{prefix}-xxxxxxxx 或 cosyvoice-v3.5-plus-{prefix}-xxxxxxxx
   */
  static isCustomVoiceId(voiceId: string): boolean {
    if (!voiceId) return false
    // 检查是否以 cosyvoice-v3 或 cosyvoice-v3.5 开头
    return voiceId.startsWith('cosyvoice-v3') && voiceId.includes('-')
  }

  /**
   * 从 voiceId 提取适合的模型名称
   * 例如：cosyvoice-v3-plus-gentle-xxx → cosyvoice-v3-plus
   *       cosyvoice-v3.5-plus-gentle-xxx → cosyvoice-v3.5-plus
   */
  static extractModelFromVoiceId(voiceId: string): string {
    if (!voiceId) return DashScopeCosyVoiceTTSProvider.DEFAULT_MODEL

    // 尝试匹配 cosyvoice-v3-plus 或 cosyvoice-v3.5-plus
    const match = voiceId.match(/^cosyvoice-v3[\d.]*-plus/)
    if (match) {
      return match[0]
    }

    // 默认返回 v3.5-plus
    return DashScopeCosyVoiceTTSProvider.DEFAULT_MODEL
  }

  /**
   * 文本转语音（使用自定义音色）
   *
   * @param text - 要转换的文本
   * @param voiceId - 自定义音色 ID（复刻/设计创建的）
   * @param options - 可选参数
   * @returns 音频数据（base64）
   */
  async synthesize(
    text: string,
    voiceId: string,
    options?: {
      speed?: number
      pitch?: number
      volume?: number
      format?: string
      language?: VoiceLanguageCode
      model?: string  // 可指定模型，默认从 voiceId 提取
    }
  ): Promise<{ success: boolean; audioData?: string; error?: string }> {
    try {
      const url = this.config.baseUrl || DashScopeCosyVoiceTTSProvider.DEFAULT_TTS_URL

      // 从 voiceId 提取模型，或使用传入的 model，或使用默认模型
      const model = options?.model ||
        DashScopeCosyVoiceTTSProvider.extractModelFromVoiceId(voiceId)

      // 构建 SpeechSynthesizer API 格式的请求体
      // 参考：https://www.alibabacloud.com/help/zh/model-studio/cosyvoice-clone-design-api
      const body: Record<string, any> = {
        model,
        input: {
          text,
          voice: voiceId,  // 自定义 voice_id（复刻/设计创建的）
          format: 'wav',   // 输出格式
          sample_rate: 24000,  // 采样率
        }
      }

      console.log('[DashScope CosyVoice TTS] 发送请求:', {
        url,
        model,
        voice: voiceId,
        textLength: text.length,
        format: 'wav',
        sample_rate: 24000,
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
        console.error('[DashScope CosyVoice TTS] HTTP 错误:', response.status, errorText)

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

      // 解析响应
      const result = await response.json()

      console.log('[DashScope CosyVoice TTS] API 响应:', JSON.stringify(result, null, 2).substring(0, 500))

      // 检查是否有错误
      if (result.code && result.code !== 'Success' && result.code !== '200') {
        return { success: false, error: result.message || '语音合成失败' }
      }

      // 从 output.audio 中提取音频 URL
      if (result.output?.audio?.url) {
        const audioUrl = result.output.audio.url
        console.log('[DashScope CosyVoice TTS] 音频 URL:', audioUrl)

        const audioResponse = await fetch(audioUrl)
        if (!audioResponse.ok) {
          return { success: false, error: '下载音频文件失败' }
        }

        const audioBuffer = await audioResponse.arrayBuffer()
        const audioBase64 = Buffer.from(audioBuffer).toString('base64')

        return { success: true, audioData: audioBase64 }
      }

      // 从 output.choices 中提取音频（备用）
      if (result.output?.choices && result.output.choices.length > 0) {
        const content = result.output.choices[0].message?.content
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.audio) {
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
        return { success: true, audioData: result.output.audio.data }
      }

      console.error('[DashScope CosyVoice TTS] 未获取到音频数据, 响应:', JSON.stringify(result, null, 2))
      return { success: false, error: '未获取到音频数据' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      console.error('[DashScope CosyVoice TTS] 错误:', error)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config.apiKey) {
      return { success: false, message: '未配置 API Key' }
    }
    return { success: true, message: '配置完成' }
  }
}