/**
 * 火山引擎视频生成 Provider
 * @module video-providers/sdk/volcengine-video-provider
 * @description 使用火山方舟内容生成任务 API（Seedance）实现视频生成
 */

import * as fs from 'fs'
import * as path from 'path'
import type {
  VideoModel,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoTaskStatus
} from '@shared/types/video-provider.types'
import { BaseVideoProvider } from '../base-video-provider'
import { OSSService } from '@core/services/oss.service'

/**
 * 火山引擎任务创建响应（POST /contents/generations/tasks）
 * @see https://docs.volcengine.com/docs/82379/1520757
 */
interface VolcengineVideoResponse {
  id?: string // 任务 ID（cgt-...）
  error?: {
    message: string
    type: string
    code: string
  }
  message?: string
  code?: string
}

/**
 * 火山引擎任务查询响应（GET /contents/generations/tasks/{id}）
 * status: queued / running / succeeded / failed
 */
interface VolcengineTaskResponse {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  content?: {
    video_url?: string
  }
  duration?: number
  resolution?: string
  error?: {
    code?: string
    message?: string
  }
}

/**
 * 火山引擎视频生成 Provider
 *
 * 使用火山方舟平台的视频生成任务 API（Seedance 系列）：
 * 创建 POST /contents/generations/tasks，查询 GET /contents/generations/tasks/{id}。
 *
 * @see https://docs.volcengine.com/docs/82379/1520757
 */
export class VolcengineVideoProvider extends BaseVideoProvider {
  /**
   * 默认 API URL
   */
  private static DEFAULT_API_URL = 'https://ark.cn-beijing.volces.com/api/v3'

  /**
   * Provider 唯一标识
   */
  get id(): string {
    return 'volcengine'
  }

  /**
   * Provider 显示名称
   */
  get name(): string {
    return '火山引擎'
  }

  /**
   * 获取默认 API URL
   */
  protected getDefaultBaseUrl(): string {
    return VolcengineVideoProvider.DEFAULT_API_URL
  }

  /**
   * 获取支持的模型列表
   */
  async getModels(): Promise<VideoModel[]> {
    // 火山引擎的视频生成模型
    return [
      {
        id: 'vidol-v1',
        name: 'Vidol v1',
        providerId: this.id,
        providerName: this.name,
        features: {
          textToVideo: true,
          imageToVideo: true,
          videoToVideo: false,
          maxDuration: 10,
          supportedResolutions: ['720p', '1080p'],
          supportedAspectRatios: ['16:9', '9:16', '1:1']
        }
      }
    ]
  }

  /**
   * 生成视频
   *
   * @param request - 视频生成请求
   * @returns 生成响应，包含任务 ID 或视频
   */
  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    try {
      if (!request.model) {
        return {
          success: false,
          error: '未指定模型'
        }
      }

      // 处理图片输入
      let imageUrl: string | null = null
      if (request.image && request.image.length > 0) {
        // 判断是本地文件还是公网 URL
        if (this.isLocalFilePath(request.image)) {
          const localPath = this.resolveLocalPath(request.image)
          console.log(`[${this.id}] 检测到本地图片，转 base64 data URI（超限走 OSS）:`, localPath)

          imageUrl = await this.uploadLocalFile(localPath)
          if (!imageUrl) {
            return { success: false, error: '本地图片上传失败：base64 直传不可用（文件不存在 / 格式不支持 / 超过 20MB 上限）且 OSS 图床未配置或上传失败。请在设置中配置图床（OSS）服务后重试。' }
          }
        } else {
          imageUrl = request.image
        }
      }

      // 火山方舟视频任务统一端点（文生/图生同一路径，靠 content 区分）
      // image_url 支持公网 URL 与 base64 data URI（data:image/<格式小写>;base64,...）
      // @see https://docs.volcengine.com/docs/82379/1520757
      // @see https://docs.volcengine.com/docs/82379/2607688（使用限制：传入方式=URL/Base64/素材 ID）
      const endpoint = '/contents/generations/tasks'
      const content: Array<Record<string, any>> = []

      if (imageUrl) {
        // 图生视频（首帧）
        if (request.prompt) {
          content.push({ type: 'text', text: request.prompt })
        }
        content.push({ type: 'image_url', image_url: { url: imageUrl } })
      } else if (request.prompt) {
        // 文生视频
        content.push({ type: 'text', text: request.prompt })
      } else {
        return {
          success: false,
          error: '请提供图片或提示词'
        }
      }

      const body: Record<string, any> = {
        model: request.model,
        content,
        ratio: request.aspectRatio || '16:9',
        duration: request.duration || 5
      }

      const url = this.buildUrl(endpoint)
      console.log(`[${this.id}] 发送视频生成请求:`, { url, model: request.model })

      const response = await this.sendRequest<VolcengineVideoResponse>(url, 'POST', body)

      // 检查错误
      if (response.error) {
        return {
          success: false,
          error: response.error.message || '视频生成失败'
        }
      }

      // 异步任务：返回任务 ID（cgt-...）
      if (response.id) {
        return {
          success: true,
          taskId: response.id
        }
      }

      return {
        success: false,
        error: '未获取到任务 ID'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        success: false,
        error: `视频生成失败: ${errorMessage}`
      }
    }
  }

  /**
   * 判断是否为本地文件路径
   */
  private isLocalFilePath(filePath: string): boolean {
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return false
    }
    return filePath.startsWith('file://') ||
           filePath.startsWith('local-image://') ||
           /^[A-Za-z]:/.test(filePath) ||
           filePath.startsWith('/')
  }

  /**
   * 将本地路径转换为实际文件系统路径
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

  /**
   * base64 直传的原始文件体积上限。
   * 方舟限制：单张图片 < 30MB、请求体 < 64MB，且官方建议"大文件请勿使用 Base64 编码"
   * （@see https://docs.volcengine.com/docs/82379/2607688）。
   * base64 编码体积膨胀约 4/3，取原始文件 20MB 为安全上限（编码后 ≈27MB）。
   */
  private static MAX_BASE64_FILE_BYTES = 20 * 1024 * 1024

  /**
   * 本地图片 → 可用于视频任务接口的 image_url。
   *
   * 链：base64 data URI（首选，无需任何外部服务）→ OSS 图床（超限/格式不支持时）。
   *
   * 历史教训：此前先走火山 Files API 拿 file://<id>，但视频任务接口不接受 File ID，
   * 该路径已被移除（2026-09 F6 修复）；方舟视频接口的 image_url 支持
   * 公网 URL 与 base64 data URI 两种形式。
   *
   * @param localPath - 本地文件路径
   * @returns base64 data URI 或 OSS 公网 URL；均不可用时返回 null
   */
  private async uploadLocalFile(localPath: string): Promise<string | null> {
    try {
      if (!fs.existsSync(localPath)) {
        console.error(`[${this.id}] 文件不存在:`, localPath)
        return null
      }

      const dataUri = this.toBase64DataUri(localPath)
      if (dataUri) {
        console.log(`[${this.id}] 已转 base64 data URI（长度 ${dataUri.length}）`)
        return dataUri
      }

      // base64 不可用（格式不支持 / 超体积上限）→ 回落 OSS
      console.log(`[${this.id}] base64 直传不可用（格式不支持或超过 ${VolcengineVideoProvider.MAX_BASE64_FILE_BYTES / 1024 / 1024}MB），尝试 OSS 服务`)
      const ossUrl = await this.uploadViaOSS(localPath)
      if (ossUrl) {
        console.log(`[${this.id}] OSS 上传成功:`, ossUrl)
        return ossUrl
      }

      console.error(`[${this.id}] base64 与 OSS 均不可用`)
      return null
    } catch (error) {
      console.error(`[${this.id}] 处理本地图片异常:`, error)
      return null
    }
  }

  /**
   * 读本地文件转 base64 data URI（方舟要求格式名小写：data:image/<格式>;base64,...）。
   * 格式不支持或文件超过 MAX_BASE64_FILE_BYTES 时返回 null（caller 回落 OSS）。
   */
  private toBase64DataUri(localPath: string): string | null {
    const ext = path.extname(localPath).toLowerCase()
    // 方舟视频接口支持的图片格式：jpeg、png、webp、bmp、tiff、gif（+部分模型 heic/heif）
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tif': 'image/tiff',
      '.tiff': 'image/tiff',
    }
    const mimeType = mimeTypes[ext]
    if (!mimeType) {
      console.warn(`[${this.id}] 不支持的图片格式（base64 直传跳过）:`, ext)
      return null
    }
    const size = fs.statSync(localPath).size
    if (size > VolcengineVideoProvider.MAX_BASE64_FILE_BYTES) {
      console.warn(`[${this.id}] 图片 ${size}B 超过 base64 直传上限，跳过`)
      return null
    }
    const b64 = fs.readFileSync(localPath).toString('base64')
    return `data:${mimeType};base64,${b64}`
  }

  /**
   * 通过 OSS 服务上传文件
   *
   * @param localPath - 本地文件路径
   * @returns 上传后的 URL
   */
  private async uploadViaOSS(localPath: string): Promise<string | null> {
    try {
      const ossService = OSSService.getInstance()
      const result = await ossService.uploadFile({ localPath })

      if (result.success && result.url) {
        return result.url
      }

      console.log(`[${this.id}] OSS 上传失败:`, result.error)
      return null
    } catch (error) {
      console.error(`[${this.id}] OSS 上传异常:`, error)
      return null
    }
  }

  /**
   * 查询异步任务状态
   *
   * @param taskId - 任务 ID
   * @returns 任务状态信息
   */
  async getTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    try {
      const url = this.buildUrl(`/contents/generations/tasks/${taskId}`)
      const response = await this.sendRequest<VolcengineTaskResponse>(url, 'GET')

      // 方舟状态映射：queued→pending、running→processing、succeeded→completed、failed→failed
      const statusMap: Record<string, VideoTaskStatus['status']> = {
        queued: 'pending',
        running: 'processing',
        succeeded: 'completed',
        failed: 'failed'
      }
      const result: VideoTaskStatus = {
        taskId,
        status: statusMap[response.status] ?? 'processing'
      }

      const videoUrl = response.content?.video_url
      if (response.status === 'succeeded' && videoUrl) {
        result.video = {
          url: videoUrl,
          duration: response.duration
        }
      } else if (response.status === 'failed') {
        result.error = response.error?.message || response.error?.code || '视频生成失败'
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        taskId,
        status: 'failed',
        error: errorMessage
      }
    }
  }

  /**
   * 测试 Provider 连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // 尝试获取模型列表验证连接
      const models = await this.getModels()
      return {
        success: true,
        message: `连接成功，支持 ${models.length} 个模型`
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        success: false,
        message: `连接失败: ${errorMessage}`
      }
    }
  }

  /**
   * 构建请求头
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    }
  }
}