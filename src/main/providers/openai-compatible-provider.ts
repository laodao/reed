/**
 * OpenAI 兼容 Provider
 * @module providers/openai-compatible-provider
 * @description 支持所有 OpenAI API 格式的提供商
 */

import { BaseProvider, ProviderConfig, StreamCallback, ChatOptions } from './base-provider'
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
          name: model.name || model.id, // 使用 API 返回的 name，如果没有则使用 id
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
  private buildRequestBody(context: ChatContext, model: string, stream: boolean = true, options?: ChatOptions): any {
    const messages = []

    // 添加系统消息
    let systemPrompt = context.systemPrompt || ''

    // 如果有联网搜索上下文，添加到系统提示
    if (options?.webSearchContext) {
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n以下是联网搜索的相关信息，请参考这些信息回答问题：\n${options.webSearchContext}`
        : `请参考以下联网搜索的相关信息回答问题：\n${options.webSearchContext}`
    }

    // 检测是否是智谱 GLM（需要特殊格式）
    const isZhipuGLM = this.providerId === 'zhipu' || this.providerId === 'glm'

    // 添加历史消息
    // 确保消息格式正确，过滤掉空消息和无效角色
    for (const msg of context.messages) {
      // 跳过空消息
      if (!msg.content || typeof msg.content !== 'string' || msg.content.trim() === '') {
        console.warn('[OpenAICompatibleProvider.buildRequestBody] 跳过空消息, role:', msg.role)
        continue
      }

      // 确保 role 是有效的值
      const role = msg.role
      if (role !== 'user' && role !== 'assistant' && role !== 'system') {
        console.warn('[OpenAICompatibleProvider.buildRequestBody] 无效的角色:', msg.role, ', 跳过该消息')
        continue
      }

      // 构建消息内容
      const messageContent = msg.content.trim()

      if (isZhipuGLM) {
        // 智谱 GLM 特殊格式：
        // 1. content 必须是数组格式
        // 2. 不支持 system 角色
        if (role === 'system') {
          continue
        }

        messages.push({
          role,
          content: [{ type: 'text', text: messageContent }]
        })
      } else {
        // 标准 OpenAI 格式
        messages.push({
          role,
          content: messageContent
        })
      }
    }

    // 处理 system prompt
    if (systemPrompt) {
      if (isZhipuGLM) {
        // 智谱 GLM：将 system prompt 合并到第一条 user 消息中
        if (messages.length > 0 && messages[0].role === 'user') {
          const firstContent = messages[0].content
          const originalText = Array.isArray(firstContent)
            ? firstContent[0]?.text || ''
            : firstContent
          messages[0] = {
            role: 'user',
            content: [{
              type: 'text',
              text: `[系统指令]\n${systemPrompt}\n\n[用户消息]\n${originalText}`
            }]
          }
        } else {
          messages.unshift({
            role: 'user',
            content: [{ type: 'text', text: `[系统指令]\n${systemPrompt}` }]
          })
        }
      } else {
        // 标准 OpenAI 格式：在开头添加 system 消息
        messages.unshift({
          role: 'system',
          content: systemPrompt
        })
      }
    }

    console.log('[OpenAICompatibleProvider.buildRequestBody] 构建的消息数量:', messages.length)
    console.log('[OpenAICompatibleProvider.buildRequestBody] 消息角色:', messages.map((m: any) => m.role))
    console.log('[OpenAICompatibleProvider.buildRequestBody] 是否智谱 GLM:', isZhipuGLM)

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
    signal?: AbortSignal,
    options?: ChatOptions
  ): Promise<string> {
    const model = this.getDefaultModel()
    console.log('[OpenAICompatibleProvider.chatStream] 使用的模型:', model)
    const url = this.buildUrl(this.getChatEndpoint())
    const headers = this.buildHeaders()
    const body = this.buildRequestBody(context, model, true, options)

    let fullContent = ''
    let fullThinkingContent = ''
    let messageId = ''

    // 检测是否为 DeepSeek R1 模型（支持思维链）
    const isDeepSeekR1 = model.toLowerCase().includes('deepseek-reasoner') ||
                         model.toLowerCase().includes('deepseek-r1')

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

              // 处理 DeepSeek R1 的思维链内容（reasoning_content）
              if (isDeepSeekR1 && data.choices && data.choices[0]?.delta?.reasoning_content) {
                const thinkingContent = data.choices[0].delta.reasoning_content
                fullThinkingContent += thinkingContent
                onEvent({
                  type: 'thinking',
                  messageId,
                  thinkingContent
                })
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

      // 如果有思维链内容，将其附加到消息元数据中
      // 注意：这里我们需要返回思维链内容，但当前的返回值只有 fullContent
      // 可以通过事件传递思维链，由 ChatService 处理

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
