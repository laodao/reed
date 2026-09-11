/**
 * OpenAI SDK Provider
 * @module providers/sdk/openai-sdk-provider
 * @description 使用 OpenAI 官方 SDK 实现 AI 提供商
 */

import OpenAI from 'openai'
import { BaseProvider, ProviderConfig, StreamCallback, ChatOptions } from '../base-provider'
import { resolveCapabilities, resolveMaxTokens } from '../model-capability'
import type {
  ChatContext,
  ChatCompletionResponse,
  ModelDefinition,
  ProviderTemplate,
  UserProviderConfig
} from '@shared/types'

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

    // OpenAI SDK 期望 baseURL 不含 /chat/completions、/embeddings 等子路径，
    // 否则调 /models 时会拼出 /v1/chat/completions/models 这种无效路径。
    // 用户配置/模板 endpoint 字段历史上偶尔会带子路径，这里统一规整。
    const rawBase = config.baseUrl || defaultBaseUrl
    const normalizedBase = OpenAISdkProvider.normalizeBaseUrl(rawBase)

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: normalizedBase,
      // SDK 默认 timeout=10min、maxRetries=2，遇到网络挂起会长时间静默不报错，
      // 表现为前端"发了消息一直不返回"。这里收敛超时并禁用重试，
      // 让失败能尽快以明确的超时/错误暴露出来（错误细节由 chatStream 的 catch 打印）。
      // 49 号：非流式长文生成（如 EP 整本剧本 16K tokens）60s 不够——
      // 可用 AI_PROVIDER_TIMEOUT_MS 覆盖，默认保持 60s 不变。
      timeout: (Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 60_000),
      maxRetries: 0
    })
  }

  private static normalizeBaseUrl(url: string): string {
    if (!url) return url
    let s = url.trim().replace(/\/+$/, '')
    const stripSuffixes = [
      '/chat/completions',
      '/completions',
      '/embeddings',
      '/responses',
    ]
    for (const suffix of stripSuffixes) {
      if (s.toLowerCase().endsWith(suffix)) {
        s = s.slice(0, s.length - suffix.length)
        break
      }
    }
    return s.replace(/\/+$/, '')
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
      // 任何 4xx 都是 API 端明确告诉调用方"请求有问题"（鉴权失败、URL 错、
      // 模型不支持 list 等），都必须冒泡到上层，避免被"回退到模板预置模型"
      // 掩盖成"连接成功但模型为空"的误导信息。
      const status = (error as { status?: number; response?: { status?: number } })?.status
        ?? (error as { response?: { status?: number } })?.response?.status
      if (status && status >= 400 && status < 500) {
        throw error
      }
      // 网络错误 / 5xx / endpoint 不支持 list models 时，回退到模板预定义模型
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
   * 从落库的用户配置中查找当前模型的定义
   * 能力字段（type/supportsThinking 等）由 testConnection 检测后写入 UserProviderConfig.models
   */
  private findModelDefinition(modelId: string): ModelDefinition | undefined {
    return this.userConfig?.models?.find(m => m.id === modelId)
  }

  /**
   * 检测模型是否支持视觉
   *
   * 优先读落库 ModelDefinition 的 type 字段（type==='multimodal' 即支持视觉，
   * 与 testConnection 落库、前端展示标准一致）；缺失时回退模型名兜底。
   * 不再硬编码模型名清单，避免新多模态模型对不上。
   */
  private supportsVision(modelId: string): boolean {
    return resolveCapabilities(modelId, this.findModelDefinition(modelId)).supportsVision
  }

  /**
   * 构建消息列表
   * 注意：不同 API 有不同的消息格式要求
   * - OpenAI: 支持 system 角色，content 可以是字符串或多模态数组
   * - 智谱 GLM: 不支持 system 角色，content 必须是数组格式
   */
  private buildMessages(context: ChatContext, options?: ChatOptions): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

    // 添加系统消息
    let systemPrompt = context.systemPrompt || ''

    // 如果有知识库上下文，添加到系统提示
    if (options?.knowledgeContext) {
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n以下是从知识库检索到的相关内容，请参考这些信息回答问题：\n${options.knowledgeContext}`
        : `请参考以下知识库内容回答问题：\n${options.knowledgeContext}`
    }

    // 如果有联网搜索上下文，添加到系统提示
    if (options?.webSearchContext) {
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n以下是联网搜索的相关信息，请参考这些信息回答问题：\n${options.webSearchContext}`
        : `请参考以下联网搜索的相关信息回答问题：\n${options.webSearchContext}`
    }

    // 检测是否是智谱 GLM（需要特殊格式）
    const isZhipuGLM = this.providerId === 'zhipu' || this.providerId === 'glm'

    // 检测模型是否支持视觉
    const modelId = this.config.defaultModel || ''
    const supportsVision = this.supportsVision(modelId)
    console.log('[OpenAISdkProvider.buildMessages] 模型:', modelId, ', 支持视觉:', supportsVision)

    // 检测消息中是否包含图片
    let hasImagesInMessages = false

    // 添加历史消息
    // 支持多模态内容（字符串或 MessageContentBlock 数组）
    for (const msg of context.messages) {
      // 跳过空消息
      if (!msg.content) {
        console.warn('[OpenAISdkProvider.buildMessages] 跳过空消息, role:', msg.role)
        continue
      }

      // 确保 role 是有效的值
      const role = msg.role as 'user' | 'assistant' | 'system'
      if (role !== 'user' && role !== 'assistant' && role !== 'system') {
        console.warn('[OpenAISdkProvider.buildMessages] 无效的角色:', msg.role, ', 跳过该消息')
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
          // 已经是多模态格式
          const glmContent = (msg.content as any[]).map((block: any) => {
            if (block.type === 'text') {
              return { type: 'text' as const, text: block.text || '' }
            } else if (block.type === 'image' && block.image_url?.url && supportsVision) {
              // 只有支持视觉的模型才发送图片
              return { type: 'image_url' as const, image_url: { url: block.image_url.url } }
            } else if (block.type === 'image' && !supportsVision) {
              // 不支持视觉的模型，将图片转换为占位符文本
              return { type: 'text' as const, text: '[用户上传了图片，但当前模型不支持图片识别]' }
            }
            return null
          }).filter(Boolean)

          messages.push({
            role: role as 'user' | 'assistant',
            content: glmContent
          } as any)
        } else {
          // 纯文本消息
          const textContent = (msg.content as string).trim()
          if (!textContent) continue
          messages.push({
            role: role as 'user' | 'assistant',
            content: [{ type: 'text' as const, text: textContent }]
          } as any)
        }
      } else {
        // 标准 OpenAI 格式
        if (isMultimodal) {
          // 多模态消息，转换为 OpenAI 格式
          const openaiContent = (msg.content as any[]).map((block: any) => {
            if (block.type === 'text') {
              return { type: 'text' as const, text: block.text || '' }
            } else if (block.type === 'image' && block.image_url?.url && supportsVision) {
              // 只有支持视觉的模型才发送图片
              return { type: 'image_url' as const, image_url: { url: block.image_url.url } }
            } else if (block.type === 'image' && !supportsVision) {
              // 不支持视觉的模型，将图片转换为占位符文本
              return { type: 'text' as const, text: '[用户上传了图片，但当前模型不支持图片识别]' }
            }
            return null
          }).filter(Boolean)

          if (role === 'user') {
            messages.push({
              role: 'user',
              content: openaiContent as OpenAI.Chat.Completions.ChatCompletionContentPart[]
            })
          } else if (role === 'assistant') {
            // assistant 消息通常只有文本
            const textBlock = openaiContent.find(b => b.type === 'text')
            messages.push({
              role: 'assistant',
              content: textBlock?.text || ''
            })
          }
        } else {
          // 纯文本消息
          const textContent = (msg.content as string).trim()
          if (!textContent) continue
          messages.push({
            role,
            content: textContent
          })
        }
      }
    }

    // 如果消息包含图片但模型不支持视觉，打印警告
    if (hasImagesInMessages && !supportsVision) {
      console.warn('[OpenAISdkProvider.buildMessages] 警告: 消息包含图片，但模型', modelId, '不支持视觉功能')
    }

    // 处理 system prompt
    if (systemPrompt) {
      if (isZhipuGLM) {
        // 智谱 GLM：将 system prompt 合并到第一条 user 消息中
        if (messages.length > 0 && messages[0].role === 'user') {
          const firstContent = messages[0].content
          const originalText = typeof firstContent === 'string'
            ? firstContent
            : (firstContent as any[])?.find(b => b.type === 'text')?.text || ''
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
    // 打印是否有图片内容
    const hasImages = messages.some((m: any) =>
      Array.isArray(m.content) && m.content.some((b: any) => b.type === 'image' || b.type === 'image_url')
    )
    console.log('[OpenAISdkProvider.buildMessages] 包含图片消息:', hasImages)

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

    // 是否解析思维链：优先读落库能力字段（supportsThinking），缺失回退模型名兜底。
    // 历史上 isDeepSeekR1 只认 deepseek-reasoner/r1，导致 deepseek-v4-pro 等新模型
    // 的 reasoning_content 被丢弃、内容为 0。改为统一读能力字段。
    const caps = resolveCapabilities(model, this.findModelDefinition(model))
    const shouldParseReasoning = caps.supportsThinking

    // ===== 详细日志：打印网络请求参数 =====
    console.log('[OpenAISdkProvider.chatStream] ========== 网络请求参数 ==========')
    console.log('[OpenAISdkProvider.chatStream] providerId:', this.providerId)
    console.log('[OpenAISdkProvider.chatStream] providerName:', this.providerName)
    console.log('[OpenAISdkProvider.chatStream] defaultBaseUrl:', this.defaultBaseUrl)
    console.log('[OpenAISdkProvider.chatStream] 实际使用的 baseURL:', this.client.baseURL)
    console.log('[OpenAISdkProvider.chatStream] apiKey 前缀:', this.client.apiKey?.substring(0, 10) + '***')
    console.log('[OpenAISdkProvider.chatStream] 使用的模型:', model)
    console.log('[OpenAISdkProvider.chatStream] 是否解析思维链:', shouldParseReasoning, '(supportsThinking=', caps.supportsThinking, ')')
    console.log('[OpenAISdkProvider.chatStream] 启用深度思考:', options?.enableThinking)
    console.log('[OpenAISdkProvider.chatStream] 消息数量:', messages.length)
    console.log('[OpenAISdkProvider.chatStream] ====================================')

    try {
      onEvent({ type: 'start' })

      console.log('[OpenAISdkProvider.chatStream] 准备发起请求...')
      const requestStartAt = Date.now()

      // 计算 max_tokens：思维链模型（deepseek-v4-pro 等）的 reasoning_content 也计入 token，
      // 写死 4096 会在思考阶段就撞顶（finish_reason:length），导致正文 content 还没开始输出流就结束。
      // 优先级：调用方传入 > 模型定义的 maxOutputTokens > 默认值；
      // 且思维链模型有下限保护 —— 即便模型定义里 maxOutputTokens 偏小（如 4096），
      // 也会被抬高到 MIN（思维链几千 token + 正文，4096 必然截断）。
      let maxTokens: number | undefined
      if (this.template?.supportedParams?.maxTokens) {
        const modelDef = this.findModelDefinition(model)
        const resolved = resolveMaxTokens(model, options?.maxTokens, modelDef?.maxOutputTokens, true)
        maxTokens = resolved
        if (resolved !== (options?.maxTokens ?? modelDef?.maxOutputTokens)) {
          console.warn('[OpenAISdkProvider.chatStream] max_tokens 已应用思维链下限保护:', resolved)
        }
      }
      // temperature：优先 options（来自 role.temperature），否则默认 0.7
      const temperature = this.template?.supportedParams?.temperature
        ? (options?.temperature ?? 0.7)
        : undefined
      console.log('[OpenAISdkProvider.chatStream] max_tokens:', maxTokens, ', temperature:', temperature)

      let stream: any
      try {
        stream = await this.client.chat.completions.create(
          {
            model,
            messages,
            stream: true,
            max_tokens: maxTokens,
            temperature
          },
          {
            signal
          }
        )
        console.log('[OpenAISdkProvider.chatStream] 请求已建立, 耗时(ms):', Date.now() - requestStartAt, ', 流类型:', stream?.constructor?.name)
      } catch (createError: any) {
        // create() 阶段失败（鉴权、超时、网络、模型不存在等）—— 打印完整错误对象，避免被 formatError 吞掉细节
        console.error('[OpenAISdkProvider.chatStream] 创建请求失败, 耗时(ms):', Date.now() - requestStartAt)
        console.error('[OpenAISdkProvider.chatStream] 错误对象:', {
          name: createError?.name,
          message: createError?.message,
          status: createError?.status,
          code: createError?.code,
          cause: createError?.cause?.message,
          stack: createError?.stack?.split('\n').slice(0, 3).join(' | ')
        })
        throw createError
      }

      let chunkCount = 0
      let lastFinishReason: string | null = null
      console.log('[OpenAISdkProvider.chatStream] 开始遍历流...')

      for await (const chunk of stream) {
        chunkCount++
        // 记录最后一个 chunk 的 finish_reason（验证是否因 length/max_tokens 截断）
        const _fr = chunk.choices?.[0]?.finish_reason
        if (_fr) lastFinishReason = _fr
        // ===== DEBUG: 打印每个 chunk 的原始结构，定位空响应问题 =====
        if (chunkCount <= 3) {
          const _debugDelta = chunk.choices?.[0]?.delta as any
          console.log(
            '[DEBUG chunk#' + chunkCount + '] keys:',
            JSON.stringify(Object.keys(_debugDelta || {})),
            '| finish_reason:',
            chunk.choices?.[0]?.finish_reason,
            '| content:',
            JSON.stringify((_debugDelta?.content || '').substring(0, 30)),
            '| reasoning_content:',
            JSON.stringify((_debugDelta?.reasoning_content || '').substring(0, 30)),
            '| reasoning:',
            JSON.stringify((_debugDelta?.reasoning || '').substring(0, 30))
          )
        }
        // 获取消息 ID
        if (chunk.id && !messageId) {
          messageId = chunk.id
        }

        // 处理思维链内容（reasoning_content）
        // 最强兜底：只要 API 返回了 reasoning_content 字段就解析，不再受
        // shouldParseReasoning/模型名限制 —— 即便能力字段标错也不会丢内容，
        // 从根上避免"内容为 0 一直不返回"。
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

      console.log('[OpenAISdkProvider.chatStream] 流遍历结束, chunk 总数:', chunkCount, ', 最后 finish_reason:', lastFinishReason, ', 内容长度:', fullContent.length, ', 思维链长度:', fullThinkingContent.length, ', 总耗时(ms):', Date.now() - requestStartAt)

      // 空响应检测：流正常结束但一个字都没收到。
      // 常见原因：模型名错误、模型默认走思考但 content 字段为空、API 静默失败。
      // 必须以 error 暴露，否则前端表现为"发了消息一直不返回"。
      if (fullContent.length === 0 && fullThinkingContent.length === 0) {
        const hint = chunkCount === 0
          ? `API 未返回任何数据（chunk 数为 0）。请检查模型名 "${model}" 是否正确、API Key 是否有效、网络是否正常`
          : `API 返回了 ${chunkCount} 个 chunk 但内容为空。模型 "${model}" 可能将回复放在了未识别的字段（如 reasoning_content），或被安全策略拦截`
        console.error('[OpenAISdkProvider.chatStream] 空响应:', hint)
        onEvent({ type: 'error', messageId, error: hint })
        throw new Error(hint)
      }

      onEvent({ type: 'done', messageId })
      return fullContent
    } catch (error: any) {
      // 处理取消请求
      if (error.name === 'AbortError' || error.code === 'aborted') {
        onEvent({ type: 'error', error: '请求已取消' })
        return fullContent
      }

      // 打印完整错误对象，避免被 formatError 压缩成一行后丢失关键定位信息
      console.error('[OpenAISdkProvider.chatStream] 捕获异常:', {
        name: error?.name,
        message: error?.message,
        status: error?.status,
        code: error?.code,
        cause: error?.cause?.message,
        stack: error?.stack?.split('\n').slice(0, 3).join(' | ')
      })

      // 处理 API 错误
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
    const messages = this.buildMessages(context, options)

    try {
      const maxTokens = this.template?.supportedParams?.maxTokens
        ? (options?.maxTokens || this.findModelDefinition(model)?.maxOutputTokens || 8192)
        : undefined
      const response = await this.client.chat.completions.create({
        model,
        messages,
        stream: false,
        max_tokens: maxTokens,
        temperature: this.template?.supportedParams?.temperature
          ? (options?.temperature ?? 0.7)
          : undefined
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
