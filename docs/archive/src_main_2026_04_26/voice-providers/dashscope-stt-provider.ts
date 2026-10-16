/**
 * DashScope STT Provider
 * @module voice-providers/dashscope-stt-provider
 * @description 实现阿里云 DashScope 平台的语音转文本 API
 */

/**
 * STT Provider 配置
 */
export interface STTProviderConfig {
  apiKey: string
  baseUrl?: string
}

/**
 * 语音识别选项
 */
export interface TranscribeOptions {
  language?: string
  format?: string
  sampleRate?: number
}

/**
 * DashScope STT Provider
 *
 * 使用阿里云 DashScope 平台的 Paraformer 模型进行语音识别。
 *
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/paraformer
 */
export class DashScopeSTTProvider {
  /**
   * 默认 STT API URL
   */
  private static DEFAULT_STT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription'

  protected config: STTProviderConfig

  constructor(config: STTProviderConfig) {
    this.config = config
  }

  /**
   * Provider ID
   */
  get id(): string {
    return 'dashscope-stt'
  }

  /**
   * Provider 名称
   */
  get name(): string {
    return 'DashScope STT'
  }

  /**
   * 语音转文本
   *
   * @param audioData - 音频数据（Buffer 或 base64 字符串）
   * @param options - 可选参数
   * @returns 识别结果文本
   */
  async transcribe(
    audioData: Buffer | string,
    options?: TranscribeOptions
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      const url = this.config.baseUrl || DashScopeSTTProvider.DEFAULT_STT_URL

      // 将音频数据转换为 base64
      let audioBase64: string
      if (Buffer.isBuffer(audioData)) {
        audioBase64 = audioData.toString('base64')
      } else {
        audioBase64 = audioData
      }

      // 构建 Paraformer API 请求体
      const body: Record<string, any> = {
        model: 'paraformer-v2',
        input: {
          audio: audioBase64
        }
      }

      // 添加语言参数
      if (options?.language) {
        body.input.language = this.getLanguageCode(options.language)
      }

      console.log('[DashScope STT] 发送请求:', {
        url,
        model: 'paraformer-v2',
        audioLength: audioBase64.length,
        language: options?.language
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
        console.error('[DashScope STT] HTTP 错误:', response.status, errorText)

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

      console.log('[DashScope STT] API 响应:', JSON.stringify(result, null, 2).substring(0, 500))

      // 检查是否有错误
      if (result.code && result.code !== 'Success' && result.code !== '200') {
        return { success: false, error: result.message || '语音识别失败' }
      }

      // 从 output.results 中提取识别结果
      // Paraformer API 返回格式: { output: { results: [{ transcript: { text: "..." } }] } }
      if (result.output?.results && result.output.results.length > 0) {
        const transcript = result.output.results[0]?.transcript?.text
        if (transcript) {
          return {
            success: true,
            text: transcript
          }
        }
      }

      // 备用：检查 output.text
      if (result.output?.text) {
        return {
          success: true,
          text: result.output.text
        }
      }

      // 检查是否有 sentences 格式
      if (result.output?.sentence && result.output.sentence.length > 0) {
        const text = result.output.sentence.map((s: any) => s.text).join('')
        if (text) {
          return { success: true, text }
        }
      }

      console.error('[DashScope STT] 未获取到识别结果, 响应:', JSON.stringify(result, null, 2))
      return { success: false, error: '未获取到识别结果' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      console.error('[DashScope STT] 错误:', error)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 将语言代码转换为 DashScope API 语言代码
   */
  private getLanguageCode(languageCode: string): string {
    const languageMap: Record<string, string> = {
      'zh': 'zh',
      'en': 'en',
      'fr': 'fr',
      'de': 'de',
      'ru': 'ru',
      'it': 'it',
      'es': 'es',
      'pt': 'pt',
      'ja': 'ja',
      'ko': 'ko'
    }
    return languageMap[languageCode] || 'auto'
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config.apiKey) {
      return { success: false, message: '未配置 API Key' }
    }

    return { success: true, message: '配置有效' }
  }
}