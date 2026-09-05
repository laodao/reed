/**
 * OpenAI DALL-E 图像 Provider
 * @module platform/providers/image/sdk/openai-image-provider
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
} from '@shared/types/image-provider.types'
import { BaseImageProvider, collectReferences } from '../base-image-provider'

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
   * 构造函数
   */
  constructor(config: ImageProviderConfig) {
    super(config)

    // OpenAI SDK 期望 baseURL 是 base path（如 /v1），它自己拼接 /images/generations
    // 等子路径。模板/用户偶尔会把完整 endpoint 当作 baseUrl 配置（如 .../images/generations），
    // 这里统一剥除已知子路径后缀，避免拼出 .../images/generations/images/generations。
    const rawBase = config.baseUrl || 'https://api.openai.com/v1'
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: OpenAIImageProvider.normalizeBaseUrl(rawBase)
    })
  }

  private static normalizeBaseUrl(url: string): string {
    if (!url) return url
    let s = url.trim().replace(/\/+$/, '')
    const stripSuffixes = [
      '/images/generations',
      '/images/edits',
      '/images/variations',
      '/chat/completions',
      '/completions',
      '/embeddings',
    ]
    for (const suffix of stripSuffixes) {
      if (s.toLowerCase().endsWith(suffix)) {
        s = s.slice(0, s.length - suffix.length)
        break
      }
    }
    return s.replace(/\/+$/, '')
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
   * OpenAI 没有专门的图像模型列表 API，需要手动配置模型
   */
  async getModels(): Promise<ImageModel[]> {
    // 返回空数组，模型需要从配置或模板中获取
    return []
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
      // 检查是否指定了模型
      if (!request.model) {
        return {
          success: false,
          error: '未指定模型，请在配置中选择一个模型'
        }
      }

      // 构建尺寸字符串
      const size = `${request.width}x${request.height}` as '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792'

      // spec 2026-05-09 ep-redesign §3.2 D1 · P-9：多参考图适配
      // OpenAI DALL-E 系列（dall-e-2 / dall-e-3）走 images.generate 不接受 reference image。
      // gpt-image-1 支持多 ref 但需走 images.edit endpoint（API 形态完全不同）。
      // 当前 provider 仅适配 generations 路径；transparently 警告用户参考图被忽略。
      // future: 如果用户用 gpt-image-1，应根据 model 切换到 images.edit 路径并以 reference 作 base。
      const refs = collectReferences(request)
      if (refs.length > 0) {
        console.warn(
          `[OpenAI] 参考图（${refs.length} 张）将被忽略 — DALL-E generations API 不接受 reference image。` +
          ` 如需多 ref 请使用支持的 provider（DashScope / Bailian / Volcengine Seedream）`
        )
      }

      // 调用 OpenAI SDK
      const response = await this.client.images.generate({
        model: request.model,
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
    const baseUrl = OpenAIImageProvider.normalizeBaseUrl(
      this.config.baseUrl || 'https://api.openai.com/v1'
    )
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
