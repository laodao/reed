/**
 * 图像生成 Provider 基类
 * @module image-providers/base-image-provider
 * @description 所有图像生成 Provider 的抽象基类，定义统一的接口规范
 */

import type {
  ImageProviderConfig,
  ImageModel,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageTaskStatus
} from '../../../shared/types/image-provider.types'

/**
 * 图像生成 Provider 抽象基类
 *
 * 所有图像生成 Provider 必须继承此类并实现所有抽象方法。
 * 该基类定义了图像生成 Provider 的核心接口：
 * - 身份标识（id, name）
 * - 模型管理（getModels）
 * - 图像生成（generateImage）
 * - 任务状态查询（getTaskStatus）
 * - 连接测试（testConnection）
 */
export abstract class BaseImageProvider {
  /**
   * Provider 配置
   */
  protected config: ImageProviderConfig

  /**
   * 构造函数
   * @param config - Provider 配置
   */
  constructor(config: ImageProviderConfig) {
    this.config = config
  }

  // ==================== 核心属性 ====================

  /**
   * Provider 唯一标识
   * 例如: 'bailian', 'volcengine', 'minimax', 'zhipu'
   */
  abstract get id(): string

  /**
   * Provider 显示名称
   * 例如: '百炼平台', '火山引擎', 'Minimax', '智谱 AI'
   */
  abstract get name(): string

  // ==================== 核心方法 ====================

  /**
   * 获取该 Provider 支持的模型列表
   * @returns 模型列表
   */
  abstract getModels(): Promise<ImageModel[]>

  /**
   * 生成图像
   *
   * 该方法发起图像生成请求，返回任务 ID 或直接返回生成的图像。
   * 对于异步 API（如百炼），返回 taskId；对于同步 API，直接返回 images。
   *
   * @param request - 图像生成请求参数
   * @returns 生成响应，包含任务 ID 或图像列表
   */
  abstract generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>

  /**
   * 查询异步任务状态
   *
   * 用于异步图像生成 API，查询任务执行状态和结果。
   * 如果 Provider 只支持同步 API，可以抛出 'not-supported' 错误。
   *
   * @param taskId - 任务 ID
   * @returns 任务状态信息
   */
  abstract getTaskStatus(taskId: string): Promise<ImageTaskStatus>

  /**
   * 测试 Provider 连接
   *
   * 验证配置是否正确，API 是否可用。
   * 通常通过调用一个轻量级 API（如获取模型列表）来验证。
   *
   * @returns 测试结果，包含成功状态和消息
   */
  abstract testConnection(): Promise<{ success: boolean; message: string }>

  // ==================== 工具方法 ====================

  /**
   * 构建请求头
   *
   * 各 Provider 需要根据自己的认证方式构建请求头。
   * 例如：百炼使用阿里云 API 签名，Minimax 使用 Bearer Token。
   *
   * @returns 请求头对象
   */
  protected abstract buildHeaders(): Record<string, string>

  /**
   * 构建 API URL
   *
   * @param endpoint - API 端点路径
   * @returns 完整的 API URL
   */
  protected abstract buildUrl(endpoint: string): string

  // ==================== 辅助方法 ====================

  /**
   * 更新配置
   * @param config - 新配置
   */
  updateConfig(config: ImageProviderConfig): void {
    this.config = config
  }

  /**
   * 获取当前配置
   * @returns 当前配置（不包含敏感信息）
   */
  getConfig(): Partial<ImageProviderConfig> {
    const { id, baseUrl, customHeaders, customParams } = this.config
    return { id, baseUrl, customHeaders, customParams }
  }

  /**
   * 检查 Provider 是否已配置
   * 默认检查 API Key 是否存在
   * @returns 是否已配置
   */
  isConfigured(): boolean {
    return !!this.config.apiKey
  }

  /**
   * 停止当前生成任务
   *
   * 如果 Provider 支持取消任务，子类应重写此方法。
   * 默认返回 false 表示不支持取消。
   *
   * @param taskId - 任务 ID
   * @returns 是否成功取消
   */
  async cancelTask(_taskId: string): Promise<boolean> {
    return false
  }

  /**
   * 获取 Provider 支持的功能特性
   *
   * 子类可以重写此方法返回特定功能支持。
   * 默认返回基本功能支持。
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
      supportsImageToImage: false,
      supportsImageEdit: false
    }
  }
}