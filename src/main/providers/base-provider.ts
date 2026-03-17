/**
 * AI Provider 基类
 * @module providers/base-provider
 * @description 所有 AI 提供商的基类，定义统一接口
 */

import type { ChatContext, ChatCompletionResponse } from '../../shared/types'

/**
 * Provider 配置
 */
export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
}

/**
 * Provider 基类
 * 所有 AI 提供商必须继承此类并实现其方法
 */
export abstract class BaseProvider {
  protected config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  /**
   * 获取提供商标识
   * @returns string
   */
  abstract get id(): string

  /**
   * 获取提供商名称
   * @returns string
   */
  abstract get name(): string

  /**
   * 获取支持的模型列表
   * @returns Promise<Model[]>
   */
  abstract getModels(): Promise<Array<{
    id: string
    name: string
    maxTokens: number
    contextWindow: number
  }>>

  /**
   * 流式聊天
   * @param context - 对话上下文
   * @param onDelta - 增量回调
   * @param signal - 中断信号（可选）
   * @returns Promise<string> - 完整响应
   * @description 流式调用 AI 接口
   * 逻辑：
   * 1. 构建 API 请求（stream: true）
   * 2. 发送请求
   * 3. 解析 SSE 响应
   * 4. 每收到 token 调用 onDelta
   * 5. 检查 signal 是否中断
   * 6. 返回完整响应
   */
  abstract async chat(
    context: ChatContext,
    onDelta: (content: string) => void,
    signal?: AbortSignal
  ): Promise<string>

  /**
   * 非流式聊天
   * @param context - 对话上下文
   * @returns Promise<ChatCompletionResponse>
   */
  abstract async chatSync(context: ChatContext): Promise<ChatCompletionResponse>

  /**
   * 测试连接
   * @returns Promise<{ success: boolean, message: string }>
   * @description 测试 API 密钥是否有效
   * 逻辑：
   * 1. 发送一个简单的测试请求
   * 2. 返回测试结果
   */
  abstract async testConnection(): Promise<{ success: boolean, message: string }>

  /**
   * 构建请求头
   * @returns Record<string, string>
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    }
  }

  /**
   * 构建基础 URL
   * @param endpoint - 端点路径
   * @returns string
   */
  protected buildUrl(endpoint: string): string {
    const baseUrl = this.config.baseUrl || this.getDefaultBaseUrl()
    return `${baseUrl}${endpoint}`
  }

  /**
   * 获取默认 API 基础 URL
   * @returns string
   */
  protected abstract getDefaultBaseUrl(): string
}
