/**
 * 视频生成 Provider 基类
 * @module platform/providers/video/base-video-provider
 * @description 所有视频生成 Provider 的抽象基类，定义统一的接口规范
 */

import type {
  VideoProviderConfig,
  VideoModel,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoTaskStatus
} from '@shared/types/video-provider.types'

/**
 * 视频生成 Provider 抽象基类
 *
 * 所有视频生成 Provider 必须继承此类并实现所有抽象方法。
 * 该基类定义了视频生成 Provider 的核心接口：
 * - 身份标识（id, name）
 * - 模型管理（getModels）
 * - 视频生成（generateVideo）
 * - 任务状态查询（getTaskStatus）
 * - 连接测试（testConnection）
 */
export abstract class BaseVideoProvider {
  /**
   * Provider 配置
   */
  protected config: VideoProviderConfig

  /**
   * 构造函数
   * @param config - Provider 配置
   */
  constructor(config: VideoProviderConfig) {
    this.config = config
  }

  // ==================== 核心属性 ====================

  /**
   * Provider 唯一标识
   * 例如: 'volcengine', 'runway', 'pika', 'kling'
   */
  abstract get id(): string

  /**
   * Provider 显示名称
   * 例如: '火山引擎', 'Runway', 'Pika', '可灵'
   */
  abstract get name(): string

  // ==================== 核心方法 ====================

  /**
   * 获取该 Provider 支持的模型列表
   * @returns 模型列表
   */
  abstract getModels(): Promise<VideoModel[]>

  /**
   * 生成视频
   *
   * 该方法发起视频生成请求，返回任务 ID 或直接返回生成的视频。
   * 对于异步 API，返回 taskId；对于同步 API，直接返回 video。
   *
   * @param request - 视频生成请求参数
   * @returns 生成响应，包含任务 ID 或视频
   */
  abstract generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse>

  /**
   * 查询异步任务状态
   *
   * 用于异步视频生成 API，查询任务执行状态和结果。
   * 如果 Provider 只支持同步 API，可以返回 'not-supported' 错误。
   *
   * @param taskId - 任务 ID
   * @returns 任务状态信息
   */
  abstract getTaskStatus(taskId: string): Promise<VideoTaskStatus>

  /**
   * 测试 Provider 连接
   *
   * 验证配置是否正确，API 是否可用。
   * 通常通过调用一个轻量级 API 来验证。
   *
   * @returns 测试结果，包含成功状态和消息
   */
  abstract testConnection(): Promise<{ success: boolean; message: string }>

  // ==================== 工具方法 ====================

  /**
   * 构建请求头
   *
   * 各 Provider 需要根据自己的认证方式构建请求头。
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
  protected buildUrl(endpoint: string): string {
    const baseUrl = this.config.baseUrl || this.getDefaultBaseUrl()
    return `${baseUrl}${endpoint}`
  }

  /**
   * 获取默认 API URL
   */
  protected abstract getDefaultBaseUrl(): string

  // ==================== 辅助方法 ====================

  /**
   * 更新配置
   * @param config - 新配置
   */
  updateConfig(config: VideoProviderConfig): void {
    this.config = config
  }

  /**
   * 获取当前配置
   * @returns 当前配置（不包含敏感信息）
   */
  getConfig(): Partial<VideoProviderConfig> {
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
   *
   * @returns 功能特性描述
   */
  getFeatures(): {
    supportsAsyncTask: boolean
    supportsCancel: boolean
    supportsImageToVideo: boolean
    supportsTextToVideo: boolean
  } {
    return {
      supportsAsyncTask: true,
      supportsCancel: false,
      supportsImageToVideo: true,
      supportsTextToVideo: true
    }
  }

  /**
   * 发送 HTTP 请求
   */
  protected async sendRequest<T>(
    url: string,
    method: string,
    body?: Record<string, any>,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const headers = { ...this.buildHeaders(), ...extraHeaders }

    if (!this.config.apiKey) {
      throw new Error('未配置 API Key')
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })

    const responseText = await response.text()
    console.log(`[${this.id}] 响应状态:`, response.status)

    if (!response.ok) {
      console.error(`[${this.id}] 错误响应:`, responseText)
      let errorMessage = `HTTP ${response.status}`

      try {
        const errorJson = JSON.parse(responseText)
        errorMessage = errorJson.error?.message || errorJson.message || errorJson.error?.code || errorMessage
      } catch {
        if (responseText) {
          errorMessage = responseText
        }
      }

      throw new Error(errorMessage)
    }

    return JSON.parse(responseText)
  }
}