/**
 * OpenAI SDK Provider
 * @module providers/sdk/openai-sdk-provider
 * @description 使用 OpenAI 官方 SDK 实现 AI 提供商
 */

import OpenAI from 'openai'
import type { Stream } from 'openai/streaming'
import { BaseProvider, ProviderConfig, StreamCallback } from '../base-provider'
import type {
  ChatContext,
  ChatCompletionResponse,
  ProviderTemplate,
  UserProviderConfig
} from '../../../shared/types'

/**
 * OpenAI SDK Provider
 *
 * 使用 OpenAI 官方 SDK 实现，支持 OpenAI 及其兼容平台。
 * 兼容平台包括：DeepSeek、智谱 GLM、Moonshot、Minimax 等。
 */
export class OpenAISdkProvider extends BaseProvider {
  private client: OpenAI
  private providerId: string
  private providerName: string
  private defaultBaseUrl: string

  constructor(
    config: ProviderConfig,
    providerId: string,
    providerName: string,
    defaultBaseUrl: string,
    template?: ProviderTemplate,
    userConfig?: UserProviderConfig
  ) {
    super(config, template, userConfig)
    this.providerId = providerId
    this.providerName = providerName
    this.defaultBaseUrl = defaultBaseUrl

    // 初始化 OpenAI SDK 客户端
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || defaultBaseUrl
    })
  }

  get id(): string {
    return this.providerId
  }

  get name(): string {
    return this.providerName
  }

  protected getDefaultBaseUrl(): string {
    return this.defaultBaseUrl
  }

  /**
   * 获取模型列表
   */
  async getModels(): Promise<Array<{ id: string; name: string; maxTokens: number; contextWindow: number }>> {
    try {
      const models = await this.client.models.list()

      return models.data.map((model) => ({
        id: model.id,
        name: model.id,
        maxTokens: 4096,
        contextWindow: 8192
      }))
    } catch (error) {
      console.error('获取模型列表失败:', error)
      // 返回模板中预定义的模型列表
      if (this.template?.models) {
        return this.template.models.map((m) => ({
          id: m.id,
          name: m.name,
          maxTokens: m.maxOutputTokens || 4096,
          contextWindow: m.contextWindow || 8192
        }))
      }
      return []
    }
  }

  /**
   * 获取默认模型
   */
  private getDefaultModel(): string {
    // 优先使用配置中指定的模型
    if (this.config.defaultModel) {
      return this.config.defaultModel
    }

    // 然后尝试使用模板中定义的第一个模型
    if (this.template?.models && this.template.models.length > 0) {
      return this.template.models[0].id
    }

    // 最后使用各平台的默认模型
    const defaultModels: Record<string, string> = {
      openai: 'gpt-4o',
      deepseek: 'deepseek-chat',
      glm: 'glm-4-flash',
      qwen: 'qwen-turbo',
      moonshot: 'moonshot-v1-8k',
      minimax: 'abab6.5s-chat'
    }

    return defaultModels[this.providerId] || 'gpt-4o'
  }

  /**
   * 构建消息列表
   */
  private buildMessages(context: ChatContext): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

    // 添加系统消息
    if (context.systemPrompt) {
      messages.push({
        role: 'system',
        content: context.systemPrompt
      })
    }

    // 添加历史消息
    for (const msg of context.messages) {
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      })
    }

    return messages
  }

  /**
   * 流式聊天（简化版）
   */
  async chat(
    context: ChatContext,
    onDelta: (content: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    return this.chatStream(
      context,
      (event) => {
        if (event.type === 'delta' && event.content) {
          onDelta(event.content)
        }
      },
      signal
    )
  }

  /**
   * 流式聊天（完整事件）
   */
  async chatStream(
    context: ChatContext,
    onEvent: StreamCallback,
    signal?: AbortSignal
  ): Promise<string> {
    const model = this.getDefaultModel()
    const messages = this.buildMessages(context)

    let fullContent = ''
    let messageId = ''

    try {
      onEvent({ type: 'start' })

      const stream = await this.client.chat.completions.create(
        {
          model,
          messages,
          stream: true,
          max_tokens: this.template?.supportedParams?.maxTokens ? 4096 : undefined,
          temperature: this.template?.supportedParams?.temperature ? 0.7 : undefined
        },
        {
          signal
        }
      )

      for await (const chunk of stream) {
        // 获取消息 ID
        if (chunk.id && !messageId) {
          messageId = chunk.id
        }

        // 处理增量内容
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) {
          fullContent += content
          onEvent({
            type: 'delta',
            messageId,
            content
          })
        }
      }

      onEvent({ type: 'done', messageId })
      return fullContent
    } catch (error: any) {
      // 处理取消请求
      if (error.name === 'AbortError' || error.code === 'aborted') {
        onEvent({ type: 'error', error: '请求已取消' })
        return fullContent
      }

      // 处理 API 错误
      const errorMessage = this.formatError(error)
      onEvent({ type: 'error', error: errorMessage })
      throw new Error(errorMessage)
    }
  }

  /**
   * 非流式聊天
   */
  async chatSync(context: ChatContext): Promise<ChatCompletionResponse> {
    const model = this.getDefaultModel()
    const messages = this.buildMessages(context)

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        stream: false,
        max_tokens: this.template?.supportedParams?.maxTokens ? 4096 : undefined,
        temperature: this.template?.supportedParams?.temperature ? 0.7 : undefined
      })

      const choice = response.choices[0]

      return {
        success: true,
        content: choice?.message?.content || '',
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens
            }
          : undefined
      }
    } catch (error: any) {
      return {
        success: false,
        error: this.formatError(error)
      }
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // 尝试获取模型列表
      const models = await this.getModels()
      if (models.length > 0) {
        return {
          success: true,
          message: `连接成功，发现 ${models.length} 个模型`
        }
      }

      // 如果没有模型列表，尝试发送一个简单请求
      const response = await this.chatSync({
        messages: [{ role: 'user', content: 'Hi' }]
      })

      if (response.success) {
        return {
          success: true,
          message: '连接成功'
        }
      } else {
        return {
          success: false,
          message: response.error || '连接失败'
        }
      }
    } catch (error: any) {
      return {
        success: false,
        message: this.formatError(error)
      }
    }
  }

  /**
   * 格式化错误信息
   */
  private formatError(error: any): string {
    // OpenAI SDK 错误格式
    if (error.error?.message) {
      return error.error.message
    }

    // HTTP 错误
    if (error.status) {
      return `API 错误 (${error.status}): ${error.message || '未知错误'}`
    }

    return error.message || '未知错误'
  }
}
