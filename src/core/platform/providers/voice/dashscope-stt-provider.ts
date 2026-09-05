/**
 * DashScope STT Provider
 * @module voice-providers/dashscope-stt-provider
 * @description 实现阿里云 DashScope 平台的语音转文本 API。
 *              同步识别走 qwen3-asr-flash（aigc/multimodal-generation 端点）：
 *              音频以 base64 放入 messages[].content[].audio，输出
 *              output.choices[].message.content[].text。
 *              （旧的 paraformer transcription + input.audio base64 协议已被平台下线）
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
  /** 用户选择的 ASR 模型（缺省 qwen3-asr-flash） */
  modelId?: string
}

/** 同步识别端点（qwen3-asr-flash） */
const SYNC_ASR_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

/**
 * 归一化 ASR 模型名：带日期/实时后缀 → 同步端点模型名
 * （qwen3-asr-flash-2026-02-10 / qwen3-asr-flash-realtime-2026-02-10 → qwen3-asr-flash）
 */
export function normalizeAsrModel(modelId?: string): string {
  if (!modelId) return 'qwen3-asr-flash'
  const base = modelId.split('-realtime')[0]
  return base.replace(/-\d{4}-\d{2}-\d{2}$/, '') || 'qwen3-asr-flash'
}

/**
 * DashScope STT Provider
 *
 * 同步语音识别（Qwen3-ASR-Flash，base64 音频直传）。
 *
 * @see https://docs.qwencloud.com/api-reference/speech-recognition/qwen-asr/dashscope
 */
export class DashScopeSTTProvider {
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
   * @param options - 可选参数（language/modelId）
   * @returns 识别结果文本
   */
  async transcribe(
    audioData: Buffer | string,
    options?: TranscribeOptions
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      const url = this.config.baseUrl || SYNC_ASR_URL

      // 将音频数据转换为 base64（multimodal-generation 端点以 data URI 形式传入）
      let audioBase64: string
      if (Buffer.isBuffer(audioData)) {
        audioBase64 = audioData.toString('base64')
      } else {
        audioBase64 = audioData
      }

      // 构建 qwen3-asr-flash 请求体（messages 结构）
      const body: Record<string, any> = {
        model: normalizeAsrModel(options?.modelId),
        input: {
          messages: [
            { role: 'system', content: [{ text: '' }] },
            { role: 'user', content: [{ audio: `data:audio/wav;base64,${audioBase64}` }] },
          ],
        },
        parameters: {
          asr_options: { enable_itn: false },
        },
      }

      // 语言参数（'auto'/未知 → 省略，走模型自动检测；asr_options.language 不认 'auto'）
      if (options?.language) {
        const code = this.getLanguageCode(options.language)
        if (code) body.parameters.asr_options.language = code
      }

      console.log('[DashScope STT] 发送请求:', {
        url,
        model: body.model,
        audioLength: audioBase64.length,
        language: options?.language,
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
        console.error('[DashScope STT] HTTP 错误:', response.status, errorText.slice(0, 500))

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

      // qwen3-asr-flash：output.choices[].message.content[].text
      const choices = result.output?.choices
      if (Array.isArray(choices) && choices.length > 0) {
        const content = choices[0]?.message?.content
        if (Array.isArray(content)) {
          const text = content.map((c: any) => c?.text ?? '').filter(Boolean).join('')
          if (text) return { success: true, text }
        }
        const directText = choices[0]?.message?.text
        if (directText) return { success: true, text: directText }
      }

      // 备用：output.text / output.sentence
      if (result.output?.text) {
        return { success: true, text: result.output.text }
      }
      if (result.output?.sentence && result.output.sentence.length > 0) {
        const text = result.output.sentence.map((s: any) => s.text).join('')
        if (text) return { success: true, text }
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
   * 将语言代码转换为 DashScope asr_options.language（未知/'auto' → undefined，不传走模型默认）
   */
  private getLanguageCode(languageCode: string): string | undefined {
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
    return languageMap[languageCode.toLowerCase()]
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
