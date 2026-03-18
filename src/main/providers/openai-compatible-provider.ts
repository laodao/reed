/**
 * OpenAI 兼容 Provider
 * @module providers/openai-compatible-provider
 * @description 支持所有 OpenAI API 格式的提供商
 */

import { BaseProvider, ProviderConfig, StreamCallback } from './base-provider'
import type { ChatContext, ChatCompletionResponse, ProviderTemplate, UserProviderConfig, ModelDefinition } from '../../shared/types'

/**
 * OpenAI 兼容 Provider
 * 支持所有使用 OpenAI API 格式的提供商
 */
export class OpenAICompatibleProvider extends BaseProvider {
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
      const modelsEndpoint = this.template?.apiConfig.modelsEndpoint || '/v1/models'
      const url = this.buildUrl(modelsEndpoint)
      const headers = this.buildHeaders()

      const response = await fetch(url, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        throw new Error(`获取模型列表失败: ${response.status}`)
      }

      const data = await response.json()

      // OpenAI 格式的模型列表响应
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((model: any) => ({
          id: model.id,
          name: model.id,
          maxTokens: model.max_output_tokens || 4096,
          contextWindow: model.context_window || 8192
        }))
      }

      return []
    } catch (error) {
      console.error('获取模型列表失败:', error)
      return []
    }
  }

  /**
   * 构建请求体
   */
  private buildRequestBody(context: ChatContext, model: string, stream: boolean = true): any {
    const messages = []

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
        role: msg.role,
        content: msg.content
      })
    }

    const body: any = {
      model,
      messages,
      stream
    }

    // 添加支持的参数
    if (this.template?.supportedParams) {
      if (this.template.supportedParams.maxTokens) {
        body.max_tokens = 4096
      }
      if (this.template.supportedParams.temperature) {
        body.temperature = 0.7
      }
    }

    // 添加自定义参数
    if (this.userConfig?.customParams) {
      Object.assign(body, this.userConfig.customParams)
    }

    return body
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
   * 获取默认模型
   * 如果没有指定模型，使用模板中定义的第一个模型
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

    // 最后抛出错误，避免使用错误的 fallback
    throw new Error('未指定模型，请在对话设置中选择一个模型')
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
    console.log('[OpenAICompatibleProvider.chatStream] 使用的模型:', model)
    const url = this.buildUrl(this.getChatEndpoint())
    const headers = this.buildHeaders()
    const body = this.buildRequestBody(context, model, true)

    let fullContent = ''
    let messageId = ''

    try {
      onEvent({ type: 'start' })

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API 请求失败: ${response.status} - ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('无法获取响应流')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()

          if (!trimmedLine || trimmedLine === 'data: [DONE]') {
            continue
          }

          if (trimmedLine.startsWith('data: ')) {
            const jsonStr = trimmedLine.slice(6)

            try {
              const data = JSON.parse(jsonStr)

              // 获取消息 ID
              if (data.id && !messageId) {
                messageId = data.id
              }

              // 处理增量内容
              if (data.choices && data.choices[0]?.delta?.content) {
                const content = data.choices[0].delta.content
                fullContent += content
                onEvent({
                  type: 'delta',
                  messageId,
                  content
                })
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      onEvent({ type: 'done', messageId })
      return fullContent
    } catch (error: any) {
      if (error.name === 'AbortError') {
        onEvent({ type: 'error', error: '请求已取消' })
        return fullContent
      }

      const errorMessage = error.message || '未知错误'
      onEvent({ type: 'error', error: errorMessage })
      throw error
    }
  }

  /**
   * 非流式聊天
   */
  async chatSync(context: ChatContext): Promise<ChatCompletionResponse> {
    const model = this.getDefaultModel()
    const url = this.buildUrl(this.getChatEndpoint())
    const headers = this.buildHeaders()
    const body = this.buildRequestBody(context, model, false)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          error: `API 请求失败: ${response.status} - ${errorText}`
        }
      }

      const data = await response.json()

      return {
        success: true,
        content: data.choices[0]?.message?.content || '',
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '请求失败'
      }
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const models = await this.getModels()
      if (models.length > 0) {
        return {
          success: true,
          message: `连接成功，发现 ${models.length} 个模型`
        }
      }

      // 如果没有模型列表端点，尝试发送一个简单请求
      const testContext: ChatContext = {
        messages: [{ role: 'user', content: 'Hi' }]
      }

      const response = await this.chatSync(testContext)

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
        message: error.message || '连接失败'
      }
    }
  }
}
