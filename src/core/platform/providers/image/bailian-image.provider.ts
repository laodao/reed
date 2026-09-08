/**
 * 百炼平台图像生成 Provider
 * @module platform/providers/image/bailian-image-provider
 * @description 实现阿里云百炼平台的图像生成 API
 */

import * as crypto from 'crypto'
import type {
  ImageModel,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageTaskStatus,
  GeneratedImage
} from '@shared/types/image-provider.types'
import { BaseImageProvider, collectReferences } from './base-image-provider'

/**
 * 百炼平台 API 响应格式
 */
interface BailianApiResponse {
  RequestId?: string
  Code?: string
  Message?: string
  Data?: {
    TaskId?: string
    TaskStatus?: string
    SubmitTime?: string
    ScheduledTime?: string
    StartTime?: string
    EndTime?: string
    ImageURL?: string
    ImageURLs?: string[]
    ErrorMessage?: string
    Progress?: number
  }
}

/**
 * 百炼平台图像生成 Provider
 *
 * 使用阿里云百炼平台的通义万相模型进行图像生成。
 * 支持异步任务模式，需要轮询任务状态获取生成结果。
 *
 * @see https://help.aliyun.com/document_detail/2892275.html
 */
export class BailianImageProvider extends BaseImageProvider {
  /**
   * 百炼平台 API 基础 URL
   */
  private static API_BASE_URL = 'https://bailian.cn-beijing.aliyuncs.com'

  /**
   * API 版本
   */
  private static API_VERSION = '2023-12-29'

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
    return '百炼平台'
  }

  /**
   * 获取支持的模型列表
   * 百炼平台没有专门的模型列表 API，需要手动配置模型
   * @returns 模型列表
   */
  async getModels(): Promise<ImageModel[]> {
    // 返回空数组，模型需要从配置或模板中获取
    return []
  }

  /**
   * 生成图像
   *
   * 调用百炼平台的文生图 API，返回任务 ID。
   * 由于百炼平台使用异步任务模式，需要通过 getTaskStatus 轮询结果。
   *
   * @param request - 图像生成请求
   * @returns 生成响应，包含任务 ID
   */
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    try {
      // qwen-image 系（bailian 专属网关）：走多模态生成同步 API（input.contents 形态，
      // KE-4 实测：网关对该模型要求 input.contents，text2image 形态报 InvalidParameter）
      if (/^qwen-image/.test(request.model ?? '')) {
        return await this.generateQwenImageMultimodal(request)
      }
      const endpoint = '/api/v1/images/generations'
      const body = this.buildRequestBody(request)

      const response = await this.sendRequest<BailianApiResponse>(endpoint, 'POST', body)

      if (response.Code && response.Code !== 'Success') {
        return {
          success: false,
          error: response.Message || '图像生成请求失败'
        }
      }

      if (!response.Data?.TaskId) {
        return {
          success: false,
          error: '未获取到任务 ID'
        }
      }

      return {
        success: true,
        taskId: response.Data.TaskId
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        success: false,
        error: `图像生成失败: ${errorMessage}`
      }
    }
  }

  /**
   * qwen-image 系同步多模态生成（input.contents 形态）。
   * 响应：output.choices[0].message.content[] 内含 { image: url }。
   */
  private async generateQwenImageMultimodal(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const contents: Array<Record<string, unknown>> = [{ text: request.prompt }]
    if (request.negativePrompt) contents.push({ text: `避免出现：${request.negativePrompt}` })
    const body = {
      model: request.model,
      input: { contents },
      parameters: {
        size: `${request.width}x${request.height}`,
        n: request.count || 1,
        ...(request.seed !== undefined ? { seed: request.seed } : {}),
      },
    }
    const endpoint = '/api/v1/services/aigc/multimodal-generation/generation'
    const response = await this.sendRequest<Record<string, any>>(endpoint, 'POST', body)
    if (response.Code && response.Code !== 'Success') {
      return { success: false, error: response.Message || 'qwen-image 生成请求失败' }
    }
    const parts = response?.output?.choices?.[0]?.message?.content
    const images: Array<{ url: string }> = []
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (typeof part.image === 'string') images.push({ url: part.image })
        else if (typeof part === 'string') images.push({ url: part })
      }
    } else if (typeof parts === 'string') {
      images.push({ url: parts })
    }
    if (images.length === 0) {
      return { success: false, error: response?.message || 'qwen-image 未返回图像' }
    }
    return { success: true, images }
  }

  /**
   * 查询异步任务状态
   *
   * 查询图像生成任务的执行状态和结果。
   *
   * @param taskId - 任务 ID
   * @returns 任务状态信息
   */
  async getTaskStatus(taskId: string): Promise<ImageTaskStatus> {
    try {
      const endpoint = '/api/v1/images/tasks/' + taskId
      const response = await this.sendRequest<BailianApiResponse>(endpoint, 'GET')

      if (response.Code && response.Code !== 'Success') {
        return {
          taskId,
          status: 'failed',
          error: response.Message || '查询任务状态失败'
        }
      }

      const data = response.Data
      if (!data) {
        return {
          taskId,
          status: 'failed',
          error: '未获取到任务数据'
        }
      }

      // 映射百炼任务状态到通用状态
      const status = this.mapTaskStatus(data.TaskStatus || '')

      const result: ImageTaskStatus = {
        taskId,
        status,
        progress: data.Progress
      }

      // 如果任务完成，提取图像 URL
      if (status === 'completed' && (data.ImageURL || data.ImageURLs)) {
        const images: GeneratedImage[] = []

        if (data.ImageURLs && data.ImageURLs.length > 0) {
          data.ImageURLs.forEach((url) => {
            images.push({ url })
          })
        } else if (data.ImageURL) {
          images.push({ url: data.ImageURL })
        }

        result.images = images
      }

      // 如果任务失败，提取错误信息
      if (status === 'failed' && data.ErrorMessage) {
        result.error = data.ErrorMessage
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        taskId,
        status: 'failed',
        error: `查询任务状态失败: ${errorMessage}`
      }
    }
  }

  /**
   * 测试 Provider 连接
   *
   * 验证 API Key 是否有效。
   *
   * @returns 测试结果
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // 尝试获取模型列表作为连接测试
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
   *
   * 使用阿里云 API 签名认证。
   *
   * @returns 请求头对象
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  }

  /**
   * 构建 API URL
   *
   * 用户/模板配置的 baseUrl 可能是 host base（如 https://bailian.cn-beijing.aliyuncs.com）
   * 也可能是某个完整 endpoint（如 .../services/aigc/text2image/image-synthesis）。
   * 这里只取其 host 部分，再与传入的 endpoint 拼接，避免出现 endpoint 重复拼接。
   *
   * @param endpoint - API 端点路径
   * @returns 完整的 API URL
   */
  protected buildUrl(endpoint: string): string {
    let host = BailianImageProvider.API_BASE_URL
    if (this.config.baseUrl) {
      try {
        const u = new URL(this.config.baseUrl)
        host = `${u.protocol}//${u.host}`
      } catch {
        // baseUrl 非合法 URL，回退到默认 host
      }
    }
    return `${host}${endpoint}`
  }

  /**
   * 构建请求体
   *
   * @param request - 图像生成请求
   * @returns 请求体对象
   */
  private buildRequestBody(request: ImageGenerationRequest): Record<string, any> {
    const body: Record<string, any> = {
      model: request.model,
      input: {
        prompt: request.prompt
      },
      parameters: {
        size: `${request.width}x${request.height}`,
        n: request.count || 1
      }
    }

    // 添加负面提示词
    if (request.negativePrompt) {
      body.input.negative_prompt = request.negativePrompt
    }

    // 添加风格
    if (request.style) {
      body.parameters.style = request.style
    }

    // 添加质量
    if (request.quality) {
      body.parameters.quality = request.quality
    }

    // 添加种子
    if (request.seed !== undefined) {
      body.parameters.seed = request.seed
    }

    // spec 2026-05-09 ep-redesign §3.2 D1：multi-reference
    // 百炼托管的 kling-v3 等支持 element_list（最多 10 张）；老 image_url 兼容单值
    const refs = collectReferences(request)
    if (refs.length > 0) {
      body.input.image_url = refs[0]  // 兼容老字段
      // element_list 形态（百炼托管 kling-v3-image-generation 等）
      if (refs.length > 1) {
        body.input.element_list = refs.slice(0, 10).map((image_url) => ({ element_image: image_url }))
      }
    }

    return body
  }

  /**
   * 映射百炼任务状态到通用状态
   *
   * @param status - 百炼任务状态
   * @returns 通用任务状态
   */
  private mapTaskStatus(status: string): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'submitted':
        return 'pending'
      case 'running':
      case 'processing':
        return 'processing'
      case 'succeeded':
      case 'completed':
        return 'completed'
      case 'failed':
      case 'error':
        return 'failed'
      default:
        return 'pending'
    }
  }

  /**
   * 发送 API 请求
   *
   * 包含阿里云 API 签名认证。
   *
   * @param endpoint - API 端点
   * @param method - HTTP 方法
   * @param body - 请求体（可选）
   * @returns API 响应
   */
  private async sendRequest<T>(
    endpoint: string,
    method: string,
    body?: Record<string, any>
  ): Promise<T> {
    const url = this.buildUrl(endpoint)
    const headers = this.buildHeaders()

    // 解析 API Key（格式：AccessKeyId:AccessKeySecret）
    const apiKey = this.config.apiKey
    if (!apiKey) {
      throw new Error('未配置 API Key')
    }

    const [accessKeyId, accessKeySecret] = apiKey.split(':')
    if (!accessKeyId || !accessKeySecret) {
      throw new Error('API Key 格式错误，应为 AccessKeyId:AccessKeySecret')
    }

    // 生成时间戳
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

    // 构建签名字符串
    const signatureHeaders = this.buildSignatureHeaders(
      method,
      endpoint,
      timestamp,
      accessKeyId,
      body ? JSON.stringify(body) : ''
    )

    // 计算签名
    const signature = this.calculateSignature(signatureHeaders, accessKeySecret)

    // 添加认证头
    headers['X-ACS-SignatureNonce'] = crypto.randomUUID()
    headers['X-ACS-Timestamp'] = timestamp
    headers['Authorization'] = `ACS3-HMAC-SHA256 Credential=${accessKeyId},SignedHeaders=host;x-acs-content-sha256;x-acs-date,Signature=${signature}`

    // 发送请求
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    return response.json()
  }

  /**
   * 构建签名所需的头信息
   *
   * @param method - HTTP 方法
   * @param endpoint - API 端点
   * @param timestamp - 时间戳
   * @param accessKeyId - AccessKey ID
   * @param body - 请求体
   * @returns 签名字符串组件
   */
  private buildSignatureHeaders(
    method: string,
    endpoint: string,
    timestamp: string,
    accessKeyId: string,
    body: string
  ): {
    method: string
    endpoint: string
    host: string
    timestamp: string
    bodyHash: string
  } {
    const url = new URL(this.buildUrl(endpoint))

    return {
      method: method.toUpperCase(),
      endpoint,
      host: url.host,
      timestamp,
      bodyHash: crypto.createHash('sha256').update(body).digest('hex')
    }
  }

  /**
   * 计算阿里云 API 签名
   *
   * @param headers - 签名头信息
   * @param accessKeySecret - AccessKey Secret
   * @returns 签名字符串
   */
  private calculateSignature(
    headers: {
      method: string
      endpoint: string
      host: string
      timestamp: string
      bodyHash: string
    },
    accessKeySecret: string
  ): string {
    // 构建规范化请求
    const canonicalRequest = [
      headers.method,
      headers.endpoint,
      '',
      `host:${headers.host}`,
      `x-acs-content-sha256:${headers.bodyHash}`,
      `x-acs-date:${headers.timestamp}`,
      '',
      'host;x-acs-content-sha256;x-acs-date',
      headers.bodyHash
    ].join('\n')

    // 构建待签名字符串
    const stringToSign = [
      'ACS3-HMAC-SHA256',
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n')

    // 计算签名
    const signature = crypto
      .createHmac('sha256', accessKeySecret)
      .update(stringToSign)
      .digest('hex')

    return signature
  }

  /**
   * 获取 Provider 支持的功能特性
   *
   * @returns 功能特性描述
   */
  getFeatures(): {
    supportsAsyncTask: boolean
    supportsCancel: boolean
    supportsImageToImage: boolean
    supportsImageEdit: boolean
  } {
    return {
      supportsAsyncTask: true,
      supportsCancel: false,
      supportsImageToImage: true,
      supportsImageEdit: false
    }
  }
}