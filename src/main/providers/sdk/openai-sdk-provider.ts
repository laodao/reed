/**
 * OpenAI SDK Provider
 * @module providers/sdk/openai-sdk-provider
 * @description 使用 OpenAI 官方 SDK 实现 AI 提供商
 */

import OpenAI from 'openai'
import type { Stream } from 'openai/streaming'
import { BaseProvider, ProviderConfig, StreamCallback, ChatOptions } from '../base-provider'
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

      console.log('[OpenAISdkProvider.getModels] API 返回的模型列表:', models.data.map(m => ({ id: m.id, name: (m as any).name || m.id })))

      return models.data.map((model) => ({
        id: model.id,
        name: (model as any).name || model.id, // 使用 API 返回的 name，如果没有则使用 id
        maxTokens: (model as any).max_output_tokens || 4096,
        contextWindow: (model as any).context_window || 8192
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

    // 没有可用模型时抛出错误
    throw new Error('未指定模型，请在配置中选择一个模型')
  }

  /**
   * 构建消息列表
   * 注意：不同 API 有不同的消息格式要求
   * - OpenAI: 支持 system 角色，content 可以是字符串
   * - 智谱 GLM: 不支持 system 角色，content 必须是数组格式
   */
  private buildMessages(context: ChatContext, options?: ChatOptions): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

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
    // 确保消息格式正确，content 是有效的字符串
    for (const msg of context.messages) {
      // 跳过空消息
      if (!msg.content || typeof msg.content !== 'string' || msg.content.trim() === '') {
        console.warn('[OpenAISdkProvider.buildMessages] 跳过空消息, role:', msg.role)
        continue
      }

      // 确保 role 是有效的值
      const role = msg.role as 'user' | 'assistant' | 'system'
      if (role !== 'user' && role !== 'assistant' && role !== 'system') {
        console.warn('[OpenAISdkProvider.buildMessages] 无效的角色:', msg.role, ', 跳过该消息')
        continue
      }

      // 构建消息内容
      const messageContent = msg.content.trim()

      if (isZhipuGLM) {
        // 智谱 GLM 特殊格式：
        // 1. content 必须是数组格式
        // 2. 不支持 system 角色
        if (role === 'system') {
          // 将 system 消息合并到第一条 user 消息中（稍后处理）
          continue
        }

        messages.push({
          role: role as 'user' | 'assistant',
          // 智谱 GLM 需要 content 是数组格式
          content: [{ type: 'text' as const, text: messageContent }]
        } as any)
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
          const originalText = typeof firstContent === 'string'
            ? firstContent
            : (firstContent as any)[0]?.text || ''
          messages[0] = {
            role: 'user',
            content: [{
              type: 'text' as const,
              text: `[系统指令]\n${systemPrompt}\n\n[用户消息]\n${originalText}`
            }]
          } as any
        } else {
          // 如果没有 user 消息，创建一条
          messages.unshift({
            role: 'user',
            content: [{ type: 'text' as const, text: `[系统指令]\n${systemPrompt}` }]
          } as any)
        }
      } else {
        // 标准 OpenAI 格式：在开头添加 system 消息
        messages.unshift({
          role: 'system',
          content: systemPrompt
        })
      }
    }

    console.log('[OpenAISdkProvider.buildMessages] 构建的消息数量:', messages.length)
    console.log('[OpenAISdkProvider.buildMessages] 消息角色:', messages.map(m => m.role))
    console.log('[OpenAISdkProvider.buildMessages] 是否智谱 GLM:', isZhipuGLM)

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
    const messages = this.buildMessages(context, options)

    let fullContent = ''
    let fullThinkingContent = ''
    let messageId = ''

    // 检测是否为 DeepSeek R1 模型（支持思维链）
    const isDeepSeekR1 = model.toLowerCase().includes('deepseek-reasoner') ||
                         model.toLowerCase().includes('deepseek-r1')

    // ===== 详细日志：打印网络请求参数 =====
    console.log('[OpenAISdkProvider.chatStream] ========== 网络请求参数 ==========')
    console.log('[OpenAISdkProvider.chatStream] providerId:', this.providerId)
    console.log('[OpenAISdkProvider.chatStream] providerName:', this.providerName)
    console.log('[OpenAISdkProvider.chatStream] defaultBaseUrl:', this.defaultBaseUrl)
    console.log('[OpenAISdkProvider.chatStream] 实际使用的 baseURL:', this.client.baseURL)
    console.log('[OpenAISdkProvider.chatStream] apiKey 前缀:', this.client.apiKey?.substring(0, 10) + '***')
    console.log('[OpenAISdkProvider.chatStream] 使用的模型:', model)
    console.log('[OpenAISdkProvider.chatStream] 是否 DeepSeek R1:', isDeepSeekR1)
    console.log('[OpenAISdkProvider.chatStream] 启用深度思考:', options?.enableThinking)
    console.log('[OpenAISdkProvider.chatStream] 消息数量:', messages.length)
    console.log('[OpenAISdkProvider.chatStream] ====================================')

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

        // 处理 DeepSeek R1 的思维链内容（reasoning_content）
        // 注意：OpenAI SDK 可能需要特殊处理来获取 reasoning_content
        if (isDeepSeekR1) {
          const delta = chunk.choices[0]?.delta as any
          const thinkingContent = delta?.reasoning_content || ''
          if (thinkingContent) {
            console.log('[OpenAISdkProvider.chatStream] 收到思维链内容, 长度:', thinkingContent.length)
            fullThinkingContent += thinkingContent
            onEvent({
              type: 'thinking',
              messageId,
              thinkingContent
            })
          }
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

      console.log('[OpenAISdkProvider.chatStream] 完成, 内容长度:', fullContent.length, ', 思维链长度:', fullThinkingContent.length)
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
