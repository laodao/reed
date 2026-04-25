/**
 * 火山引擎图像生成 Provider
 * @module image-providers/sdk/volcengine-image-provider
 * @description 使用 OpenAI 兼容 API 实现火山引擎图像生成
 */

import type {
  ImageModel,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageTaskStatus,
  GeneratedImage
} from '@shared/types/image-provider.types'
import { BaseImageProvider } from '../base-image-provider'

/**
 * 火山引擎图像生成响应格式
 * 火山引擎API返回的格式可能包含 data 数组或 output 字段
 */
interface VolcengineImageResponse {
  created?: number
  data?: Array<{
    url?: string
    b64_json?: string
  }>
  // 火山引擎可能使用的格式
  output?: {
    data?: Array<{
      url?: string
      b64_json?: string
    }>
  }
  error?: {
    message: string
    type: string
    code: string
  }
  // 兼容其他可能的错误格式
  message?: string
  code?: string
}

/**
 * 火山引擎图像生成 Provider
 *
 * 使用火山引擎方舟平台的图像生成 API（OpenAI 兼容格式）。
 *
 * @see https://www.volcengine.com/docs/82379/1298454
 */
export class VolcengineImageProvider extends BaseImageProvider {
  /**
   * 默认 API URL
   */
  private static DEFAULT_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

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
   * 获取 API URL
   */
  private getApiUrl(): string {
    return this.config.baseUrl || VolcengineImageProvider.DEFAULT_API_URL
  }

  /**
   * 获取支持的模型列表
   * 火山引擎的模型从配置中获取，这里返回空列表
   */
  async getModels(): Promise<ImageModel[]> {
    // 模型从用户配置中获取，这里返回空
    return []
  }

  /**
   * 生成图像
   *
   * @param request - 图像生成请求
   * @returns 生成响应，包含图像列表
   */
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    try {
      // 检查是否指定了模型
      if (!request.model) {
        return {
          success: false,
          error: '未指定模型，请在配置中选择一个模型'
        }
      }

      const url = this.getApiUrl()

      // 构建请求体（OpenAI 兼容格式）
      const body: Record<string, any> = {
        model: request.model,
        prompt: request.prompt,
        n: request.count || 1,
        size: `${request.width}x${request.height}`,
        response_format: 'url'
      }

      // 添加负面提示词
      if (request.negativePrompt) {
        body.negative_prompt = request.negativePrompt
      }

      // 添加风格
      if (request.style) {
        body.style = request.style
      }

      console.log('[Volcengine] 发送图像生成请求:', { url, model: request.model, size: body.size })

      // 发送请求
      const response = await this.sendRequest<VolcengineImageResponse>(url, 'POST', body)

      // 打印完整响应用于调试
      console.log('[Volcengine] 完整响应:', JSON.stringify(response, null, 2))

      // 检查错误（支持多种错误格式）
      if (response.error) {
        return {
          success: false,
          error: response.error.message || '图像生成失败'
        }
      }
      if (response.code && response.code !== '200' && response.code !== 'Success') {
        return {
          success: false,
          error: response.message || '图像生成失败'
        }
      }

      // 提取图像（支持多种响应格式）
      const images: GeneratedImage[] = []

      // 格式1: OpenAI格式 - response.data
      if (response.data && response.data.length > 0) {
        for (const item of response.data) {
          if (item.url) {
            images.push({ url: item.url })
          } else if (item.b64_json) {
            images.push({ url: `data:image/png;base64,${item.b64_json}` })
          }
        }
      }

      // 格式2: 火山引擎格式 - response.output.data
      if (images.length === 0 && response.output?.data && response.output.data.length > 0) {
        for (const item of response.output.data) {
          if (item.url) {
            images.push({ url: item.url })
          } else if (item.b64_json) {
            images.push({ url: `data:image/png;base64,${item.b64_json}` })
          }
        }
      }

      if (images.length > 0) {
        console.log('[Volcengine] 成功获取图像数量:', images.length)
        return {
          success: true,
          images
        }
      }

      console.log('[Volcengine] 未找到图像数据')
      return {
        success: false,
        error: '未获取到生成结果'
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
   * 查询异步任务状态
   *
   * 火山引擎图像生成是同步 API，此方法直接返回错误。
   *
   * @param taskId - 任务 ID
   * @returns 任务状态信息
   */
  async getTaskStatus(taskId: string): Promise<ImageTaskStatus> {
    // 火山引擎图像生成是同步 API
    return {
      taskId,
      status: 'failed',
      error: '火山引擎图像生成不支持异步任务状态查询'
    }
  }

  /**
   * 测试 Provider 连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // 尝试简单请求验证 API Key
      return {
        success: true,
        message: '连接成功'
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

  /**
   * 发送 API 请求
   */
  private async sendRequest<T>(
    url: string,
    method: string,
    body?: Record<string, any>
  ): Promise<T> {
    const headers = this.buildHeaders()

    if (!this.config.apiKey) {
      throw new Error('未配置 API Key')
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })

    const responseText = await response.text()
    console.log('[Volcengine] 响应状态:', response.status)

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`

      try {
        const errorJson = JSON.parse(responseText)
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage
      } catch {
        if (responseText) {
          errorMessage = responseText
        }
      }

      throw new Error(errorMessage)
    }

    return JSON.parse(responseText)
  }

  /**
   * 获取 Provider 支持的功能特性
   */
  getFeatures(): {
    supportsAsyncTask: boolean
    supportsCancel: boolean
    supportsImageToImage: boolean
    supportsImageEdit: boolean
  } {
    return {
      supportsAsyncTask: false,
      supportsCancel: false,
      supportsImageToImage: false,
      supportsImageEdit: false
    }
  }
}