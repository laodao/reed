/**
 * AI Provider 基类
 * @module providers/base-provider
 * @description 所有 AI 提供商的基类，定义统一接口
 */

import type { ChatContext, ChatCompletionResponse, ProviderTemplate, UserProviderConfig } from '@shared/types'

/**
 * Provider 配置
 */
export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
}

/**
 * 流式事件回调
 */
export type StreamCallback = (event: {
  type: 'start' | 'delta' | 'done' | 'error' | 'thinking'
  messageId?: string
  content?: string
  /** 思维链内容 */
  thinkingContent?: string
  error?: string
}) => void

/**
 * 聊天选项
 */
export interface ChatOptions {
  /** 启用深度思考 */
  enableThinking?: boolean
  /** 联网搜索上下文（已格式化的搜索结果） */
  webSearchContext?: string
  /** 知识库上下文（已格式化的检索结果） */
  knowledgeContext?: string
  /** 最大生成 token 数 */
  maxTokens?: number
}

/**
 * Provider 基类
 * 所有 AI 提供商必须继承此类并实现其方法
 */
export abstract class BaseProvider {
  protected config: ProviderConfig
  protected template?: ProviderTemplate
  protected userConfig?: UserProviderConfig

  constructor(config: ProviderConfig, template?: ProviderTemplate, userConfig?: UserProviderConfig) {
    this.config = config
    this.template = template
    this.userConfig = userConfig
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
  abstract chat(
    context: ChatContext,
    onDelta: (content: string) => void,
    signal?: AbortSignal
  ): Promise<string>

  /**
   * 流式聊天（带完整事件）
   * @param context - 对话上下文
   * @param onEvent - 事件回调
   * @param signal - 中断信号
   * @param options - 聊天选项（深度思考、联网搜索等）
   * @returns Promise<string>
   */
  abstract chatStream(
    context: ChatContext,
    onEvent: StreamCallback,
    signal?: AbortSignal,
    options?: ChatOptions
  ): Promise<string>

  /**
   * 非流式聊天
   * @param context - 对话上下文
   * @returns Promise<ChatCompletionResponse>
   */
  abstract chatSync(context: ChatContext): Promise<ChatCompletionResponse>

  /**
   * 测试连接
   * @returns Promise<{ success: boolean, message: string }>
   * @description 测试 API 密钥是否有效
   */
  abstract testConnection(): Promise<{ success: boolean, message: string }>

  /**
   * 构建请求头
   * @returns Record<string, string>
   */
  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // 如果有模板配置，使用模板的认证方式
    if (this.template) {
      const { authType, authHeader, authPrefix, defaultHeaders } = this.template.apiConfig
      const apiKey = this.config.apiKey

      // 添加默认请求头
      if (defaultHeaders) {
        Object.assign(headers, defaultHeaders)
      }

      // 添加自定义请求头
      if (this.userConfig?.customHeaders) {
        Object.assign(headers, this.userConfig.customHeaders)
      }

      // 根据认证类型添加认证头
      switch (authType) {
        case 'bearer':
          headers[authHeader] = `${authPrefix || 'Bearer '}${apiKey}`
          break
        case 'api-key':
          headers[authHeader] = apiKey
          break
        case 'none':
          // 无需认证
          break
      }
    } else {
      // 默认使用 Bearer 认证
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }

    return headers
  }

  /**
   * 构建基础 URL
   * @param endpoint - 端点路径
   * @returns string
   */
  protected buildUrl(endpoint: string): string {
    // 优先使用用户配置的 baseUrl，然后是模板的 baseUrl，最后是默认值
    let baseUrl = this.config.baseUrl
    if (!baseUrl && this.template) {
      baseUrl = this.template.apiConfig.baseUrl
    }
    if (!baseUrl) {
      baseUrl = this.getDefaultBaseUrl()
    }
    return `${baseUrl}${endpoint}`
  }

  /**
   * 获取聊天端点
   */
  protected getChatEndpoint(): string {
    if (this.template) {
      return this.template.apiConfig.chatEndpoint
    }
    return '/v1/chat/completions'
  }

  /**
   * 获取默认 API 基础 URL
   * @returns string
   */
  protected abstract getDefaultBaseUrl(): string
}
