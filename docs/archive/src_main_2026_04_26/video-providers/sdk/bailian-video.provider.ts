/**
 * 阿里云百炼视频生成 Provider
 * @module video-providers/sdk/bailian-video-provider
 * @description 使用阿里云百炼 API 实现视频生成
 */

import * as fs from 'fs'
import * as path from 'path'
import type {
  VideoModel,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoTaskStatus
} from '../../../shared/types/video-provider.types'
import { BaseVideoProvider } from '../base-video-provider'
import { OSSService } from '../../services/oss.service'

/**
 * 百炼文件上传响应
 */
interface BailianFileUploadResponse {
  file_id?: string
  upload_id?: string
  url?: string
  code?: string
  message?: string
}

/**
 * 百炼上传策略响应
 */
interface BailianUploadPolicyResponse {
  request_id?: string
  data?: {
    policy: string
    signature: string
    upload_dir: string
    upload_host: string
    oss_access_key_id: string
    x_oss_object_acl: string
    x_oss_forbid_overwrite: string
    expire_in_seconds: number
  }
  code?: string
  message?: string
}

/**
 * 上传结果
 */
interface UploadResult {
  url: string
  needsOssResolve: boolean  // 是否需要添加 X-DashScope-OssResourceResolve 请求头
}

/**
 * 百炼视频生成响应格式
 */
interface BailianVideoResponse {
  // 同步响应
  output?: {
    video_url?: string
    duration?: number
    width?: number
    height?: number
  }
  // 异步响应
  task_id?: string
  request_id?: string
  // 错误信息
  code?: string
  message?: string
}

/**
 * 百炼任务状态响应
 * 注意：响应数据在 output 字段中
 */
interface BailianTaskResponse {
  request_id?: string
  output?: {
    task_id: string
    task_status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'
    submit_time?: string
    scheduled_time?: string
    end_time?: string
    video_url?: string
    orig_prompt?: string
    code?: string
    message?: string
  }
  usage?: {
    duration?: number
    input_video_duration?: number
    output_video_duration?: number
    video_count?: number
    SR?: number
  }
  code?: string
  message?: string
}

/**
 * 阿里云百炼视频生成 Provider
 *
 * 使用阿里云百炼平台的视频生成 API。
 * 支持图生视频和文生视频。
 *
 * @see https://help.aliyun.com/document_detail/2850399.html
 */
export class BailianVideoProvider extends BaseVideoProvider {
  /**
   * 默认 API URL
   */
  private static DEFAULT_API_URL = 'https://dashscope.aliyuncs.com/api/v1'

  /**
   * Provider 唯一标识
   */
  get id(): string {
    return 'bailian'
  }

  /**
   * Provider 显示名称
   */
  get name(): string {
    return '阿里云百炼'
  }

  /**
   * 获取默认 API URL
   */
  protected getDefaultBaseUrl(): string {
    return BailianVideoProvider.DEFAULT_API_URL
  }

  /**
   * 获取支持的模型列表
   * 模型从用户配置中获取，此处返回空列表
   */
  async getModels(): Promise<VideoModel[]> {
    // 模型从用户配置中获取，此处返回空数组
    return []
  }

  /**
   * 上传本地文件到百炼平台
   * 使用百炼的临时文件上传接口上传本地图片，获取临时 URL
   * 如果临时上传失败，尝试使用 OSS 服务上传
   *
   * @param localPath - 本地文件路径
   * @param model - 视频生成模型名称
   * @returns 上传结果，包含 URL 和是否需要特殊请求头
   */
  private async uploadLocalFile(localPath: string, model?: string): Promise<UploadResult | null> {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(localPath)) {
        console.error(`[${this.id}] 文件不存在:`, localPath)
        return null
      }

      // 首先尝试百炼临时文件上传接口
      const tempResult = await this.uploadViaTempPolicy(localPath, model)
      if (tempResult) {
        console.log(`[${this.id}] 百炼临时上传成功:`, tempResult.url)
        return tempResult
      }

      // 临时上传失败，尝试使用 OSS 服务
      console.log(`[${this.id}] 百炼临时上传失败，尝试 OSS 服务`)
      const ossUrl = await this.uploadViaOSS(localPath)
      if (ossUrl) {
        console.log(`[${this.id}] OSS 上传成功:`, ossUrl)
        return { url: ossUrl, needsOssResolve: false }
      }

      console.error(`[${this.id}] 所有上传方式均失败`)
      return null
    } catch (error) {
      console.error(`[${this.id}] 上传文件异常:`, error)
      return null
    }
  }

  /**
   * 获取临时上传 API 的基础 URL
   * 临时上传接口固定在 /api/v1 路径下，不受用户 baseUrl 配置影响
   * 用户配置的 baseUrl 通常用于模型调用（如 /compatible-mode/v1），但上传接口位置固定
   */
  private getUploadBaseUrl(): string {
    // 从用户配置的 baseUrl 中提取域名，或使用默认域名
    const configuredBaseUrl = this.config.baseUrl
    if (configuredBaseUrl) {
      // 提取域名部分，例如 https://dashscope.aliyuncs.com
      const urlMatch = configuredBaseUrl.match(/^https?:\/\/[^\/]+/)
      if (urlMatch) {
        return `${urlMatch[0]}/api/v1`
      }
    }
    // 默认使用阿里云 DashScope 域名
    return 'https://dashscope.aliyuncs.com/api/v1'
  }

  /**
   * 通过百炼临时文件上传接口上传
   * 参考: https://help.aliyun.com/zh/model-studio/get-temporary-file-url
   *
   * @param localPath - 本地文件路径
   * @param model - 视频生成模型名称
   * @returns 上传结果，包含 URL 和是否需要特殊请求头
   */
  private async uploadViaTempPolicy(localPath: string, model?: string): Promise<UploadResult | null> {
    try {
      const fileName = path.basename(localPath)
      const ext = path.extname(localPath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'

      // 第一步：获取上传策略
      // 使用实际的视频生成模型作为 model 参数
      // 注意：上传接口固定在 /api/v1/uploads 路径，不使用用户配置的 baseUrl
      const modelName = model || 'wanx2.1-i2v-plus'
      const uploadBaseUrl = this.getUploadBaseUrl()
      const policyUrl = `${uploadBaseUrl}/uploads?action=getPolicy&model=${modelName}`
      console.log(`[${this.id}] 获取上传策略:`, policyUrl)

      const policyResponse = await fetch(policyUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!policyResponse.ok) {
        const errorText = await policyResponse.text()
        console.error(`[${this.id}] 获取上传策略失败:`, policyResponse.status, errorText)
        return null
      }

      const policyResult = await policyResponse.json() as BailianUploadPolicyResponse

      if (!policyResult.data) {
        console.error(`[${this.id}] 上传策略响应无效:`, JSON.stringify(policyResult))
        return null
      }

      const { upload_host, upload_dir, policy, signature, oss_access_key_id, x_oss_object_acl, x_oss_forbid_overwrite } = policyResult.data

      console.log(`[${this.id}] 获取上传策略成功:`, {
        upload_host,
        upload_dir,
        expire_in_seconds: policyResult.data.expire_in_seconds
      })

      // 第二步：上传文件到 OSS
      const fileBuffer = fs.readFileSync(localPath)
      const key = `${upload_dir}/${fileName}`

      // 构建 FormData
      const formData = new FormData()
      formData.append('OSSAccessKeyId', oss_access_key_id)
      formData.append('Signature', signature)
      formData.append('policy', policy)
      formData.append('x-oss-object-acl', x_oss_object_acl)
      formData.append('x-oss-forbid-overwrite', x_oss_forbid_overwrite)
      formData.append('key', key)
      formData.append('file', new Blob([fileBuffer], { type: mimeType }), fileName)

      console.log(`[${this.id}] 上传文件到 OSS:`, { upload_host, key, size: fileBuffer.length })

      const uploadResponse = await fetch(upload_host, {
        method: 'POST',
        body: formData
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        console.error(`[${this.id}] 文件上传失败:`, uploadResponse.status, errorText)
        return null
      }

      // 上传成功，构建临时文件 URL
      // 根据阿里云文档，临时文件应使用 oss:// 协议格式
      // 格式为 oss://dashscope-instant/xxx/xxx.png（使用 upload_dir 作为路径）
      // upload_dir 格式为: dashscope-instant/user_hash/date/uuid/filename
      // 注意：使用 oss:// URL 时，必须在请求头中添加 X-DashScope-OssResourceResolve: enable
      const ossUrl = `oss://${key}`
      console.log(`[${this.id}] 临时文件上传成功`)
      console.log(`[${this.id}] OSS URL:`, ossUrl)
      console.log(`[${this.id}] HTTPS URL (参考):`, `${upload_host}/${key}`)

      // 返回 oss:// URL 格式
      // 注意：使用 oss:// URL 必须添加 X-DashScope-OssResourceResolve: enable 请求头
      return {
        url: ossUrl,
        needsOssResolve: true  // oss:// URL 需要添加 OSS Resolve 请求头
      }
    } catch (error) {
      console.error(`[${this.id}] 百炼临时上传异常:`, error)
      return null
    }
  }

  /**
   * 通过 OSS 服务上传文件
   *
   * @param localPath - 本地文件路径
   * @returns 上传后的公网 URL，失败返回 null
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
   * 判断是否为本地文件路径
   */
  private isLocalFilePath(path: string): boolean {
    // 判断是否为本地路径（不是 http/https URL）
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return false
    }
    // 判断是否为 file:// 或本地路径格式
    return path.startsWith('file://') ||
           path.startsWith('local-image://') ||
           /^[A-Za-z]:/.test(path) ||  // Windows 路径
           path.startsWith('/')  // Unix 路径
  }

  /**
   * 将本地路径转换为实际文件系统路径
   */
  private resolveLocalPath(inputPath: string): string {
    // 处理 file:// 协议
    if (inputPath.startsWith('file://')) {
      return decodeURIComponent(inputPath.replace('file://', ''))
    }
    // 处理 local-image:// 协议
    if (inputPath.startsWith('local-image://')) {
      // local-image:///C:/path -> C:/path
      const decoded = decodeURIComponent(inputPath.replace('local-image://', ''))
      return decoded.startsWith('/') ? decoded.substring(1) : decoded
    }
    return inputPath
  }

  /**
   * 生成视频
   *
   * @param request - 视频生成请求
   * @returns 生成响应
   */
  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    try {
      if (!request.model) {
        return { success: false, error: '未指定模型' }
      }

      // 处理图片输入
      let imageUrl: string | null = null
      let needsOssResolve = false

      if (request.image && request.image.length > 0) {
        // 判断是本地文件还是公网 URL
        if (this.isLocalFilePath(request.image)) {
          // 本地文件需要先上传到百炼平台
          const localPath = this.resolveLocalPath(request.image)
          console.log(`[${this.id}] 检测到本地图片，正在上传:`, localPath)

          const uploadResult = await this.uploadLocalFile(localPath, request.model)
          if (!uploadResult) {
            return { success: false, error: '本地图片上传失败。请检查网络连接，或在设置中配置图床（OSS）服务作为备选方案。' }
          }

          imageUrl = uploadResult.url
          needsOssResolve = uploadResult.needsOssResolve

          console.log(`[${this.id}] 上传完成，图片 URL:`, imageUrl)
          console.log(`[${this.id}] 需要添加 OSS Resolve 请求头:`, needsOssResolve)
        } else {
          // 公网 URL 直接使用
          imageUrl = request.image
          console.log(`[${this.id}] 使用公网 URL:`, imageUrl)
        }
      }

      // 确定是图生视频还是文生视频
      const isImageToVideo = imageUrl !== null

      // 获取视频生成 API 的基础 URL
      // 视频生成接口固定在 /api/v1 路径下，与上传接口相同
      const videoApiBaseUrl = this.getUploadBaseUrl()
      // 注意：图生视频 API 路径是 /video-synthesis，不是 /generation
      const endpoint = '/services/aigc/video-generation/video-synthesis'
      const url = `${videoApiBaseUrl}${endpoint}`
      console.log(`[${this.id}] 使用 API URL:`, url)

      // 构建请求体
      // 注意：wan2.7-i2v 模型使用新的 API 格式
      // 图片需要放在 input.media 数组中
      const body: Record<string, any> = {
        model: request.model,
        input: {},
        parameters: {}
      }

      if (isImageToVideo && imageUrl) {
        // 图生视频：使用 media 数组格式
        body.input.media = [
          {
            type: 'first_frame',
            url: imageUrl
          }
        ]
        if (request.prompt) {
          body.input.prompt = request.prompt
        }
      } else if (request.prompt) {
        // 文生视频
        body.input.prompt = request.prompt
        if (request.negativePrompt) {
          body.input.negative_prompt = request.negativePrompt
        }
      } else {
        return { success: false, error: '请提供图片或提示词' }
      }

      // 添加参数
      if (request.duration) {
        body.parameters.duration = request.duration
      }

      // 添加分辨率
      if (request.resolution) {
        body.parameters.resolution = request.resolution
      }

      // 添加种子
      if (request.seed !== undefined) {
        body.parameters.seed = request.seed
      }

      console.log(`[${this.id}] 发送视频生成请求:`, { url, model: request.model, hasImage: !!imageUrl })
      console.log(`[${this.id}] 请求体:`, JSON.stringify(body, null, 2))

      // 视频生成 API 必须添加异步请求头
      // 同时如果使用临时上传的文件，添加 OSS Resolve 请求头
      const extraHeaders: Record<string, string> = {
        'X-DashScope-Async': 'enable'  // 视频生成是异步的，必须添加此请求头
      }
      if (needsOssResolve) {
        extraHeaders['X-DashScope-OssResourceResolve'] = 'enable'
        console.log(`[${this.id}] 添加 X-DashScope-OssResourceResolve 请求头`)
      }
      console.log(`[${this.id}] 添加 X-DashScope-Async: enable 请求头（视频生成必须）`)

      // 打印完整的请求信息用于调试
      const allHeaders = { ...this.buildHeaders(), ...extraHeaders }
      console.log(`[${this.id}] 完整请求头:`, JSON.stringify(allHeaders, null, 2))
      console.log(`[${this.id}] 图片 URL:`, imageUrl)

      const response = await this.sendRequest<BailianVideoResponse>(url, 'POST', body, extraHeaders)

      // 打印完整响应用于调试
      console.log(`[${this.id}] API 响应:`, JSON.stringify(response, null, 2))

      // 检查错误
      if (response.code) {
        return { success: false, error: response.message || `错误代码: ${response.code}` }
      }

      // 检查任务 ID（异步模式）
      // 注意：任务 ID 在 output.task_id 中
      if (response.output?.task_id) {
        console.log(`[${this.id}] 视频生成任务已创建，任务 ID:`, response.output.task_id)
        return { success: true, taskId: response.output.task_id }
      }

      // 检查直接返回的视频（同步模式）
      if (response.output?.video_url) {
        return {
          success: true,
          video: {
            url: response.output.video_url,
            duration: response.output.duration,
            width: response.output.width,
            height: response.output.height
          }
        }
      }

      return { success: false, error: '未获取到生成结果' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { success: false, error: `视频生成失败: ${errorMessage}` }
    }
  }

  /**
   * 查询异步任务状态
   *
   * @param taskId - 任务 ID
   * @returns 任务状态
   */
  async getTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    try {
      // 任务状态查询接口：GET /api/v1/tasks/{task_id}
      const videoApiBaseUrl = this.getUploadBaseUrl()
      const url = `${videoApiBaseUrl}/tasks/${taskId}`
      console.log(`[${this.id}] 查询任务状态 URL:`, url)
      const response = await this.sendRequest<BailianTaskResponse>(url, 'GET')

      // 打印完整响应用于调试
      console.log(`[${this.id}] 任务状态响应:`, JSON.stringify(response, null, 2))

      const output = response.output
      if (!output) {
        return { taskId, status: 'failed', error: '响应格式错误：缺少 output 字段' }
      }

      const result: VideoTaskStatus = {
        taskId,
        status: this.mapStatus(output.task_status)
      }

      if (output.task_status === 'SUCCEEDED' && output.video_url) {
        result.video = {
          url: output.video_url,
          duration: response.usage?.output_video_duration
        }
        console.log(`[${this.id}] 视频生成成功，URL:`, output.video_url)
      } else if (output.task_status === 'FAILED') {
        result.error = output.message || '视频生成失败'
        console.log(`[${this.id}] 视频生成失败:`, output.message)
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return { taskId, status: 'failed', error: errorMessage }
    }
  }

  /**
   * 测试连接
   */
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
   * 构建请求头
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    }
  }

  /**
   * 映射任务状态
   */
  private mapStatus(status: string): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (status) {
      case 'PENDING':
        return 'pending'
      case 'RUNNING':
        return 'processing'
      case 'SUCCEEDED':
        return 'completed'
      case 'FAILED':
        return 'failed'
      default:
        return 'pending'
    }
  }
}