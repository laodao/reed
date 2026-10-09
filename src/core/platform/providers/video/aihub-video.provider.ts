/**
 * AI Hub 视频生成 Provider（统一任务 API）
 * @module platform/providers/video/aihub-video.provider
 * @description ai-hub 网关的视频生成实现（手册 §4.8：POST /v1/videos/generations 提交
 *              → GET /v1/tasks/{id} 轮询 → 取结果 URL）。
 *
 * - t2v：prompt / size / duration / seed 等规范参数；i2v：以带 image 判定（首帧参考图，
 *   本地文件转 base64 data URI——复刻火山范本）；
 * - getTaskStatus 内部做 5s 节流（bridge 轮询间隔 2s 偏密，避免打爆网关）；
 * - 结果字段兼容：download_url（归一化渠道）与 video_url（透传渠道）都取；
 * - 鉴权同 AihubImageProvider：apiKey 即登录物化 JWT，401 触发会话失效流程。
 */

import * as fs from 'fs'
import * as path from 'path'
import { BaseVideoProvider } from './base-video-provider'
import type {
  VideoProviderConfig,
  VideoModel,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoTaskStatus
} from '@shared/types/video-provider.types'
import { aihubRequest, aihubOpenAIRequest, AihubHttpError } from '@core/platform/aihub/aihub-client'
import { onAihubTokenExpired } from '@core/platform/aihub/aihub-auth.service'
import {
  AIHUB_ERR_INSUFFICIENT_BALANCE,
  AIHUB_ERR_NOT_LOGGED_IN,
  AIHUB_ERR_SESSION_EXPIRED
} from '@core/platform/aihub/aihub.types'
import { getPathProvider } from '@core/interfaces/path.interface'

interface AihubSubmitData {
  created?: number
  data?: Array<{ id: string; status?: string; model?: string }>
}

interface AihubTaskData {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout' | 'cancelled'
  progress?: number
  progress_message?: string
  result?: {
    results?: Array<{ download_url?: string; url?: string }>
    download_url?: string
    video_url?: string
    url?: string
    // 透传渠道兜底（未归一化结构）
    data?: Array<{ url?: string }>
  }
  error_message?: string
}

/** 单次状态查询超时 */
const QUERY_TIMEOUT_MS = 20_000
/** getTaskStatus 节流：bridge 轮询 2s 偏密，网关侧 5s 内复用上次结果（详细设计 §2.5.1） */
const STATUS_THROTTLE_MS = 5_000

export class AihubVideoProvider extends BaseVideoProvider {
  /** 节流缓存：{上次查询时刻, 上次结果} */
  private lastStatusAt = 0
  private lastStatus: VideoTaskStatus | null = null

  constructor(config: VideoProviderConfig) {
    super(config)
  }

  get id(): string {
    return 'aihub'
  }

  get name(): string {
    return 'AI Hub（统一网关）'
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`
    return headers
  }

  protected getDefaultBaseUrl(): string {
    return this.config.baseUrl || 'http://127.0.0.1:8081/v1'
  }

  /** 网关地址（去 /v1，供信封端点 client 使用） */
  private gatewayUrl(): string {
    return (this.config.baseUrl || 'http://127.0.0.1:8081/v1').replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  private requireAuth(): void {
    if (!this.config.apiKey) {
      throw new Error(`${AIHUB_ERR_NOT_LOGGED_IN} AI Hub 未登录，请到「设置 → AI Hub 账号」登录后使用网关模型`)
    }
  }

  private async mapHttpError(e: unknown): Promise<string> {
    if (e instanceof AihubHttpError) {
      if (e.status === 401) {
        void onAihubTokenExpired().catch(() => {})
        return `${AIHUB_ERR_SESSION_EXPIRED} AI Hub 登录已过期，请重新登录`
      }
      if (e.status === 402) {
        return `${AIHUB_ERR_INSUFFICIENT_BALANCE} AI Hub 余额不足，请充值或兑换后重试`
      }
      return `AI Hub 请求失败: HTTP ${e.status}`
    }
    return e instanceof Error ? e.message : String(e)
  }

  async getModels(): Promise<VideoModel[]> {
    this.requireAuth()
    const res = await aihubOpenAIRequest<{ object: string; data: Array<{
      id: string
      'x-ai-hub'?: { model_type?: string }
    }> }>({
      gatewayUrl: this.gatewayUrl(),
      path: '/v1/models',
      jwt: this.config.apiKey
    })
    return (res?.data ?? [])
      .filter((m) => m['x-ai-hub']?.model_type === 'video')
      .map((m) => ({
        id: m.id,
        name: m.id,
        providerId: this.id,
        providerName: this.name,
        features: {
          textToVideo: true,
          imageToVideo: true,
          videoToVideo: false,
          maxDuration: 15,
          supportedResolutions: ['480p', '720p', '1080p'],
          supportedAspectRatios: ['16:9', '9:16', '1:1']
        }
      }))
  }

  /**
   * 生成视频：提交任务（异步模型，返回 taskId 由上层轮询框架接管）。
   * 上层轮询上限（bridge 30 分钟 / video-generation.service 75 分钟）均大于手册建议的
   * 15 分钟总超时，无需放宽。
   */
  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    try {
      this.requireAuth()
      if (!request.model) return { success: false, error: '未指定模型' }
      if (!request.prompt?.trim() && !request.image && !(request.images?.length)) {
        return { success: false, error: '请提供视频描述（prompt）或首帧图片' }
      }

      const params: Record<string, unknown> = {}
      if (request.prompt?.trim()) params.prompt = request.prompt.trim()
      if (request.negativePrompt) params.negative_prompt = request.negativePrompt
      if (request.width && request.height) params.size = `${request.width}x${request.height}`
      if (request.duration && request.duration > 0) {
        params.duration = Math.min(15, Math.max(2, Math.round(request.duration)))
      }
      if (typeof request.seed === 'number' && request.seed >= 0) params.seed = request.seed

      // i2v：首帧参考图（images[0] 优先，兼容单 image 字段——bridge 的 keyframesToVideo 首帧 fallback）
      const firstFrame = request.images?.[0] ?? request.image
      if (firstFrame) params.image = this.resolveReferenceImage(firstFrame)

      const submit = await aihubRequest<AihubSubmitData>({
        gatewayUrl: this.gatewayUrl(),
        path: '/v1/videos/generations',
        method: 'POST',
        jwt: this.config.apiKey,
        body: { model: request.model, params },
        timeoutMs: 30_000
      })

      const taskId = submit?.data?.[0]?.id
      if (!taskId) {
        return { success: false, error: 'AI Hub 任务提交失败：未返回任务 ID' }
      }
      return { success: true, taskId }
    } catch (e) {
      return { success: false, error: await this.mapHttpError(e) }
    }
  }

  /**
   * 查询任务状态（5s 节流：过密查询复用上次结果）。
   * completed 时 result URL 原值上抛——上层必须立即下载（download_url 3600s 过期）。
   */
  async getTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    const now = Date.now()
    if (this.lastStatus && now - this.lastStatusAt < STATUS_THROTTLE_MS) {
      return this.lastStatus
    }

    const status = await this.queryTask(taskId)
    this.lastStatus = status
    this.lastStatusAt = now
    return status
  }

  private async queryTask(taskId: string): Promise<VideoTaskStatus> {
    try {
      const task = await aihubRequest<AihubTaskData>({
        gatewayUrl: this.gatewayUrl(),
        path: `/v1/tasks/${taskId}`,
        jwt: this.config.apiKey,
        timeoutMs: QUERY_TIMEOUT_MS
      })
      return {
        taskId,
        status: task.status === 'completed' ? 'completed'
          : task.status === 'failed' || task.status === 'timeout' || task.status === 'cancelled' ? 'failed'
          : task.status === 'processing' ? 'processing' : 'pending',
        progress: task.progress,
        video: task.status === 'completed' ? { url: extractVideoUrl(task) } : undefined,
        error: task.error_message
      }
    } catch (e) {
      // 查询失败不改变任务态：回 pending 让上层继续轮询（错误透传在 message 字段打日志）
      console.warn(`[aihub-video] 查询任务 ${taskId} 失败:`, e instanceof Error ? e.message : e)
      return { taskId, status: 'pending' }
    }
  }

  /** 参考图解析：URL/data URI 透传；本地路径转 base64 data URI（≤20MB） */
  private resolveReferenceImage(raw: string): string {
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
      return raw
    }
    let localPath = raw
    if (localPath.startsWith('file://')) {
      localPath = decodeURIComponent(localPath.replace('file://', ''))
    } else if (localPath.startsWith('local-image://')) {
      localPath = decodeURIComponent(localPath.replace('local-image://', ''))
      if (localPath.startsWith('/')) localPath = localPath.substring(1)
    }
    const absolute = path.isAbsolute(localPath)
      ? localPath
      : path.resolve(getPathProvider().getDataPath(), localPath)
    if (!fs.existsSync(absolute)) {
      throw new Error(`本地首帧图片不存在: ${absolute}`)
    }
    const size = fs.statSync(absolute).size
    const MAX = 20 * 1024 * 1024
    if (size > MAX) {
      throw new Error(`首帧图片超过 ${MAX / 1024 / 1024}MB base64 直传上限`)
    }
    const mime = guessMime(path.extname(absolute))
    const b64 = fs.readFileSync(absolute).toString('base64')
    return `data:${mime};base64,${b64}`
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      this.requireAuth()
      const models = await this.getModels()
      return models.length > 0
        ? { success: true, message: `连接成功（${models.length} 个视频模型）` }
        : { success: false, message: '连接成功但网关未授权任何视频模型' }
    } catch (e) {
      return { success: false, message: await this.mapHttpError(e) }
    }
  }

  async cancelTask(taskId: string): Promise<boolean> {
    try {
      await aihubRequest({
        gatewayUrl: this.gatewayUrl(),
        path: `/v1/tasks/${taskId}/cancel`,
        method: 'POST',
        jwt: this.config.apiKey,
        timeoutMs: QUERY_TIMEOUT_MS
      })
      return true
    } catch {
      return false
    }
  }
}

/** 从任务结果提取视频 URL（download_url 归一化优先，video_url/url 透传兜底，data[0].url 再兜底） */
function extractVideoUrl(task: AihubTaskData): string {
  const r = task.result
  if (!r) return ''
  if (Array.isArray(r.results)) {
    const u = r.results.find((x) => x.download_url || x.url)
    if (u) return (u.download_url ?? u.url)!
  }
  if (Array.isArray(r.data)) {
    const u = r.data.find((x) => x?.url)
    if (u) return u.url!
  }
  return r.download_url ?? r.video_url ?? r.url ?? ''
}

function guessMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.png': return 'image/png'
    case '.webp': return 'image/webp'
    case '.bmp': return 'image/bmp'
    case '.gif': return 'image/gif'
    default: return 'image/png'
  }
}
