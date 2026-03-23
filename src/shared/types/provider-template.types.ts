/**
 * 提供商模板类型定义
 * @module types/provider-template.types
 * @description 定义 AI 提供商模板和用户配置的类型
 */

/**
 * API 认证类型
 */
export type AuthType = 'bearer' | 'api-key' | 'query' | 'none' | 'custom' | 'access-key'

/**
 * 请求格式类型
 */
export type RequestFormat = 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom' | 'volcengine'

/**
 * 模板分类
 */
export type TemplateCategory = 'openai-compatible' | 'anthropic' | 'google' | 'ollama' | 'image' | 'custom'

/**
 * 提供商能力
 */
export type ProviderCapability = 'chat' | 'image' | 'embedding'

/**
 * 自定义参数定义
 */
export interface CustomParamDefinition {
  /** 参数键名 */
  key: string
  /** 显示标签 */
  label: string
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'select'
  /** 选项（仅 type 为 select 时有效） */
  options?: string[]
  /** 默认值 */
  default?: string | number | boolean
  /** 是否必填 */
  required?: boolean
  /** 参数描述 */
  description: string
}

/**
 * 模型类型
 */
export type ModelType = 'text' | 'image' | 'video' | 'audio' | 'multimodal' | 'embedding' | 'rerank'

/**
 * 模型定义
 */
export interface ModelDefinition {
  /** 模型 ID */
  id: string
  /** 模型名称 */
  name: string
  /** 模型类型（文本/图片/视频/音频/多模态） */
  type?: ModelType
  /** 上下文窗口大小 */
  contextWindow: number
  /** 最大输出 token 数 */
  maxOutputTokens: number
  /** 支持的特性 */
  features: string[] // ['chat', 'vision', 'function-calling', 'streaming']
  /** 是否支持深度思考（如 DeepSeek R1、OpenAI o1 等） */
  supportsThinking?: boolean
  /** 是否内置联网搜索（如 Perplexity sonar 等） */
  supportsWebSearch?: boolean
  /** 是否支持使用工具/函数调用 */
  supportsTools?: boolean
  /** 输入价格（每百万 token，美元） */
  inputPrice?: number
  /** 输出价格（每百万 token，美元） */
  outputPrice?: number
}

/**
 * API 配置模板
 */
export interface ApiConfigTemplate {
  /** 基础 URL（用于文本对话） */
  baseUrl: string
  /** 图像生成基础 URL（如果与对话不同） */
  imageBaseUrl?: string
  /** 图像生成端点路径（追加到 imageBaseUrl 后面） */
  imageEndpoint?: string
  /** 图像任务查询端点路径 */
  imageTaskEndpoint?: string
  /** 视频生成基础 URL */
  videoBaseUrl?: string
  /** 语音生成基础 URL */
  audioBaseUrl?: string
  /** 管控面基础 URL（用于模型列表等管理功能，如火山引擎） */
  managementBaseUrl?: string
  /** 认证类型 */
  authType: AuthType
  /** 认证头名称 */
  authHeader: string // 'Authorization' | 'X-API-Key' | 'key' 等
  /** 认证值前缀 */
  authPrefix?: string // 'Bearer ' | '' 等
  /** 请求格式 */
  requestFormat: RequestFormat
  /** 聊天端点 */
  chatEndpoint: string
  /** 模型列表端点 */
  modelsEndpoint?: string
  /** 默认请求头 */
  defaultHeaders?: Record<string, string>
  /** 查询参数中的 API 密钥名称（仅 authType 为 query 时有效） */
  queryAuthKey?: string
  /** 是否需要 Access Key 来获取模型列表（如火山引擎） */
  requiresAccessKeyForModels?: boolean
  /** 图像生成认证类型（如果与对话不同） */
  imageAuthType?: AuthType
}

/**
 * 提供商模板
 */
export interface ProviderTemplate {
  /** 模板 ID */
  id: string
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 模板分类 */
  category: TemplateCategory
  /** 提供商能力 */
  capabilities: ProviderCapability[]
  /** 图标（emoji 或 URL） */
  icon?: string
  /** API 配置 */
  apiConfig: ApiConfigTemplate
  /** 图像生成参数配置 */
  imageParams?: CustomParamDefinition[]
  /** 支持的参数 */
  supportedParams: {
    /** 是否支持流式 */
    stream: boolean
    /** 是否支持温度参数 */
    temperature: boolean
    /** 是否支持最大 token 数 */
    maxTokens: boolean
    /** 是否支持 top_p */
    topP: boolean
    /** 是否支持 top_k */
    topK?: boolean
    /** 自定义参数 */
    custom: CustomParamDefinition[]
  }
  /** 预定义模型列表 */
  models: ModelDefinition[]
  /** 是否允许自定义模型 */
  allowCustomModels: boolean
  /** 是否为官方模板 */
  isOfficial?: boolean
}

/**
 * 用户提供商配置
 */
export interface UserProviderConfig {
  /** 配置 ID（系统生成） */
  id: string
  /** 用户自定义 ID（短标识符，用于显示，如 'deepseek', 'openai'） */
  shortId?: string
  /** 关联的模板 ID */
  templateId: string
  /** 用户自定义名称 */
  name: string
  /** API 密钥（加密存储） */
  apiKey?: string
  /** Access Key ID（用于火山引擎等需要签名认证的平台） */
  accessKeyId?: string
  /** Access Key Secret（加密存储，用于火山引擎等需要签名认证的平台） */
  accessKeySecret?: string
  /** 覆盖默认端点（用于文本对话） */
  baseUrl?: string
  /** 图像生成 API 端点（如果与文本对话不同） */
  imageBaseUrl?: string
  /** 视频生成 API 端点 */
  videoBaseUrl?: string
  /** 语音生成 API 端点 */
  audioBaseUrl?: string
  /** 自定义请求头 */
  customHeaders?: Record<string, string>
  /** 自定义参数 */
  customParams?: Record<string, unknown>
  /** 用户启用的所有模型 */
  models?: ModelDefinition[]
  /** 是否启用 */
  isEnabled: boolean
  /** 是否为默认提供商 */
  isDefault: boolean
  /** 上次测试时间 */
  lastTested?: string
  /** 测试结果 */
  testResult?: 'success' | 'failed' | 'unknown'
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/**
 * IPC 响应类型 - 模板列表
 */
export interface ProviderTemplateListResponse {
  success: boolean
  templates?: ProviderTemplate[]
  error?: string
}

/**
 * IPC 响应类型 - 配置列表
 */
export interface ProviderConfigListResponse {
  success: boolean
  configs?: UserProviderConfig[]
  error?: string
}

/**
 * IPC 响应类型 - 测试配置
 */
export interface TestProviderConfigResponse {
  success: boolean
  message: string
  models?: ModelDefinition[]
}

/**
 * IPC 响应类型 - 单个配置
 */
export interface ProviderConfigResponse {
  success: boolean
  config?: UserProviderConfig
  error?: string
}

/**
 * 创建/更新配置请求
 */
export interface SaveProviderConfigRequest {
  templateId: string
  name: string
  shortId?: string
  apiKey?: string
  accessKeyId?: string
  accessKeySecret?: string
  baseUrl?: string
  imageBaseUrl?: string
  videoBaseUrl?: string
  audioBaseUrl?: string
  customHeaders?: Record<string, string>
  customParams?: Record<string, unknown>
  /** 用户启用的所有模型 */
  models?: ModelDefinition[]
  isEnabled?: boolean
  isDefault?: boolean
}

/**
 * 测试配置请求
 */
export interface TestProviderConfigRequest {
  configId?: string
  // 或者直接测试（未保存的配置）
  templateId?: string
  apiKey?: string
  accessKeyId?: string
  accessKeySecret?: string
  baseUrl?: string
}
