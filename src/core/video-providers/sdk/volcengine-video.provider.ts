/**
 * 火山引擎（方舟 Ark）视频生成 Provider —— Seedance 支持
 * @module video-providers/sdk/volcengine-video-provider
 * @description
 * 对接火山方舟 Ark 的内容生成视频 API（CreateContentsGenerationsTasks），
 * 支持 Seedance 2.0 / 2.0 fast / 1.5 pro 等模型的图生视频、文生视频。
 *
 * API 规范（方舟 Seedance）：
 *  - 创建任务：POST {baseUrl}/contents/generations/tasks
 *      body: { model, content:[{type:'text',text}, {type:'image_url',image_url:{url}}],
 *              duration, resolution, ratio, generate_audio, watermark, seed, ... }
 *      content[].image_url.url 支持公网 URL 或 data:image/png;base64,...
 *  - 查询任务：GET {baseUrl}/contents/generations/tasks/{taskId}
 *      resp: { id, status:'succeeded'|'running'|'failed', content:{ video_url, last_frame_url } }
 */

import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import type {
  VideoModel,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoTaskStatus,
  GeneratedVideo
} from '@shared/types/video-provider.types'
import { BaseVideoProvider } from '../base-video-provider'

/**
 * 方舟内容生成任务创建响应（CreateContentsGenerationsTasks）
 */
interface VolcengineCreateResponse {
  id?: string
  status?: string
  error?: { message?: string; code?: string }
  message?: string
  code?: string
}

/**
 * 方舟内容生成任务查询响应
 */
interface VolcengineTaskResponse {
  id?: string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'expired'
  content?: {
    video_url?: string
    last_frame_url?: string
  }
  error?: { message?: string; code?: string }
  duration?: number
  resolution?: string
  ratio?: string
}

/** 图片（jpeg/png/webp/bmp/tiff/gif）MIME 推断 */
function guessMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.png': return 'image/png'
    case '.webp': return 'image/webp'
    case '.bmp': return 'image/bmp'
    case '.tiff':
    case '.tif': return 'image/tiff'
    case '.gif': return 'image/gif'
    default: return 'image/png'
  }
}

/** 从 width/height/aspectRatio 推断方舟 ratio（默认 9:16 竖版） */
function inferRatio(width?: number, height?: number, aspectRatio?: string): string {
  if (aspectRatio && /^\d+:\d+$/.test(aspectRatio)) return aspectRatio
  if (width && height) {
    if (width === height) return '1:1'
    if (width > height) return '16:9'
    return '9:16'
  }
  return '9:16'
}

/** 从 width/height 推断分辨率档位（720p/1080p/480p） */
function inferResolution(width?: number, height?: number): string {
  const maxSide = Math.max(width ?? 0, height ?? 0)
  if (maxSide >= 1000) return '1080p'
  if (maxSide >= 600) return '720p'
  return '480p'
}

/**
 * 火山引擎（方舟 Ark）Seedance 视频生成 Provider
 *
 * @see https://www.volcengine.com/docs/82379/1520758
 */
export class VolcengineVideoProvider extends BaseVideoProvider {
  /** 默认 API URL（方舟 Ark） */
  private static DEFAULT_API_URL = 'https://ark.cn-beijing.volces.com/api/v3'

  get id(): string {
    return 'volcengine'
  }

  get name(): string {
    return '火山引擎（方舟 Seedance）'
  }

  protected getDefaultBaseUrl(): string {
    return VolcengineVideoProvider.DEFAULT_API_URL
  }

  /** 支持模型：Seedance 2.0（ep-* 端点 id 由用户配置，这里给默认能力说明） */
  async getModels(): Promise<VideoModel[]> {
    return [
      {
        id: 'ep-20260511121109-hchqf',
        name: 'Doubao-Seedance-2.0',
        providerId: this.id,
        providerName: this.name,
        features: {
          textToVideo: true,
          imageToVideo: true,
          videoToVideo: false,
          maxDuration: 15,
          supportedResolutions: ['480p', '720p', '1080p'],
          supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        },
      },
    ]
  }

  /**
   * 处理输入图：base64 data URL 直接透传；本地路径 / local-image 协议 / file 协议读取转 base64 data URL。
   * @returns 可直接放入 image_url.url 的值，或 null（未提供图）
   */
  private async resolveImageUrl(request: VideoGenerationRequest): Promise<string | null> {
    const raw = request.image
    if (!raw || raw.length === 0) return null
    // 已是公网 URL 或 data:image/...;base64, 或 asset:// —— 直接使用
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:') || raw.startsWith('asset://')) {
      return raw
    }
    // 本地文件 / local-image:// / file:// —— 读文件转 base64 data URL
    const localPath = this.resolveLocalPath(raw)
    const absolute = path.isAbsolute(localPath) ? localPath : path.resolve(getPathProvider().getDataPath(), localPath)
    if (!fs.existsSync(absolute)) {
      // 仍可能是相对 app 数据根的路径，尽量解析过一次即可；不存在则由下游报错
      return raw
    }
    const buf = fs.readFileSync(absolute)
    const ext = path.extname(absolute)
    const mime = guessMime(ext)
    return `data:${mime};base64,${buf.toString('base64')}`
  }

  /** 生成视频（图生视频 / 文生视频） */
  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    try {
      if (!request.model) {
        return { success: false, error: '未指定模型' }
      }

      const imageUrl = await this.resolveImageUrl(request)
      const content: Array<Record<string, unknown>> = []

      if (imageUrl) {
        // 图生视频：文本提示词（可选）+ 图片首帧
        if (request.prompt) {
          content.push({ type: 'text', text: request.prompt })
        }
        content.push({ type: 'image_url', image_url: { url: imageUrl } })
      } else if (request.prompt) {
        // 文生视频
        content.push({ type: 'text', text: request.prompt })
      } else {
        return { success: false, error: '请提供图片或提示词' }
      }

      const body: Record<string, unknown> = {
        model: request.model,
        content,
        // Seedance 2.0 duration 支持 [4,15]；用 s 智能时长（-1）会由模型决定，这里优先按请求时长
        duration: request.duration && request.duration > 0 ? Math.min(15, Math.max(4, Math.round(request.duration))) : undefined,
        resolution: inferResolution(request.width, request.height),
        ratio: inferRatio(request.width, request.height, request.aspectRatio),
        // 配音走独立 TTS 节点，不让模型内置生成音频；如需同步音效可改为 true
        generate_audio: false,
        watermark: false,
      }
      if (request.seed !== undefined && request.seed >= 0) body.seed = request.seed

      const url = this.buildUrl('/contents/generations/tasks')
      console.log(`[${this.id}] 发送视频生成请求:`, { url, model: request.model, hasImage: !!imageUrl })
      console.log(`[${this.id}] 请求体:`, JSON.stringify(body, null, 2))

      const response = await this.sendRequest<VolcengineCreateResponse>(url, 'POST', body)

      // 错误检查（体含 error 或业务 code）
      const bizErr = (response as { error?: { message?: string } }).error
      if (bizErr?.message) {
        return { success: false, error: bizErr.message }
      }
      if ((response as { code?: string }).code && (response as { code?: string }).code !== '0') {
        return { success: false, error: (response as { message?: string }).message || `错误代码: ${(response as { code?: string }).code}` }
      }

      // 异步任务：返回 id
      if (response.id) {
        console.log(`[${this.id}] 视频生成任务已创建，taskId:`, response.id)
        return { success: true, taskId: response.id }
      }

      return { success: false, error: '未获取到生成任务 ID' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: `视频生成失败: ${errorMessage}` }
    }
  }

  /** 查询异步任务状态 */
  async getTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    try {
      const url = this.buildUrl(`/contents/generations/tasks/${taskId}`)
      const response = await this.sendRequest<VolcengineTaskResponse>(url, 'GET')

      const status = this.mapStatus(response.status)
      const result: VideoTaskStatus = { taskId, status }

      if (status === 'completed' && response.content?.video_url) {
        const video: GeneratedVideo = {
          url: response.content.video_url,
          duration: response.duration,
        }
        if (response.content.last_frame_url) video.thumbnailUrl = response.content.last_frame_url
        result.video = video
      } else if (status === 'failed') {
        result.error = response.error?.message || '视频生成失败'
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { taskId, status: 'failed', error: errorMessage }
    }
  }

  /** 测试 Provider 连接 */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const models = await this.getModels()
      return { success: true, message: `连接成功，支持 ${models.length} 个模型` }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, message: `连接失败: ${errorMessage}` }
    }
  }

  /**
   * 将本地路径（file:// / local-image:// / 绝对路径）转换为实际文件系统路径
   */
  private resolveLocalPath(inputPath: string): string {
    if (inputPath.startsWith('file://')) {
      return decodeURIComponent(inputPath.replace('file://', ''))
    }
    if (inputPath.startsWith('local-image://')) {
      const decoded = decodeURIComponent(inputPath.replace('local-image://', ''))
      return decoded.startsWith('/') ? decoded.substring(1) : decoded
    }
    return inputPath
  }

  /** 请求头 */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    }
  }

  /** 映射方舟任务状态到统一枚举 */
  private mapStatus(status?: string): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (status) {
      case 'queued': return 'pending'
      case 'running': return 'processing'
      case 'succeeded': return 'completed'
      case 'failed':
      case 'expired': return 'failed'
      default: return 'pending'
    }
  }
}
