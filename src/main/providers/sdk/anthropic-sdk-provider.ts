/**
 * Anthropic SDK Provider
 * @module providers/sdk/anthropic-sdk-provider
 * @description 使用 Anthropic 官方 SDK 实现 AI 提供商
 */

import Anthropic from '@anthropic-ai/sdk'
import { BaseProvider, ProviderConfig, StreamCallback } from '../base-provider'
import type {
  ChatContext,
  ChatCompletionResponse,
  ProviderTemplate,
  UserProviderConfig
} from '../../../shared/types'

/**
 * Anthropic SDK Provider
 *
 * 使用 Anthropic 官方 SDK 实现 Claude 系列模型的调用。
 * 支持流式和非流式响应。
 */
export class AnthropicSdkProvider extends BaseProvider {
  private client: Anthropic

  constructor(
    config: ProviderConfig,
    template?: ProviderTemplate,
    userConfig?: UserProviderConfig
  ) {
    super(config, template, userConfig)

    // 初始化 Anthropic SDK 客户端
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    })
  }

  get id(): string {
    return 'anthropic'
  }

  get name(): string {
    return 'Anthropic'
  }

  protected getDefaultBaseUrl(): string {
    return 'https://api.anthropic.com'
  }

  /**
   * 获取模型列表
   */
  async getModels(): Promise<Array<{ id: string; name: string; maxTokens: number; contextWindow: number }>> {
    // Anthropic 没有模型列表 API，返回预定义的模型
    const models = [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', maxTokens: 64000, contextWindow: 200000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', maxTokens: 8192, contextWindow: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', maxTokens: 8192, contextWindow: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', maxTokens: 4096, contextWindow: 200000 },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', maxTokens: 4096, contextWindow: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', maxTokens: 4096, contextWindow: 200000 }
    ]

    // 如果模板中有模型定义，使用模板中的
    if (this.template?.models && this.template.models.length > 0) {
      return this.template.models.map((m) => ({
        id: m.id,
        name: m.name,
        maxTokens: m.maxOutputTokens || 4096,
        contextWindow: m.contextWindow || 200000
      }))
    }

    return models
  }

  /**
   * 获取默认模型
   */
  private getDefaultModel(): string {
    if (this.config.defaultModel) {
      return this.config.defaultModel
    }

    if (this.template?.models && this.template.models.length > 0) {
      return this.template.models[0].id
    }

    return 'claude-sonnet-4-20250514'
  }

  /**
   * 构建消息列表
   * Anthropic API 不使用 system role，系统提示需要单独传递
   */
  private buildMessages(context: ChatContext): Anthropic.Messages.MessageParam[] {
    const messages: Anthropic.Messages.MessageParam[] = []

    for (const msg of context.messages) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
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

      // 创建流式请求
      const stream = this.client.messages.stream(
        {
          model,
          max_tokens: this.template?.models?.find((m) => m.id === model)?.maxOutputTokens || 4096,
          messages,
          system: context.systemPrompt
        },
        {
          signal
        }
      )

      // 处理流式事件
      for await (const event of stream) {
        switch (event.type) {
          case 'message_start':
            messageId = event.message.id
            break

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              const text = event.delta.text
              fullContent += text
              onEvent({
                type: 'delta',
                messageId,
                content: text
              })
            }
            break
        }
      }

      onEvent({ type: 'done', messageId })
      return fullContent
    } catch (error: any) {
      // 处理取消请求
      if (error.name === 'AbortError') {
        onEvent({ type: 'error', error: '请求已取消' })
        return fullContent
      }

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
      const response = await this.client.messages.create({
        model,
        max_tokens: this.template?.models?.find((m) => m.id === model)?.maxOutputTokens || 4096,
        messages,
        system: context.systemPrompt
      })

      // 提取文本内容
      let content = ''
      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text
        }
      }

      return {
        success: true,
        content,
        usage: response.usage
          ? {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens: response.usage.input_tokens + response.usage.output_tokens
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
    // Anthropic API 错误格式
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
