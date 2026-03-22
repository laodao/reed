/**
 * Google Gemini SDK Provider
 * @module providers/sdk/google-sdk-provider
 * @description 使用 Google 官方 SDK 实现 AI 提供商
 */

import { GoogleGenerativeAI, GenerativeModel, Content, Part } from '@google/generative-ai'
import { BaseProvider, ProviderConfig, StreamCallback } from '../base-provider'
import type {
  ChatContext,
  ChatCompletionResponse,
  ProviderTemplate,
  UserProviderConfig
} from '../../../shared/types'

/**
 * Google Gemini SDK Provider
 *
 * 使用 Google Generative AI SDK 实现 Gemini 系列模型的调用。
 * 支持流式和非流式响应。
 */
export class GoogleSdkProvider extends BaseProvider {
  private genAI: GoogleGenerativeAI

  constructor(
    config: ProviderConfig,
    template?: ProviderTemplate,
    userConfig?: UserProviderConfig
  ) {
    super(config, template, userConfig)

    // 初始化 Google Generative AI SDK
    this.genAI = new GoogleGenerativeAI(config.apiKey)
  }

  get id(): string {
    return 'google'
  }

  get name(): string {
    return 'Google AI'
  }

  protected getDefaultBaseUrl(): string {
    return 'https://generativelanguage.googleapis.com'
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
        maxTokens: m.maxOutputTokens || 8192,
        contextWindow: m.contextWindow || 1048576
      }))
    }

    // Google 没有模型列表 API，返回空数组
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
   * 获取 GenerativeModel 实例
   */
  private getModel(): GenerativeModel {
    const modelId = this.getDefaultModel()
    return this.genAI.getGenerativeModel({ model: modelId })
  }

  /**
   * 构建对话历史
   * Google Gemini 使用特定的 Content 格式
   * 支持多模态内容（图片）
   */
  private buildHistory(context: ChatContext): Content[] {
    const history: Content[] = []

    for (const msg of context.messages) {
      // 检测是否是多模态内容（数组格式）
      const isMultimodal = Array.isArray(msg.content)

      if (isMultimodal) {
        // 多模态消息，转换为 Gemini 格式
        const parts: Part[] = (msg.content as any[]).map((block: any) => {
          if (block.type === 'text') {
            return { text: block.text || '' }
          } else if (block.type === 'image' && block.image_url?.url) {
            // 解析 data URL 获取 mimeType 和 data
            const dataUrl = block.image_url.url
            const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
            if (matches) {
              return {
                inlineData: {
                  mimeType: matches[1],
                  data: matches[2]
                }
              }
            }
          }
          return null
        }).filter(Boolean) as Part[]

        history.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        })
      } else {
        // 纯文本消息
        const textContent = (msg.content as string).trim()
        if (!textContent) continue
        history.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: textContent }]
        })
      }
    }

    return history
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
    _signal?: AbortSignal
  ): Promise<string> {
    const model = this.getModel()
    const history = this.buildHistory(context)

    let fullContent = ''

    try {
      onEvent({ type: 'start' })

      // 创建聊天会话
      const chat = model.startChat({
        history: history.length > 1 ? history.slice(0, -1) : [],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7
        }
      })

      // 获取最后一条用户消息
      const lastMessage = context.messages[context.messages.length - 1]

      // 发送流式请求
      const result = await chat.sendMessageStream(lastMessage.content)

      // 处理流式响应
      for await (const chunk of result.stream) {
        const text = chunk.text()
        fullContent += text
        onEvent({
          type: 'delta',
          content: text
        })
      }

      onEvent({ type: 'done' })
      return fullContent
    } catch (error: any) {
      const errorMessage = this.formatError(error)
      onEvent({ type: 'error', error: errorMessage })
      throw new Error(errorMessage)
    }
  }

  /**
   * 非流式聊天
   */
  async chatSync(context: ChatContext): Promise<ChatCompletionResponse> {
    const model = this.getModel()
    const history = this.buildHistory(context)

    try {
      // 创建聊天会话
      const chat = model.startChat({
        history: history.length > 1 ? history.slice(0, -1) : [],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7
        }
      })

      // 获取最后一条用户消息
      const lastMessage = context.messages[context.messages.length - 1]

      // 发送请求
      const result = await chat.sendMessage(lastMessage.content)
      const response = await result.response

      return {
        success: true,
        content: response.text(),
        usage: response.usageMetadata
          ? {
              promptTokens: response.usageMetadata.promptTokenCount || 0,
              completionTokens: response.usageMetadata.candidatesTokenCount || 0,
              totalTokens: response.usageMetadata.totalTokenCount || 0
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
    // Google API 错误格式
    if (error.message) {
      // 解析错误详情
      if (error.message.includes('API_KEY_INVALID')) {
        return 'API Key 无效'
      }
      if (error.message.includes('RESOURCE_EXHAUSTED')) {
        return 'API 配额已用尽'
      }
      return error.message
    }

    return '未知错误'
  }
}
