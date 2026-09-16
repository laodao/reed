/**
 * Anthropic SDK Provider
 * @module providers/sdk/anthropic-sdk-provider
 * @description 使用 Anthropic 官方 SDK 实现 AI 提供商
 */

import Anthropic from '@anthropic-ai/sdk'
import { BaseProvider, ProviderConfig, StreamCallback, ChatOptions } from '../base-provider'
import type {
  ChatContext,
  ChatCompletionResponse,
  ProviderTemplate,
  UserProviderConfig
} from '@shared/types'

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
    // 收敛超时并禁用重试，避免网络挂起长时间静默
    // baseURL 回退顺序：用户配置 > 模板默认端点 > 官方根地址。
    // 模板默认端点不可省——第三方 Anthropic 兼容端点（如阿里百炼 Token Plan 的
    // https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic）用户通常留空，
    // 缺了回退会静默打到 api.anthropic.com。Anthropic SDK 自行在 baseURL 后拼 /v1/messages。
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || template?.apiConfig?.baseUrl || this.getDefaultBaseUrl(),
      timeout: 300_000,
      maxRetries: 0
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
    // 如果模板中有模型定义，使用模板中的
    if (this.template?.models && this.template.models.length > 0) {
      return this.template.models.map((m) => ({
        id: m.id,
        name: m.name,
        maxTokens: m.maxOutputTokens || 4096,
        contextWindow: m.contextWindow || 200000
      }))
    }

    // Anthropic 没有模型列表 API，返回空数组
    return []
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

    // 没有可用模型时抛出错误
    throw new Error('未指定模型，请在配置中选择一个模型')
  }

  /**
   * 构建消息列表
   * Anthropic API 不使用 system role，系统提示需要单独传递
   * 支持多模态内容（图片）
   */
  private buildMessages(context: ChatContext): Anthropic.Messages.MessageParam[] {
    const messages: Anthropic.Messages.MessageParam[] = []

    for (const msg of context.messages) {
      // 检测是否是多模态内容（数组格式）
      const isMultimodal = Array.isArray(msg.content)

      if (isMultimodal) {
        // 多模态消息，转换为 Anthropic 格式
        const content: Anthropic.ContentBlock[] = (msg.content as any[]).map((block: any) => {
          if (block.type === 'text') {
            return { type: 'text' as const, text: block.text || '' }
          } else if (block.type === 'image' && block.image_url?.url) {
            // 解析 data URL 获取 media_type 和 data
            const dataUrl = block.image_url.url
            const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
            if (matches) {
              return {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: matches[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: matches[2]
                }
              }
            }
          }
          return null
        }).filter(Boolean) as Anthropic.ContentBlock[]

        messages.push({
          role: msg.role as 'user' | 'assistant',
          content
        })
      } else {
        // 纯文本消息
        const textContent = (msg.content as string).trim()
        if (!textContent) continue
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: textContent
        })
      }
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
    signal?: AbortSignal,
    options?: ChatOptions
  ): Promise<string> {
    const model = this.getDefaultModel()
    const messages = this.buildMessages(context)

    let fullContent = ''
    let messageId = ''

    try {
      onEvent({ type: 'start' })

      // 创建流式请求
      // max_tokens 优先级：options > 模板模型定义 > 8192（Claude 默认应 8192，原 4096 偏低）
      const stream = this.client.messages.stream(
        {
          model,
          max_tokens: options?.maxTokens || this.template?.models?.find((m) => m.id === model)?.maxOutputTokens || 8192,
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
  async chatSync(context: ChatContext, options?: ChatOptions): Promise<ChatCompletionResponse> {
    const model = this.getDefaultModel()
    const messages = this.buildMessages(context)

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: options?.maxTokens || this.template?.models?.find((m) => m.id === model)?.maxOutputTokens || 8192,
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
