/**
 * 火山引擎 SDK Provider
 * @module providers/sdk/volcengine-sdk-provider
 * @description 使用火山引擎 API 实现豆包模型调用和模型列表获取
 */

import * as crypto from 'crypto'
import OpenAI from 'openai'
import { BaseProvider, ProviderConfig, StreamCallback } from '../base-provider'
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

    // 初始化 OpenAI SDK 客户端（用于对话）
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
   * 使用火山引擎管控面 API，需要 Access Key 签名认证
   */
  async getModels(): Promise<Array<{ id: string; name: string; maxTokens: number; contextWindow: number }>> {
    // 如果没有 Access Key，返回空数组
    if (!this.accessKeyId || !this.accessKeySecret) {
      console.warn('火山引擎获取模型列表需要 Access Key，请在配置中提供')
      return []
    }

    try {
      console.log('开始获取火山引擎模型列表...', {
        accessKeyId: this.accessKeyId.substring(0, 4) + '***',
        hasSecret: !!this.accessKeySecret
      })

      const response = await this.listFoundationModels({
        accessKeyId: this.accessKeyId,
        accessKeySecret: this.accessKeySecret,
        region: 'cn-beijing',
        service: 'ark'
      })

      console.log('火山引擎 API 响应:', JSON.stringify(response, null, 2))

      if (response.Result?.Items) {
        return response.Result.Items.map((item: any) => ({
          id: item.Name,
          name: item.DisplayName || item.Name,
          maxTokens: 4096,
          contextWindow: 128000
        }))
      }

      return []
    } catch (error) {
      console.error('获取火山引擎模型列表失败:', error)
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

    // 火山引擎统一 API 网关地址
    const apiHost = 'open.volcengineapi.com'
    const url = new URL(`https://${apiHost}/?Action=${action}&Version=${version}`)

    // 请求体（空对象即可，不需要分页参数）
    const body = JSON.stringify({})

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
  private buildMessages(context: ChatContext): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

    if (context.systemPrompt) {
      messages.push({
        role: 'system',
        content: context.systemPrompt
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
      return error.error.message
    }

    if (error.status) {
      return `API 错误 (${error.status}): ${error.message || '未知错误'}`
    }

    return error.message || '未知错误'
  }
}