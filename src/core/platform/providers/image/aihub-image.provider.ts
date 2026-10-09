/**
 * AI Hub 图像生成 Provider（统一任务 API）
 * @module platform/providers/image/aihub-image.provider
 * @description ai-hub 网关的图像生成实现（手册 §4.8：POST /v1/images/generations 提交
 *              → GET /v1/tasks/{id} 轮询 → 取 download_url）。
 *
 * 关键设计（详细设计 §2.4.2 方案 A·适配器内部同步化）：
 * ai-hub 图像只有异步任务模型，而 image.service 的 skipHistory 分支（人像制作 10 处调用、
 * EP 资产派生）只在同步返回 images 时生效——本适配器在 generateImage 内部完成
 * "提交→轮询→拿 URL"全程，对 image.service 呈现为同步 provider，存量异步暗坑不被触发。
 *
 * 鉴权：apiKey 即登录物化的 account JWT（aihub-auth.service 物化进 config），
 * 会话失效（401）时清会话 + 禁用 config 并抛 [AIHUB_SESSION_EXPIRED] 前缀错误。
 */

import * as fs from 'fs'
import * as path from 'path'
import { BaseImageProvider } from './base-image-provider'
import type {
  ImageModel,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageTaskStatus,
  ImageProviderConfig
} from '@shared/types/image-provider.types'
import { aihubRequest, aihubOpenAIRequest, AihubHttpError } from '@core/platform/aihub/aihub-client'
import { onAihubTokenExpired } from '@core/platform/aihub/aihub-auth.service'
import {
  AIHUB_ERR_INSUFFICIENT_BALANCE,
  AIHUB_ERR_NOT_LOGGED_IN,
  AIHUB_ERR_SESSION_EXPIRED
} from '@core/platform/aihub/aihub.types'
import { getPathProvider } from '@core/interfaces/path.interface'

/** ai-hub 统一任务提交响应（信封 data：{created, data:[{id,status,model}]}） */
interface AihubSubmitData {
  created?: number
  data?: Array<{ id: string; status?: string; model?: string }>
}

/** ai-hub 任务详情（GET /v1/tasks/{id} 信封 data） */
interface AihubTaskData {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout' | 'cancelled'
  progress?: number
  result?: {
    // 图像已归一化为 results[]（每项含 download_url）；openai/stability 等渠道暂透传
    results?: Array<{ download_url?: string; url?: string }>
    download_url?: string
    image_url?: string
    video_url?: string
  }
  error_message?: string
}

/** 轮询节奏（手册建议：image 2~5s 间隔、总超时 5 分钟） */
const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 5 * 60_000

/** base64 直传的原始文件体积上限（编码后 ≈26MB，低于网关请求体 32MB 限制） */
const MAX_BASE64_FILE_BYTES = 20 * 1024 * 1024

export class AihubImageProvider extends BaseImageProvider {
  constructor(config: ImageProviderConfig) {
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

  protected buildUrl(endpoint: string): string {
    const base = (this.config.baseUrl || 'http://127.0.0.1:8081/v1').replace(/\/+$/, '')
    // baseUrl 约定含 /v1 版本段；endpoint 以 / 开头（/images/generations 等）
    return base.endsWith('/v1') || !endpoint.startsWith('/v1')
      ? `${base}${endpoint}`
      : `${base}${endpoint}`
  }

  /** 网关地址（去掉 /v1，供信封端点 client 使用） */
  private gatewayUrl(): string {
    return (this.config.baseUrl || 'http://127.0.0.1:8081/v1').replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  /** 无会话/无 Key 的统一报错（UI 映射为登录引导） */
  private requireAuth(): void {
    if (!this.config.apiKey) {
      throw new Error(`${AIHUB_ERR_NOT_LOGGED_IN} AI Hub 未登录，请到「设置 → AI Hub 账号」登录后使用网关模型`)
    }
  }

  /** HTTP 错误 → 用户可读错误（401 触发会话失效流程） */
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

  async getModels(): Promise<ImageModel[]> {
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
      .filter((m) => m['x-ai-hub']?.model_type === 'image')
      .map((m) => ({
        id: m.id,
        name: m.id,
        providerId: this.id,
        providerName: this.name,
        features: {
          textToImage: true,
          imageToImage: true,
          imageEdit: true,
          maxResolution: '2048x2048',
          supportedSizes: ['1024x1024', '1024x768', '768x1024', '1920x1080', '1080x1920']
        }
      }))
  }

  /**
   * 生成图像（适配器内部同步化）：提交 → 轮询 → 返回 download_url。
   * @returns 同步形态的响应（images 带 url；无 taskId——任务生命周期已在内部收敛）
   */
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    try {
      this.requireAuth()
      if (!request.model) return { success: false, error: '未指定模型' }
      if (!request.prompt?.trim()) return { success: false, error: '请提供图像描述（prompt）' }

      const params = this.buildParams(request)
      const submit = await aihubRequest<AihubSubmitData>({
        gatewayUrl: this.gatewayUrl(),
        path: '/v1/images/generations',
        method: 'POST',
        jwt: this.config.apiKey,
        body: { model: request.model, params },
        timeoutMs: 30_000
      })

      const taskId = submit?.data?.[0]?.id
      if (!taskId) {
        return { success: false, error: 'AI Hub 任务提交失败：未返回任务 ID' }
      }

      // 适配器内部轮询（skipHistory 调用方依赖同步返回）
      const final = await this.pollTask(taskId)
      if (final.status !== 'completed') {
        return { success: false, error: final.error ?? `AI Hub 图像任务未完成（${final.status}）` }
      }
      const urls = final.urls
      if (urls.length === 0) {
        return { success: false, error: 'AI Hub 图像任务完成但未返回图片地址' }
      }
      return {
        success: true,
        images: urls.map((u) => ({ url: u }))
      }
    } catch (e) {
      return { success: false, error: await this.mapHttpError(e) }
    }
  }

  /** 组装 §4.8.3 规范参数（t2i / i2i；i2i 以带参考图判定） */
  private buildParams(request: ImageGenerationRequest): Record<string, unknown> {
    const params: Record<string, unknown> = {
      prompt: request.prompt,
      size: `${request.width || 1024}x${request.height || 1024}`,
      n: request.count && request.count > 0 ? Math.min(4, request.count) : 1
    }
    if (request.negativePrompt) params.negative_prompt = request.negativePrompt
    if (typeof request.seed === 'number' && request.seed >= 0) params.seed = request.seed
    if (request.promptExtend !== undefined) params.prompt_enhance = request.promptExtend

    // i2i：单参考图（本地路径转 data URI；http/data URI 透传）
    const ref = request.referenceImages?.[0] ?? request.referenceImage
    if (ref) {
      params.image = this.resolveReferenceImage(ref)
      params.mode = 'edit'
      if (typeof request.strength === 'number') params.strength = request.strength
    }
    return params
  }

  /** 参考图解析：URL/data URI 透传；本地路径（file://、local-image://、相对/绝对路径）转 base64 */
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
      throw new Error(`本地参考图不存在: ${absolute}`)
    }
    const size = fs.statSync(absolute).size
    if (size > MAX_BASE64_FILE_BYTES) {
      throw new Error(`参考图超过 ${MAX_BASE64_FILE_BYTES / 1024 / 1024}MB base64 直传上限`)
    }
    const mime = guessMime(path.extname(absolute))
    const b64 = fs.readFileSync(absolute).toString('base64')
    return `data:${mime};base64,${b64}`
  }

  /**
   * 轮询任务至终态（completed / failed）或超时。
   * @returns 终态 + 图像 URL 列表（结果格式兼容：results[].download_url / download_url / image_url）
   */
  private async pollTask(taskId: string): Promise<{ status: string; urls: string[]; error?: string }> {
    const deadline = Date.now() + POLL_TIMEOUT_MS
    for (;;) {
      let task: AihubTaskData
      try {
        task = await aihubRequest<AihubTaskData>({
          gatewayUrl: this.gatewayUrl(),
          path: `/v1/tasks/${taskId}`,
          jwt: this.config.apiKey,
          timeoutMs: 15_000
        })
      } catch (e) {
        // 单次轮询失败不放弃（网络抖动），超时前继续
        if (Date.now() >= deadline) {
          return { status: 'timeout', urls: [], error: await this.mapHttpError(e) }
        }
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      if (task.status === 'completed') {
        return { status: 'completed', urls: extractImageUrls(task) }
      }
      if (task.status === 'failed' || task.status === 'timeout' || task.status === 'cancelled') {
        return { status: task.status, urls: [], error: task.error_message || `任务${task.status}` }
      }
      if (Date.now() >= deadline) {
        return { status: 'timeout', urls: [], error: `生成超时（${POLL_TIMEOUT_MS / 1000}s），任务 ${taskId} 已提交请稍后在历史中查看` }
      }
      await sleep(POLL_INTERVAL_MS)
    }
  }

  /** 异步任务状态查询（保留接口兼容；主路径走 generateImage 内部轮询） */
  async getTaskStatus(taskId: string): Promise<ImageTaskStatus> {
    const task = await aihubRequest<AihubTaskData>({
      gatewayUrl: this.gatewayUrl(),
      path: `/v1/tasks/${taskId}`,
      jwt: this.config.apiKey
    })
    return {
      taskId,
      status: task.status === 'completed' ? 'completed'
        : task.status === 'failed' || task.status === 'timeout' || task.status === 'cancelled' ? 'failed'
        : task.status === 'processing' ? 'processing' : 'pending',
      images: task.status === 'completed' ? extractImageUrls(task).map((u) => ({ url: u })) : undefined,
      error: task.error_message
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      this.requireAuth()
      const models = await this.getModels()
      return models.length > 0
        ? { success: true, message: `连接成功（${models.length} 个图像模型）` }
        : { success: false, message: '连接成功但网关未授权任何图像模型' }
    } catch (e) {
      return { success: false, message: await this.mapHttpError(e) }
    }
  }

  /** 取消任务（上游支持时生效） */
  async cancelTask(taskId: string): Promise<boolean> {
    try {
      await aihubRequest({
        gatewayUrl: this.gatewayUrl(),
        path: `/v1/tasks/${taskId}/cancel`,
        method: 'POST',
        jwt: this.config.apiKey,
        timeoutMs: 15_000
      })
      return true
    } catch {
      return false
    }
  }
}

/** 从任务结果提取图像 URL（多格式兼容，见 AihubTaskData.result 注释） */
function extractImageUrls(task: AihubTaskData): string[] {
  const r = task.result
  if (!r) return []
  const urls: string[] = []
  if (Array.isArray(r.results)) {
    for (const item of r.results) {
      const u = item?.download_url ?? item?.url
      if (u) urls.push(u)
    }
  }
  if (urls.length === 0 && r.download_url) urls.push(r.download_url)
  if (urls.length === 0 && r.image_url) urls.push(r.image_url)
  return urls
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
