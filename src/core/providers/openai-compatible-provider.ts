/**
 * OpenAI 兼容 Provider
 * @module providers/openai-compatible-provider
 * @description 支持所有 OpenAI API 格式的提供商
 */

import { BaseProvider, ProviderConfig, StreamCallback, ChatOptions } from './base-provider'
import { resolveCapabilities } from './model-capability'
import type { ChatContext, ChatCompletionResponse, ProviderTemplate, UserProviderConfig, ModelDefinition } from '@shared/types'

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
    const modelsEndpoint = this.template?.apiConfig.modelsEndpoint || '/v1/models'
    const url = this.buildUrl(modelsEndpoint)
    const headers = this.buildHeaders()

    const response = await fetch(url, {
      method: 'GET',
      headers
    })

    if (!response.ok) {
      throw new Error(`获取模型列表失败: HTTP ${response.status}`)
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

    // 如果返回的不是标准格式，抛出错误
    throw new Error('API 返回的数据格式不正确')
  }

  /**
   * 从落库的用户配置中查找当前模型的定义
   */
  private findModelDefinition(modelId: string): ModelDefinition | undefined {
    return this.userConfig?.models?.find(m => m.id === modelId)
  }

  /**
   * 检测模型是否支持视觉
   *
   * 优先读落库 ModelDefinition 的 type 字段（type==='multimodal' 即支持视觉），
   * 缺失时回退模型名兜底。不再硬编码模型名清单。
   */
  private supportsVision(modelId: string): boolean {
    return resolveCapabilities(modelId, this.findModelDefinition(modelId)).supportsVision
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

    // 检测模型是否支持视觉
    const supportsVision = this.supportsVision(model)
    console.log('[OpenAICompatibleProvider.buildRequestBody] 模型:', model, ', 支持视觉:', supportsVision)

    // 检测消息中是否包含图片
    let hasImagesInMessages = false

    // 添加历史消息
    // 支持多模态内容（字符串或 MessageContentBlock 数组）
    for (const msg of context.messages) {
      // 跳过空消息
      if (!msg.content) {
        console.warn('[OpenAICompatibleProvider.buildRequestBody] 跳过空消息, role:', msg.role)
        continue
      }

      // 确保 role 是有效的值
      const role = msg.role
      if (role !== 'user' && role !== 'assistant' && role !== 'system') {
        console.warn('[OpenAICompatibleProvider.buildRequestBody] 无效的角色:', msg.role, ', 跳过该消息')
        continue
      }

      // 检测是否是多模态内容（数组格式）
      const isMultimodal = Array.isArray(msg.content)

      // 检测是否有图片
      if (isMultimodal) {
        const hasImage = (msg.content as any[]).some((block: any) => block.type === 'image')
        if (hasImage) {
          hasImagesInMessages = true
        }
      }

      if (isZhipuGLM) {
        // 智谱 GLM 特殊格式：
        // 1. content 必须是数组格式
        // 2. 不支持 system 角色
        if (role === 'system') {
          continue
        }

        if (isMultimodal) {
          // 已经是多模态格式，转换图片格式
          const glmContent = (msg.content as any[]).map((block: any) => {
            if (block.type === 'text') {
              return { type: 'text', text: block.text || '' }
            } else if (block.type === 'image' && block.image_url?.url && supportsVision) {
              // 只有支持视觉的模型才发送图片
              return { type: 'image_url', image_url: { url: block.image_url.url } }
            } else if (block.type === 'image' && !supportsVision) {
              // 不支持视觉的模型，将图片转换为占位符文本
              return { type: 'text', text: '[用户上传了图片，但当前模型不支持图片识别]' }
            }
            return null
          }).filter(Boolean)

          messages.push({ role, content: glmContent })
        } else {
          // 纯文本消息
          const textContent = (msg.content as string).trim()
          if (!textContent) continue
          messages.push({
            role,
            content: [{ type: 'text', text: textContent }]
          })
        }
      } else {
        // 标准 OpenAI 格式
        if (isMultimodal) {
          if (supportsVision) {
            // 支持视觉：保留图片
            const openaiContent = (msg.content as any[]).map((block: any) => {
              if (block.type === 'text') {
                return { type: 'text', text: block.text || '' }
              } else if (block.type === 'image' && block.image_url?.url) {
                return { type: 'image_url', image_url: { url: block.image_url.url } }
              }
              return null
            }).filter(Boolean)

            messages.push({ role, content: openaiContent })
          } else {
            // 不支持视觉：提取文本，替换图片为占位符
            const textParts: string[] = []
            for (const block of msg.content as any[]) {
              if (block.type === 'text' && block.text) {
                textParts.push(block.text)
              } else if (block.type === 'image') {
                textParts.push('[用户上传了图片，但当前模型不支持图片识别]')
              }
            }
            messages.push({ role, content: textParts.join('\n') })
          }
        } else {
          // 纯文本消息
          const textContent = (msg.content as string).trim()
          if (!textContent) continue
          messages.push({ role, content: textContent })
        }
      }
    }

    // 如果消息包含图片但模型不支持视觉，打印警告
    if (hasImagesInMessages && !supportsVision) {
      console.warn('[OpenAICompatibleProvider.buildRequestBody] 警告: 消息包含图片，但模型', model, '不支持视觉功能')
    }

    // 处理 system prompt
    if (systemPrompt) {
      if (isZhipuGLM) {
        // 智谱 GLM：将 system prompt 合并到第一条 user 消息中
        if (messages.length > 0 && messages[0].role === 'user') {
          const firstContent = messages[0].content
          const originalText = Array.isArray(firstContent)
            ? firstContent.find((b: any) => b.type === 'text')?.text || ''
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
    // 打印是否有图片内容
    const hasImages = messages.some((m: any) =>
      Array.isArray(m.content) && m.content.some((b: any) => b.type === 'image' || b.type === 'image_url')
    )
    console.log('[OpenAICompatibleProvider.buildRequestBody] 包含图片消息:', hasImages)

    const body: any = {
      model,
      messages,
      stream
    }

    // 流式请求时添加 stream_options 以获取 usage 信息
    if (stream) {
      body.stream_options = {
        include_usage: true
      }
    }

    // 添加支持的参数
    if (this.template?.supportedParams) {
      if (this.template.supportedParams.maxTokens) {
        // 优先级：options > 模型定义 maxOutputTokens > 默认 8192
        body.max_tokens = options?.maxTokens || this.findModelDefinition(model)?.maxOutputTokens || 8192
      }
      if (this.template.supportedParams.temperature) {
        // 优先 options（来自 role.temperature），否则默认 0.7
        body.temperature = options?.temperature ?? 0.7
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
    console.log('[OpenAICompatibleProvider.chatStream] 请求体 stream_options:', body.stream_options)

    let fullContent = ''
    let fullThinkingContent = ''
    let messageId = ''
    let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

    // 是否解析思维链：优先读落库能力字段，缺失回退模型名兜底。
    // 最强兜底见循环体：只要返回了 reasoning_content 就解析，不受此值限制。
    const caps = resolveCapabilities(model, this.findModelDefinition(model))
    const shouldParseReasoning = caps.supportsThinking
    console.log('[OpenAICompatibleProvider.chatStream] 是否解析思维链:', shouldParseReasoning, '(supportsThinking=', caps.supportsThinking, ')')

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

              // 调试：打印每个 chunk 的数据（只打印有 usage 或没有 choices 的）
              if (data.usage || !data.choices || data.choices.length === 0) {
                console.log('[OpenAICompatibleProvider] 收到特殊 chunk:', JSON.stringify(data))
              }

              // 获取消息 ID
              if (data.id && !messageId) {
                messageId = data.id
              }

              // 处理 usage 信息（OpenAI 在流式响应的最后一个 chunk 中返回）
              if (data.usage) {
                console.log('[OpenAICompatibleProvider] 收到 usage 信息:', data.usage)
                tokenUsage = {
                  promptTokens: data.usage.prompt_tokens || 0,
                  completionTokens: data.usage.completion_tokens || 0,
                  totalTokens: data.usage.total_tokens || 0
                }
              }

              // 处理思维链内容（reasoning_content）
              // 最强兜底：只要返回了 reasoning_content 就解析，不受 shouldParseReasoning/模型名限制，
              // 即便能力字段标错也不丢内容，避免"内容为 0 一直不返回"。
              if (data.choices && data.choices[0]?.delta?.reasoning_content) {
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

      // 发送完成事件，包含 token 使用信息
      onEvent({
        type: 'done',
        messageId,
        usage: tokenUsage
      })
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
  async chatSync(context: ChatContext, options?: ChatOptions): Promise<ChatCompletionResponse> {
    const model = this.getDefaultModel()
    const url = this.buildUrl(this.getChatEndpoint())
    const headers = this.buildHeaders()
    const body = this.buildRequestBody(context, model, false, options)

    console.log('[OpenAICompatibleProvider.chatSync] max_tokens:', body.max_tokens)

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
