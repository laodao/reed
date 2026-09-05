/**
 * 语音 Provider 基类
 * @module voice-providers/base-voice-provider
 * @description 所有语音提供商的基类。
 *
 * 设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §5.1
 *
 * 一个 BaseVoiceProvider 实现可以选择只暴露 TTS / STT 子集 — 复刻 4 个方法
 * （cloneVoice / queryCloneStatus / deleteClonedVoice / supportsCloning）默认抛
 * "Not implemented"，由真实支持复刻的 provider 子类覆盖（例如
 * DashScopeVoiceCloneProvider）。
 */

import type {
  VoiceCloneInput,
  VoiceCloneCreateResult,
  VoiceCloneStatusResult,
  VoiceSpeaker,
} from '@shared/types/voice.types'

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

  // ===== 声音复刻能力（仅部分 provider 实现）=====

  /**
   * 当前 provider 是否支持声音复刻能力。
   * 默认 false；真实支持复刻的 provider 子类覆盖为 true。
   */
  supportsCloning(): boolean {
    return false
  }

  /**
   * 创建复刻音色（异步任务）。
   *
   * 实现方需要：
   * - 上传样本到 provider 可访问的位置（公网 URL / file_id / OSS）
   * - 调 provider 的 enrollment / clone 接口
   * - 返回 provider 端真实 voice_id（即使训练仍在进行）
   *
   * 创建后状态通常仍为 'training'，需通过 queryCloneStatus 轮询直到 'ready' 或 'failed'。
   *
   * @throws 任何 provider 端错误（401 / 409 / 5xx），调用方负责捕获 + 回滚 DB
   */
  async cloneVoice(_input: VoiceCloneInput): Promise<VoiceCloneCreateResult> {
    throw new Error(
      `${this.name} (${this.id}) does not support voice cloning`,
    )
  }

  /**
   * 查询某个复刻音色的最新训练状态。
   *
   * @param voiceId provider 端真实 voice_id（cloneVoice 返回的）
   * @returns 当前状态（training / ready / failed）+ 可选的试听 URL / 错误原因
   * @throws provider 端错误（如 voice_id 不存在）
   */
  async queryCloneStatus(_voiceId: string): Promise<VoiceCloneStatusResult> {
    throw new Error(
      `${this.name} (${this.id}) does not support voice cloning`,
    )
  }

  /**
   * 删除复刻音色（provider 端硬删除）。
   * 调用方负责 DB 清理 + 解绑相关角色。
   */
  async deleteClonedVoice(_voiceId: string): Promise<void> {
    throw new Error(
      `${this.name} (${this.id}) does not support voice cloning`,
    )
  }
}