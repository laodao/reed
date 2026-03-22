/**
 * 火山引擎 SDK Provider
 * @module providers/sdk/volcengine-sdk-provider
 * @description 使用火山引擎 API 实现豆包模型调用和模型列表获取
 */

import * as crypto from 'crypto'
import OpenAI from 'openai'
import { BaseProvider, ProviderConfig, StreamCallback, ChatOptions } from '../base-provider'
import type {
  ChatContext,
  ChatCompletionResponse,
  ProviderTemplate,
  UserProviderConfig,
  ModelDefinition
} from '../../../shared/types'

/**
 * 火山引擎 API 签名配置
 */
interface VolcEngineSignatureConfig {
  accessKeyId: string
  accessKeySecret: string
  region: string
  service: string
}

/**
 * 火山引擎 SDK Provider
 *
 * 使用火山引擎 API 实现豆包模型调用。
 * - 对话使用数据面 API（OpenAI 兼容格式）
 * - 模型列表获取使用管控面 API（需要 Access Key 签名）
 */
export class VolcEngineSdkProvider extends BaseProvider {
  private client: OpenAI
  private providerId: string
  private providerName: string
  private defaultBaseUrl: string
  private managementBaseUrl: string
  private accessKeyId?: string
  private accessKeySecret?: string
  private actualBaseUrl: string // 实际使用的 baseUrl

  constructor(
    config: ProviderConfig,
    providerId: string,
    providerName: string,
    defaultBaseUrl: string,
    managementBaseUrl: string,
    template?: ProviderTemplate,
    userConfig?: UserProviderConfig
  ) {
    super(config, template, userConfig)
    this.providerId = providerId
    this.providerName = providerName
    this.defaultBaseUrl = defaultBaseUrl
    this.managementBaseUrl = managementBaseUrl

    // Access Key 用于获取模型列表
    this.accessKeyId = userConfig?.accessKeyId
    this.accessKeySecret = userConfig?.accessKeySecret

    // 数据面 API URL（用于对话）
    // 如果用户配置了自定义 baseUrl，使用用户的；否则使用默认的数据面 API
    this.actualBaseUrl = config.baseUrl || defaultBaseUrl

    console.log('[VolcEngineSdkProvider] 初始化:')
    console.log('  - providerId:', providerId)
    console.log('  - 数据面 API (对话):', this.actualBaseUrl)
    console.log('  - 管控面 API (模型列表):', this.managementBaseUrl)
    console.log('  - apiKey 前缀:', config.apiKey?.substring(0, 8) + '***')
    console.log('  - 预期对话 URL:', this.actualBaseUrl + '/chat/completions')

    // 初始化 OpenAI SDK 客户端（用于对话）
    // OpenAI SDK 会在 baseURL 后面追加 /chat/completions
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: this.actualBaseUrl
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
   * 使用火山引擎管控面 API，需要 Access Key 签名认证
   * 获取火山引擎提供的基础模型列表
   */
  async getModels(): Promise<Array<{ id: string; name: string; maxTokens: number; contextWindow: number }>> {
    // 如果没有 Access Key，返回空数组
    if (!this.accessKeyId || !this.accessKeySecret) {
      console.warn('[VolcEngineSdkProvider] 获取模型列表需要 Access Key，请在配置中提供')
      return []
    }

    try {
      console.log('[VolcEngineSdkProvider] 开始获取基础模型列表...', {
        accessKeyId: this.accessKeyId.substring(0, 4) + '***',
        hasSecret: !!this.accessKeySecret
      })

      const response = await this.listFoundationModels({
        accessKeyId: this.accessKeyId,
        accessKeySecret: this.accessKeySecret,
        region: 'cn-beijing',
        service: 'ark'
      })

      console.log('[VolcEngineSdkProvider] ListFoundationModels 响应:', JSON.stringify(response, null, 2))

      const models: Array<{ id: string; name: string; maxTokens: number; contextWindow: number }> = []

      if (response.Result?.Items) {
        for (const item of response.Result.Items) {
          models.push({
            id: item.Name,  // 基础模型名称，如 Doubao-pro-32k，用于API调用
            name: item.DisplayName || item.Name,  // 显示名称
            maxTokens: 4096,
            contextWindow: 128000
          })
        }
      }

      console.log(`[VolcEngineSdkProvider] 获取到 ${models.length} 个基础模型`)
      return models
    } catch (error) {
      console.error('[VolcEngineSdkProvider] 获取模型列表失败:', error)
      throw error
    }
  }

  /**
   * 调用火山引擎管控面 API 获取基础模型列表
   */
  private async listFoundationModels(config: VolcEngineSignatureConfig): Promise<any> {
    const method = 'POST'
    const action = 'ListFoundationModels'
    const version = '2024-01-01'

    // 火山引擎方舟平台 API 网关地址
    const apiHost = 'ark.cn-beijing.volcengineapi.com'
    const url = new URL(`https://${apiHost}/?Action=${action}&Version=${version}`)

    // 请求体（带分页参数，与官方示例一致）
    const body = JSON.stringify({
      PageNumber: 1,
      PageSize: 100,
      SortBy: "CreateTime",
      SortOrder: "Desc"
    })

    const response = await this.signedRequest(config, apiHost, url, body)
    return response
  }

  /**
   * 调用火山引擎管控面 API 获取推理接入点列表
   */
  private async listEndpoints(config: VolcEngineSignatureConfig): Promise<any> {
    const method = 'POST'
    const action = 'ListEndpoints'
    const version = '2024-01-01'

    // 火山引擎统一 API 网关地址
    const apiHost = 'open.volcengineapi.com'
    const url = new URL(`https://${apiHost}/?Action=${action}&Version=${version}`)

    // 请求体（带分页参数）
    const body = JSON.stringify({
      PageNumber: 1,
      PageSize: 100
    })

    const response = await this.signedRequest(config, apiHost, url, body)
    return response
  }

  /**
   * 发送签名请求
   */
  private async signedRequest(
    config: VolcEngineSignatureConfig,
    apiHost: string,
    url: URL,
    body: string
  ): Promise<any> {
    const method = 'POST'

    // 生成时间戳
    const now = new Date()
    const xDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const shortDate = xDate.substring(0, 8)

    // 计算 body hash
    const bodyHash = crypto.createHash('sha256').update(body).digest('hex')

    // 构建规范化请求
    const canonicalHeaders = [
      `host:${apiHost}`,
      `x-content-sha256:${bodyHash}`,
      `x-date:${xDate}`
    ].join('\n')

    const signedHeaders = 'host;x-content-sha256;x-date'

    const canonicalRequest = [
      method,
      url.pathname,
      url.search.substring(1),
      canonicalHeaders,
      '',
      signedHeaders,
      bodyHash
    ].join('\n')

    // 构建待签名字符串
    const algorithm = 'HMAC-SHA256'
    const credentialScope = `${shortDate}/${config.region}/${config.service}/request`
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex')

    const stringToSign = [
      algorithm,
      xDate,
      credentialScope,
      canonicalRequestHash
    ].join('\n')

    // 计算签名
    const kDate = crypto.createHmac('sha256', config.accessKeySecret).update(shortDate).digest()
    const kRegion = crypto.createHmac('sha256', kDate).update(config.region).digest()
    const kService = crypto.createHmac('sha256', kRegion).update(config.service).digest()
    const kSigning = crypto.createHmac('sha256', kService).update('request').digest()
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

    // 构建授权头
    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    // 发送请求
    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Host': apiHost,
        'X-Date': xDate,
        'X-Content-Sha256': bodyHash,
        'Authorization': authorization
      },
      body
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    return response.json()
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

    throw new Error('未指定模型，请在配置中选择一个模型')
  }

  /**
   * 构建消息列表
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

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      })
    }

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
    signal?: AbortSignal,
    options?: ChatOptions
  ): Promise<string> {
    return this.chatStream(
      context,
      (event) => {
        if (event.type === 'delta' && event.content) {
          onDelta(event.content)
        }
      },
      signal,
      options
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
    console.log('[VolcEngineSdkProvider.chatStream] ========== 发送对话请求 ==========')
    console.log('[VolcEngineSdkProvider.chatStream] 数据面 API baseUrl:', this.actualBaseUrl)
    console.log('[VolcEngineSdkProvider.chatStream] 完整请求 URL:', this.actualBaseUrl + '/chat/completions')
    console.log('[VolcEngineSdkProvider.chatStream] 使用的模型:', model)
    console.log('[VolcEngineSdkProvider.chatStream] 消息数量:', context.messages.length)
    console.log('[VolcEngineSdkProvider.chatStream] apiKey 前缀:', this.client.apiKey?.substring(0, 8) + '***')
    const messages = this.buildMessages(context, options)

    let fullContent = ''
    let messageId = ''

    try {
      onEvent({ type: 'start' })

      const stream = await this.client.chat.completions.create(
        {
          model,
          messages,
          stream: true,
          max_tokens: 4096,
          temperature: 0.7
        },
        {
          signal
        }
      )

      for await (const chunk of stream) {
        if (chunk.id && !messageId) {
          messageId = chunk.id
        }

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
      console.error('[VolcEngineSdkProvider.chatStream] 请求失败:', error)
      console.error('[VolcEngineSdkProvider.chatStream] 错误详情:', {
        message: error.message,
        status: error.status,
        code: error.code,
        error: error.error
      })

      if (error.name === 'AbortError' || error.code === 'aborted') {
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
      const response = await this.client.chat.completions.create({
        model,
        messages,
        stream: false,
        max_tokens: 4096,
        temperature: 0.7
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
      // 如果有 Access Key，尝试获取模型列表
      if (this.accessKeyId && this.accessKeySecret) {
        try {
          const models = await this.getModels()
          if (models.length > 0) {
            return {
              success: true,
              message: `连接成功，发现 ${models.length} 个模型`
            }
          }
          return {
            success: true,
            message: '连接成功，但未发现模型'
          }
        } catch (modelError) {
          console.error('获取模型列表失败:', modelError)
          return {
            success: false,
            message: `获取模型列表失败: ${modelError instanceof Error ? modelError.message : String(modelError)}`
          }
        }
      }

      // 否则尝试发送简单请求测试 API Key
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
    if (error.error?.message) {
      const message = error.error.message

      // 火山引擎特定错误处理
      if (error.error?.code === 'InvalidEndpointOrModel.NotFound') {
        return `模型或接入点不存在。请在火山引擎控制台创建推理接入点，并确保使用正确的接入点 ID（如：doubao-seed-2-0-lite-260215）。错误详情：${message}`
      }

      return message
    }

    if (error.status) {
      return `API 错误 (${error.status}): ${error.message || '未知错误'}`
    }

    return error.message || '未知错误'
  }
}