/**
 * AI Provider 基类
 * @module providers/base-provider
 * @description 所有 AI 提供商的基类，定义统一接口
 */

import type { ChatContext, ChatCompletionResponse, ProviderTemplate, UserProviderConfig } from '@shared/types'

/**
 * Provider 配置
 */
export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
}

/**
 * 流式事件回调
 */
export type StreamCallback = (event: {
  type: 'start' | 'delta' | 'done' | 'error' | 'thinking'
  messageId?: string
  content?: string
  /** 思维链内容 */
  thinkingContent?: string
  error?: string
}) => void

/**
 * 聊天选项
 */
export interface ChatOptions {
  /** 启用深度思考 */
  enableThinking?: boolean
  /** 联网搜索上下文（已格式化的搜索结果） */
  webSearchContext?: string
  /** 知识库上下文（已格式化的检索结果） */
  knowledgeContext?: string
  /** 最大生成 token 数 */
  maxTokens?: number
  /** 采样温度（覆盖 provider 默认值；来源通常是角色配置 role.temperature） */
  temperature?: number
  /** 核采样（top_p） */
  topP?: number
  /** Top-K 采样 */
  topK?: number
  /**
   * 结构化输出约束（解码层强制合法 JSON，优于 prompt 约定）。
   * - json_object：保证输出为合法 JSON 对象（顶层必须是 object，数组需自行包装）；
   * - json_schema：按 schema 严格约束字段（strict 模式，仅部分网关/新模型支持）。
   * Provider 不支持该参数时必须降级（去参重试或忽略），禁止让请求直接失败——
   * 调用方始终保留容错解析兜底（见 longwriting-ai.service parseJsonPayload）。
   */
  responseFormat?:
    | { type: 'json_object' }
    | { type: 'json_schema'; name: string; schema: Record<string, unknown> }
}

/**
 * 构建 OpenAI 风格 response_format 请求参数。
 * OpenAI SDK / 兼容网关 / volcengine 共用；Anthropic 无对应参数（由其 provider 忽略）。
 * json_schema 仅透传 name+schema——strict 由 schema 内 additionalSettings 表达，
 * 网关不识别 strict 字段时会忽略，不影响其余字段。
 */
export function buildResponseFormatParam(options?: ChatOptions): Record<string, unknown> | undefined {
  if (!options?.responseFormat) return undefined
  if (options.responseFormat.type === 'json_object') return { type: 'json_object' }
  return { type: 'json_schema', json_schema: { name: options.responseFormat.name, schema: options.responseFormat.schema } }
}

/**
 * 判定是否为"端点不认识 response_format 参数"类错误（400/422 或报文含相关关键字），
 * 命中则去掉该参数重试一次。鉴权/网络/超时类错误不重试（重试也会同样失败）。
 */
export function isResponseFormatUnsupportedError(error: unknown): boolean {
  const e = error as { status?: number; message?: string } | null
  if (!e) return false
  if (e.status === 400 || e.status === 422) return true
  const msg = String(e.message || '')
  return /response_format|json_schema|json mode|unsupported (parameter|param)|invalid (parameter|param)/i.test(msg)
}

/**
 * Provider 基类
 * 所有 AI 提供商必须继承此类并实现其方法
 */
export abstract class BaseProvider {
  protected config: ProviderConfig
  protected template?: ProviderTemplate
  protected userConfig?: UserProviderConfig

  constructor(config: ProviderConfig, template?: ProviderTemplate, userConfig?: UserProviderConfig) {
    this.config = config
    this.template = template
    this.userConfig = userConfig
  }

  /**
   * 获取提供商标识
   * @returns string
   */
  abstract get id(): string

  /**
   * 获取提供商名称
   * @returns string
   */
  abstract get name(): string

  /**
   * 获取支持的模型列表
   * @returns Promise<Model[]>
   */
  abstract getModels(): Promise<Array<{
    id: string
    name: string
    maxTokens: number
    contextWindow: number
  }>>

  /**
   * 流式聊天
   * @param context - 对话上下文
   * @param onDelta - 增量回调
   * @param signal - 中断信号（可选）
   * @returns Promise<string> - 完整响应
   * @description 流式调用 AI 接口
   * 逻辑：
   * 1. 构建 API 请求（stream: true）
   * 2. 发送请求
   * 3. 解析 SSE 响应
   * 4. 每收到 token 调用 onDelta
   * 5. 检查 signal 是否中断
   * 6. 返回完整响应
   */
  abstract chat(
    context: ChatContext,
    onDelta: (content: string) => void,
    signal?: AbortSignal,
    options?: ChatOptions
  ): Promise<string>

  /**
   * 流式聊天（带完整事件）
   * @param context - 对话上下文
   * @param onEvent - 事件回调
   * @param signal - 中断信号
   * @param options - 聊天选项（深度思考、联网搜索等）
   * @returns Promise<string>
   */
  abstract chatStream(
    context: ChatContext,
    onEvent: StreamCallback,
    signal?: AbortSignal,
    options?: ChatOptions
  ): Promise<string>

  /**
   * 非流式聊天
   * @param context - 对话上下文
   * @param options - 聊天选项（maxTokens/temperature 等）
   * @returns Promise<ChatCompletionResponse>
   */
  abstract chatSync(context: ChatContext, options?: ChatOptions): Promise<ChatCompletionResponse>

  /**
   * 测试连接
   * @returns Promise<{ success: boolean, message: string }>
   * @description 测试 API 密钥是否有效
   */
  abstract testConnection(): Promise<{ success: boolean, message: string }>

  /**
   * 构建请求头
   * @returns Record<string, string>
   */
  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // 如果有模板配置，使用模板的认证方式
    if (this.template) {
      const { authType, authHeader, authPrefix, defaultHeaders } = this.template.apiConfig
      const apiKey = this.config.apiKey

      // 添加默认请求头
      if (defaultHeaders) {
        Object.assign(headers, defaultHeaders)
      }

      // 添加自定义请求头
      if (this.userConfig?.customHeaders) {
        Object.assign(headers, this.userConfig.customHeaders)
      }

      // 根据认证类型添加认证头
      switch (authType) {
        case 'bearer':
          headers[authHeader] = `${authPrefix || 'Bearer '}${apiKey}`
          break
        case 'api-key':
          headers[authHeader] = apiKey
          break
        case 'none':
          // 无需认证
          break
      }
    } else {
      // 默认使用 Bearer 认证
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }

    return headers
  }

  /**
   * 构建基础 URL
   * @param endpoint - 端点路径
   * @returns string
   */
  protected buildUrl(endpoint: string): string {
    // 优先使用用户配置的 baseUrl，然后是模板的 baseUrl，最后是默认值
    let baseUrl = this.config.baseUrl
    if (!baseUrl && this.template) {
      baseUrl = this.template.apiConfig.baseUrl
    }
    if (!baseUrl) {
      baseUrl = this.getDefaultBaseUrl()
    }
    return BaseProvider.joinUrl(baseUrl, endpoint)
  }

  /**
   * baseUrl + endpoint 规整拼接（模型列表 404 的常见根因）：
   * 用户 baseUrl 常已含版本段（如 vLLM/OneAPI 填 http://host:8000/v1），
   * 模板 endpoint 又是 /v1/models → 拼出 /v1/v1/models 404。
   * 版本段去重只作用于两侧都带 /vN 的情况；/v1beta 等其它前缀不受影响。
   */
  static joinUrl(baseUrl: string, endpoint: string): string {
    const base = baseUrl.replace(/\/+$/, '')
    const versionOverlap = /^\/(v\d+)\//.exec(endpoint)
    if (versionOverlap && base.endsWith('/' + versionOverlap[1])) {
      // 两侧同版本段：只保留 baseUrl 的一份
      return base + endpoint.slice(versionOverlap[0].length - 1)
    }
    return base + endpoint
  }

  /**
   * 获取聊天端点
   */
  protected getChatEndpoint(): string {
    if (this.template) {
      return this.template.apiConfig.chatEndpoint
    }
    return '/v1/chat/completions'
  }

  /**
   * 获取默认 API 基础 URL
   * @returns string
   */
  protected abstract getDefaultBaseUrl(): string
}
