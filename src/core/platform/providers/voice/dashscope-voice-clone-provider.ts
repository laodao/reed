/**
 * DashScope CosyVoice 声音复刻 Provider
 * @module platform/providers/voice/dashscope-voice-clone-provider
 *
 * 调阿里云百炼 voice-enrollment 接口实现 4 个动作：
 *   - create_voice  创建复刻音色（异步，立刻返回 voice_id，状态 DEPLOYING）
 *   - query_voice   查询训练状态（DEPLOYING / OK / UNDEPLOYED）
 *   - delete_voice  删除复刻音色
 *   - list_voice    列出已有音色（本类未暴露；需要时再加）
 *
 * 与 DashScopeSTTProvider 一致 — **不继承 BaseVoiceProvider**，
 * 因为本 provider 只做复刻，没有 synthesize / getVoices / testConnection 语义；
 * VoiceService 在 cloneVoice 业务流程里直接 new 出来用。
 *
 * 协议要点：
 *   - 端点：POST /api/v1/services/audio/tts/customization
 *   - 鉴权：Authorization: Bearer ${apiKey}
 *   - 用 oss:// URL 时**必须**加请求头 X-DashScope-OssResourceResolve: enable
 *   - target_model 必须与后续合成时使用的 CosyVoice 模型一致，否则合成会失败
 *
 * 状态枚举映射：
 *   DEPLOYING  → 'training'  审核 / 训练中
 *   OK         → 'ready'     已就绪
 *   UNDEPLOYED → 'failed'    失败 / 未部署
 *
 * 参考：
 * - https://www.alibabacloud.com/help/zh/model-studio/cosyvoice-clone-design-api
 * - 设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §5.3
 */

import type {
  ClonedVoiceStatus,
  VoiceCloneCreateResult,
  VoiceCloneInput,
  VoiceCloneStatusResult,
  VoiceLanguageCode,
} from '@shared/types/voice.types'
import {
  DashScopeOssUploader,
  type FetchLike,
} from './dashscope-oss-uploader'

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
export class DashScopeVoiceCloneError extends Error {
  constructor(
    message: string,
    public readonly action:
      | 'create_voice'
      | 'query_voice'
      | 'delete_voice'
      | 'upload',
    public readonly statusCode?: number,
    public readonly providerCode?: string,
  ) {
    super(message)
    this.name = 'DashScopeVoiceCloneError'
  }
}

export interface DashScopeVoiceCloneProviderOptions {
  fetchImpl?: FetchLike
  /** 自定义 endpoint（默认走北京），单测可注入 */
  endpointUrl?: string
  /** 已构造好的 uploader（DI 用），不传则用 apiKey 默认构造一个 */
  uploader?: DashScopeOssUploader
  /** 默认目标 TTS 模型 */
  targetModel?: string
}

/**
 * DashScope CosyVoice 复刻 provider。
 *
 * 用法：
 * ```ts
 * const p = new DashScopeVoiceCloneProvider(apiKey)
 * const result = await p.cloneVoice({
 *   name: '我自己', samplePath: '/path/to/sample.wav',
 *   sampleDurationSec: 15, prefix: 'mine', language: 'zh',
 * })
 * // result.voiceId 形如 'cosyvoice-v3-plus-mine-xxxxxxxx'
 * // result.status === 'training'，需轮询 queryCloneStatus 直到 ready/failed
 * ```
 */
export class DashScopeVoiceCloneProvider {
  static readonly DEFAULT_ENDPOINT_URL =
    'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'

  /**
   * 默认目标合成模型 — 选 v3.5-plus 是因为它语种最全
   * （中/英/日/韩/法/德/俄/葡/泰/印尼/越），且为最新代次。
   */
  static readonly DEFAULT_TARGET_MODEL = 'cosyvoice-v3.5-plus'

  /** Provider id 常量 */
  static readonly PROVIDER_ID = 'dashscope-voice-clone'

  private readonly fetchImpl: FetchLike
  private readonly endpointUrl: string
  private readonly uploader: DashScopeOssUploader
  private readonly targetModel: string

  constructor(
    private readonly apiKey: string,
    options: DashScopeVoiceCloneProviderOptions = {},
  ) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('DashScopeVoiceCloneProvider: apiKey is required')
    }
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.endpointUrl =
      options.endpointUrl ?? DashScopeVoiceCloneProvider.DEFAULT_ENDPOINT_URL
    this.uploader =
      options.uploader ??
      new DashScopeOssUploader(apiKey, { fetchImpl: this.fetchImpl })
    this.targetModel =
      options.targetModel ?? DashScopeVoiceCloneProvider.DEFAULT_TARGET_MODEL
  }

  get id(): string {
    return DashScopeVoiceCloneProvider.PROVIDER_ID
  }

  /**
   * 创建复刻音色（异步任务）。
   *
   * 流程：
   *   1. 上传样本到 dashscope-instant 临时桶 → 得 oss:// URL
   *   2. POST customization action=create_voice
   *   3. 返回 voice_id（即使训练仍在进行）
   *
   * @throws DashScopeVoiceCloneError 上传失败 / enrollment 失败 / 响应缺字段
   */
  async cloneVoice(input: VoiceCloneInput): Promise<VoiceCloneCreateResult> {
    validatePrefix(input.prefix)

    let ossUrl: string
    try {
      ossUrl = await this.uploader.uploadFile(input.samplePath, this.targetModel)
    } catch (e: any) {
      throw new DashScopeVoiceCloneError(
        `样本上传失败：${e?.message ?? e}`,
        'upload',
        e?.statusCode,
      )
    }

    const json = await this.callEnrollment({
      input: {
        action: 'create_voice',
        target_model: this.targetModel,
        prefix: input.prefix,
        url: ossUrl,
        ...(input.language ? { language_hints: [normalizeLanguage(input.language)] } : {}),
      },
    })

    const voiceId = json.output?.voice_id?.trim()
    if (!voiceId) {
      throw new DashScopeVoiceCloneError(
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
      targetModel: this.targetModel,
      status: mapDashScopeStatus(rawStatus),
    }
  }

  /**
   * 查询训练状态（同步轮询用）。
   *
   * @throws DashScopeVoiceCloneError 网络错误 / 响应缺字段 / voice_id 不存在
   */
  async queryCloneStatus(voiceId: string): Promise<VoiceCloneStatusResult> {
    if (!voiceId) {
      throw new DashScopeVoiceCloneError('voiceId is required', 'query_voice')
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
      throw new DashScopeVoiceCloneError(
        `query_voice 响应缺 output.status：${json.message ?? JSON.stringify(json).slice(0, 200)}`,
        'query_voice',
        undefined,
        json.code,
      )
    }

    const status = mapDashScopeStatus(rawStatus)
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
   * 删除复刻音色（provider 端硬删除）。
   *
   * @throws DashScopeVoiceCloneError 网络错误 / provider 返回非成功
   */
  async deleteClonedVoice(voiceId: string): Promise<void> {
    if (!voiceId) {
      throw new DashScopeVoiceCloneError('voiceId is required', 'delete_voice')
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
    let resp: Response
    try {
      resp = await this.fetchImpl(this.endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-OssResourceResolve': 'enable',
        },
        body: JSON.stringify({
          model: 'voice-enrollment',
          input: body.input,
        }),
      })
    } catch (e: any) {
      throw new DashScopeVoiceCloneError(
        `${action} 网络错误：${e?.message ?? e}`,
        action,
      )
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new DashScopeVoiceCloneError(
        `${action} 失败 HTTP ${resp.status}：${text || resp.statusText}`,
        action,
        resp.status,
      )
    }

    let json: DashScopeEnrollmentResponse
    try {
      json = (await resp.json()) as DashScopeEnrollmentResponse
    } catch (e: any) {
      throw new DashScopeVoiceCloneError(
        `${action} 响应不是合法 JSON：${e?.message ?? e}`,
        action,
      )
    }

    // 部分 DashScope 接口返回 200 但 body 里有 code != null 表错
    if (json.code) {
      throw new DashScopeVoiceCloneError(
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
function validatePrefix(prefix: string): void {
  if (!prefix) {
    throw new DashScopeVoiceCloneError('prefix is required', 'create_voice')
  }
  if (!/^[a-z0-9]{1,10}$/.test(prefix)) {
    throw new DashScopeVoiceCloneError(
      `prefix 必须为 1-10 个小写字母或数字（实际：${prefix}）`,
      'create_voice',
    )
  }
}

/** VoiceLanguageCode → DashScope language_hint 字符串 */
function normalizeLanguage(lang: VoiceLanguageCode): string {
  // CosyVoice 接受 ISO 639-1 风格的小写代码，与我们 VoiceLanguageCode 完全一致
  return lang
}

/** DashScope 状态字符串 → 内部 ClonedVoiceStatus */
function mapDashScopeStatus(raw: string): ClonedVoiceStatus {
  const upper = raw.trim().toUpperCase()
  if (upper === 'OK' || upper === 'READY' || upper === 'DEPLOYED') return 'ready'
  if (upper === 'UNDEPLOYED' || upper === 'FAILED' || upper === 'ERROR') return 'failed'
  // DEPLOYING / TRAINING / 任何未知中间态都视为训练中（保守策略：让 scheduler 继续轮询）
  return 'training'
}
