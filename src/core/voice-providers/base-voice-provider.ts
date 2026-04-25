/**
 * 语音 Provider 基类
 * @module voice-providers/base-voice-provider
 * @description 所有语音提供商的基类
 */

import type { VoiceSpeaker } from '@shared/types/voice.types'

/**
 * 语音 Provider 配置
 */
export interface VoiceProviderConfig {
  apiKey: string
  baseUrl?: string
}

/**
 * 语音合成选项
 */
export interface SynthesizeOptions {
  speed?: number
  pitch?: number
  volume?: number
  format?: string
}

/**
 * 语音 Provider 基类
 */
export abstract class BaseVoiceProvider {
  protected config: VoiceProviderConfig

  constructor(config: VoiceProviderConfig) {
    this.config = config
  }

  /**
   * Provider ID
   */
  abstract get id(): string

  /**
   * Provider 名称
   */
  abstract get name(): string

  /**
   * 获取支持的发音人列表
   */
  abstract getVoices(language?: string): Promise<VoiceSpeaker[]>

  /**
   * 文本转语音
   */
  abstract synthesize(
    text: string,
    voiceId: string,
    options?: SynthesizeOptions
  ): Promise<{ success: boolean; audioData?: string; error?: string }>

  /**
   * 测试连接
   */
  abstract testConnection(): Promise<{ success: boolean; message: string }>
}