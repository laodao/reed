/**
 * DashScope CosyVoice 声音设计 Provider
 * @module platform/providers/voice/dashscope-voice-design-provider
 *
 * 调阿里云百炼 voice-enrollment 接口实现声音设计（通过文本描述创建音色）：
 *   - create_voice  创建设计音色（使用 voice_prompt 而非音频样本）
 *   - query_voice   查询训练状态（DEPLOYING / OK / UNDEPLOYED）
 *   - delete_voice  删除设计音色
 *
 * 与 DashScopeVoiceCloneProvider 类似，但不需要上传音频文件。
 * voice_prompt 参数直接描述声音特征，如"年轻女性，温柔甜美，语速适中"。
 *
 * 协议要点：
 *   - 端点：POST /api/v1/services/audio/tts/customization
 *   - 鉴权：Authorization: Bearer ${apiKey}
 *   - target_model 必须与后续合成时使用的 CosyVoice 模型一致
 *   - voice_prompt 最多 500 字符
 *
 * 状态枚举映射：
 *   DEPLOYING  → 'training'  审核 / 训练中
 *   OK         → 'ready'     已就绪
 *   UNDEPLOYED → 'failed'    失败 / 未部署
 *
 * 参考：
 * - https://www.alibabacloud.com/help/zh/model-studio/cosyvoice-clone-design-api
 */

import type {
  DesignedVoiceStatus,
  VoiceDesignCreateResult,
  VoiceDesignInput,
  VoiceDesignStatusResult,
} from '@shared/types/voice.types'
import type { FetchLike } from './dashscope-oss-uploader'

/**
 * voice-enrollment 接口的统一返回结构
 */
interface DashScopeEnrollmentResponse {
  request_id?: string
  output?: {
    voice_id?: string
    status?: string
    voice_status?: string
    gmt_create?: string
    gmt_modified?: string
    demo_audio?: string
  }
  usage?: { count?: number }
  code?: string
  message?: string
}

/**
 * 创建 / 查询失败时抛的语义化错误。
 */
export class DashScopeVoiceDesignError extends Error {
  constructor(
    message: string,
    public readonly action:
      | 'create_voice'
      | 'query_voice'
      | 'delete_voice',
    public readonly statusCode?: number,
    public readonly providerCode?: string,
  ) {
    super(message)
    this.name = 'DashScopeVoiceDesignError'
  }
}

export interface DashScopeVoiceDesignProviderOptions {
  fetchImpl?: FetchLike
  /** 自定义 endpoint（默认走北京），单测可注入 */
  endpointUrl?: string
  /** 默认目标 TTS 模型 */
  targetModel?: string
}

/**
 * DashScope CosyVoice 声音设计 provider。
 *
 * 用法：
 * ```ts
 * const p = new DashScopeVoiceDesignProvider(apiKey)
 * const result = await p.designVoice({
 *   name: '温柔女声',
 *   voicePrompt: '年轻女性，温柔甜美，语速适中，声音清澈',
 *   prefix: 'gentle',
 * })
 * // result.voiceId 形如 'cosyvoice-v3-plus-gentle-xxxxxxxx'
 * // result.status === 'training'，需轮询 queryDesignStatus 直到 ready/failed
 * ```
 */
export class DashScopeVoiceDesignProvider {
  static readonly DEFAULT_ENDPOINT_URL =
    'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'

  /**
   * 默认目标合成模型 — 选 v3.5-plus 是因为它语种最全
   */
  static readonly DEFAULT_TARGET_MODEL = 'cosyvoice-v3.5-plus'

  /** Provider id 常量 */
  static readonly PROVIDER_ID = 'dashscope-voice-design'

  private readonly fetchImpl: FetchLike
  private readonly endpointUrl: string
  private readonly targetModel: string

  constructor(
    private readonly apiKey: string,
    options: DashScopeVoiceDesignProviderOptions = {},
  ) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('DashScopeVoiceDesignProvider: apiKey is required')
    }
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.endpointUrl =
      options.endpointUrl ?? DashScopeVoiceDesignProvider.DEFAULT_ENDPOINT_URL
    this.targetModel =
      options.targetModel ?? DashScopeVoiceDesignProvider.DEFAULT_TARGET_MODEL
  }

  get id(): string {
    return DashScopeVoiceDesignProvider.PROVIDER_ID
  }

  /**
   * 创建设计音色（异步任务）。
   *
   * 流程：
   *   1. POST customization action=create_voice with voice_prompt
   *   2. 返回 voice_id（即使训练仍在进行）
   *
   * @throws DashScopeVoiceDesignError enrollment 失败 / 响应缺字段
   */
  async designVoice(input: VoiceDesignInput): Promise<VoiceDesignCreateResult> {
    validateDesignPrefix(input.prefix)
    validateVoicePrompt(input.voicePrompt)

    const targetModel = input.targetModel ?? this.targetModel
    // DashScope API 要求声音设计必须同时提供 voice_prompt 和 preview_text
    // preview_text 用于生成预览音频，使用默认值如果用户未提供
    const previewText = input.previewText || '欢迎使用语音合成服务，这是一段预览文本。'

    const json = await this.callEnrollment({
      input: {
        action: 'create_voice',
        target_model: targetModel,
        prefix: input.prefix,
        voice_prompt: input.voicePrompt,
        preview_text: previewText,
      },
    })

    const voiceId = json.output?.voice_id?.trim()
    if (!voiceId) {
      throw new DashScopeVoiceDesignError(
        `create_voice 响应缺 output.voice_id：${json.message ?? JSON.stringify(json).slice(0, 200)}`,
        'create_voice',
        undefined,
        json.code,
      )
    }

    // 创建后 status 通常是 DEPLOYING（部分 provider 也可能直接给 OK）
    const rawStatus =
      json.output?.status ?? json.output?.voice_status ?? 'DEPLOYING'

    return {
      voiceId,
      targetModel,
      status: mapDashScopeDesignStatus(rawStatus),
    }
  }

  /**
   * 查询训练状态（同步轮询用）。
   *
   * @throws DashScopeVoiceDesignError 网络错误 / 响应缺字段 / voice_id 不存在
   */
  async queryDesignStatus(voiceId: string): Promise<VoiceDesignStatusResult> {
    if (!voiceId) {
      throw new DashScopeVoiceDesignError('voiceId is required', 'query_voice')
    }
    const json = await this.callEnrollment({
      input: {
        action: 'query_voice',
        voice_id: voiceId,
      },
    })

    const rawStatus =
      json.output?.status ?? json.output?.voice_status
    if (!rawStatus) {
      throw new DashScopeVoiceDesignError(
        `query_voice 响应缺 output.status：${json.message ?? JSON.stringify(json).slice(0, 200)}`,
        'query_voice',
        undefined,
        json.code,
      )
    }

    const status = mapDashScopeDesignStatus(rawStatus)
    const previewAudioUrl = json.output?.demo_audio?.trim() || undefined

    return {
      status,
      previewAudioUrl,
      errorMessage:
        status === 'failed'
          ? (json.message?.trim() || '声音训练失败（UNDEPLOYED）')
          : undefined,
    }
  }

  /**
   * 删除设计音色（provider 端硬删除）。
   *
   * @throws DashScopeVoiceDesignError 网络错误 / provider 返回非成功
   */
  async deleteDesignedVoice(voiceId: string): Promise<void> {
    if (!voiceId) {
      throw new DashScopeVoiceDesignError('voiceId is required', 'delete_voice')
    }
    await this.callEnrollment({
      input: {
        action: 'delete_voice',
        voice_id: voiceId,
      },
    })
  }

  /** 统一封装 customization 端点 POST 调用 + 错误处理 */
  private async callEnrollment(
    body: { input: Record<string, unknown> },
  ): Promise<DashScopeEnrollmentResponse> {
    const action = body.input.action as
      | 'create_voice'
      | 'query_voice'
      | 'delete_voice'

    // 调试日志：打印实际发送的请求
    const requestBody = JSON.stringify({
      model: 'voice-enrollment',
      input: body.input,
    })
    console.log(`[DashScopeVoiceDesignProvider] ${action} 请求体:`, requestBody)

    let resp: Response
    try {
      resp = await this.fetchImpl(this.endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      })
    } catch (e: any) {
      throw new DashScopeVoiceDesignError(
        `${action} 网络错误：${e?.message ?? e}`,
        action,
      )
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new DashScopeVoiceDesignError(
        `${action} 失败 HTTP ${resp.status}：${text || resp.statusText}`,
        action,
        resp.status,
      )
    }

    let json: DashScopeEnrollmentResponse
    try {
      json = (await resp.json()) as DashScopeEnrollmentResponse
    } catch (e: any) {
      throw new DashScopeVoiceDesignError(
        `${action} 响应不是合法 JSON：${e?.message ?? e}`,
        action,
      )
    }

    // 部分 DashScope 接口返回 200 但 body 里有 code != null 表错
    if (json.code) {
      throw new DashScopeVoiceDesignError(
        `${action} 业务错误 code=${json.code}：${json.message ?? ''}`,
        action,
        undefined,
        json.code,
      )
    }
    return json
  }
}

/** prefix 校验：仅小写字母数字，1-10 字符 */
function validateDesignPrefix(prefix: string): void {
  if (!prefix) {
    throw new DashScopeVoiceDesignError('prefix is required', 'create_voice')
  }
  if (!/^[a-z0-9]{1,10}$/.test(prefix)) {
    throw new DashScopeVoiceDesignError(
      `prefix 必须为 1-10 个小写字母或数字（实际：${prefix}）`,
      'create_voice',
    )
  }
}

/** voice_prompt 校验：最多 500 字符 */
function validateVoicePrompt(prompt: string): void {
  if (!prompt || !prompt.trim()) {
    throw new DashScopeVoiceDesignError('voice_prompt is required', 'create_voice')
  }
  if (prompt.length > 500) {
    throw new DashScopeVoiceDesignError(
      `voice_prompt 最多 500 字符（实际：${prompt.length}）`,
      'create_voice',
    )
  }
}

/** DashScope 状态字符串 → 内部 DesignedVoiceStatus */
function mapDashScopeDesignStatus(raw: string): DesignedVoiceStatus {
  const upper = raw.trim().toUpperCase()
  if (upper === 'OK' || upper === 'READY' || upper === 'DEPLOYED') return 'ready'
  if (upper === 'UNDEPLOYED' || upper === 'FAILED' || upper === 'ERROR') return 'failed'
  // DEPLOYING / TRAINING / 任何未知中间态都视为训练中
  return 'training'
}