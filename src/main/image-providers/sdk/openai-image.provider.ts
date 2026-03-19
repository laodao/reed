/**
 * OpenAI DALL-E 图像 Provider
 * @module image-providers/sdk/openai-image-provider
 * @description 使用 OpenAI SDK 实现 DALL-E 图像生成
 */

import OpenAI from 'openai'
import type {
  ImageProviderConfig,
  ImageModel,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageTaskStatus,
  GeneratedImage
} from '../../../shared/types/image-provider.types'
import { BaseImageProvider } from '../base-image-provider'

/**
 * OpenAI DALL-E 图像 Provider
 *
 * 使用 OpenAI SDK 实现 DALL-E 图像生成。
 * 支持同步返回图像 URL。
 *
 * @see https://platform.openai.com/docs/api-reference/images
 */
export class OpenAIImageProvider extends BaseImageProvider {
  /**
   * OpenAI SDK 客户端
   */
  private client: OpenAI

  /**
   * 支持的模型配置
   */
  private static MODELS: ImageModel[] = [
    {
      id: 'dall-e-3',
      name: 'DALL-E 3',
      providerId: 'openai',
      providerName: 'OpenAI',
      features: {
        textToImage: true,
        imageToImage: false,
        imageEdit: true,
        maxResolution: '1792x1792',
        supportedSizes: ['1024x1024', '1792x1024', '1024x1792']
      }
    },
    {
      id: 'dall-e-2',
      name: 'DALL-E 2',
      providerId: 'openai',
      providerName: 'OpenAI',
      features: {
        textToImage: true,
        imageToImage: true,
        imageEdit: true,
        maxResolution: '1024x1024',
        supportedSizes: ['256x256', '512x512', '1024x1024']
      }
    }
  ]

  /**
   * 构造函数
   */
  constructor(config: ImageProviderConfig) {
    super(config)

    // 初始化 OpenAI SDK 客户端
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://api.openai.com/v1'
    })
  }

  /**
   * Provider 唯一标识
   */
  get id(): string {
    return 'openai'
  }

  /**
   * Provider 显示名称
   */
  get name(): string {
    return 'OpenAI DALL-E'
  }

  /**
   * 获取支持的模型列表
   */
  async getModels(): Promise<ImageModel[]> {
    return OpenAIImageProvider.MODELS
  }

  /**
   * 生成图像
   *
   * 使用 OpenAI SDK 调用 DALL-E API。
   * OpenAI 图像生成是同步的，直接返回图像 URL。
   *
   * @param request - 图像生成请求
   * @returns 生成响应，包含图像列表
   */
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    try {
      // 构建尺寸字符串
      const size = `${request.width}x${request.height}` as '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792'

      // 调用 OpenAI SDK
      const response = await this.client.images.generate({
        model: request.model || 'dall-e-3',
        prompt: request.prompt,
        size,
        n: request.count || 1,
        quality: request.quality as 'standard' | 'hd',
        response_format: 'url'
      })

      // 提取图像 URL
      const images: GeneratedImage[] = response.data.map((img) => ({
        url: img.url
      }))

      return {
        success: true,
        images
      }
    } catch (error) {
      const errorMessage = this.formatError(error)
      return {
        success: false,
        error: `图像生成失败: ${errorMessage}`
      }
    }
  }

  /**
   * 查询异步任务状态
   *
   * OpenAI DALL-E 是同步 API，此方法直接返回错误。
   *
   * @param taskId - 任务 ID
   * @returns 任务状态信息
   */
  async getTaskStatus(taskId: string): Promise<ImageTaskStatus> {
    // OpenAI DALL-E 是同步 API，不支持任务状态查询
    return {
      taskId,
      status: 'failed',
      error: 'OpenAI DALL-E 不支持异步任务状态查询'
    }
  }

  /**
   * 测试 Provider 连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // 尝试获取模型列表
      const models = await this.getModels()
      return {
        success: true,
        message: `连接成功，支持 ${models.length} 个模型`
      }
    } catch (error) {
      const errorMessage = this.formatError(error)
      return {
        success: false,
        message: `连接失败: ${errorMessage}`
      }
    }
  }

  /**
   * 构建请求头（SDK 不需要手动构建）
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json'
    }
  }

  /**
   * 构建 API URL（SDK 不需要手动构建）
   */
  protected buildUrl(endpoint: string): string {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1'
    return `${baseUrl}${endpoint}`
  }

  /**
   * 格式化错误信息
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      // OpenAI SDK 错误格式
      const openaiError = error as any
      if (openaiError.error?.message) {
        return openaiError.error.message
      }
      if (openaiError.status) {
        return `API 错误 (${openaiError.status}): ${error.message}`
      }
      return error.message
    }
    return '未知错误'
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
      supportsImageToImage: true,
      supportsImageEdit: true
    }
  }
}
