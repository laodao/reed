/**
 * Provider相关类型定义
 * @module types/provider.types
 */

/**
 * 模型信息
 */
export interface Model {
  id: string
  provider: string
  providerName: string
  name: string
  description?: string
  maxTokens: number
  contextWindow: number
  features: string[]
}

/**
 * 提供商信息
 */
export interface Provider {
  id: string
  name: string
  configured: boolean
  models: Model[]
}

/**
 * 提供商列表响应
 */
export interface ListProvidersResponse {
  success: boolean
  providers: Provider[]
}

/**
 * 获取模型列表响应
 */
export interface GetModelsResponse {
  success: boolean
  models: Model[]
}

/**
 * 测试提供商响应
 */
export interface TestProviderResponse {
  success: boolean
  message: string
}

/**
 * 聊天完成请求
 */
export interface ChatCompletionRequest {
  model: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  stream?: boolean
  maxTokens?: number
  temperature?: number
}

/**
 * 聊天完成响应（非流式）
 */
export interface ChatCompletionResponse {
  success: boolean
  content?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  error?: string
}

/**
 * 预定义的提供商列表
 */
export const PROVIDERS = [
  {
    id: 'qwen',
    name: '通义千问',
    apiBaseUrl: 'https://dashscope.aliyuncs.com/api/v1'
  },
  {
    id: 'doubao',
    name: '豆包',
    apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3'
  },
  {
    id: 'glm',
    name: 'GLM',
    apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiBaseUrl: 'https://api.deepseek.com/v1'
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    apiBaseUrl: 'https://open.volcengineapi.com/api/v3'
  }
] as const
