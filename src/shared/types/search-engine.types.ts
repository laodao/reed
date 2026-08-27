/**
 * 搜索引擎类型定义
 * @module types/search-engine.types
 * @description 定义搜索引擎模板和用户配置的类型
 */

/**
 * 搜索引擎类型枚举
 */
export type SearchEngineType =
  | 'baidu'       // 百度 - 网页抓取
  | 'bing-web'    // 必应网页抓取
  | 'google-web'  // Google 网页抓取
  | 'zhipu'       // 智谱 AI - API
  | 'tavily'      // Tavily - API
  | 'perplexity'  // Perplexity - API（OpenAI 兼容）
  | 'deepseek-web'// DeepSeek 联网 - API（OpenAI 兼容）
  | 'bocha'       // 博查 AI 搜索 - API
  | 'bing-api'    // 必应 Web Search API（Azure） - API
  | 'google-cse'  // Google Custom Search JSON API - API
  | 'searxng'     // SearXNG - 自托管（无需 API Key）
  | 'model'       // 模型内置搜索
  | 'custom-api'  // 自定义搜索引擎（OpenAI 兼容 /chat/completions；可配置 URL/Key/模型）

/**
 * 搜索引擎分类
 */
export type SearchEngineCategory = 'web-scrape' | 'api' | 'model-built-in'

/**
 * 搜索引擎认证配置
 */
export interface SearchEngineAuthConfig {
  /** 是否需要 API Key */
  requiresApiKey: boolean
  /** API Key 输入提示 */
  apiKeyLabel?: string
  /** API Key 输入占位符 */
  apiKeyPlaceholder?: string
  /** 是否需要额外配置 */
  requiresExtraConfig?: boolean
  /** 额外配置字段 */
  extraConfigFields?: SearchEngineExtraConfigField[]
}

/**
 * 搜索引擎额外配置字段
 */
export interface SearchEngineExtraConfigField {
  /** 字段键名 */
  key: string
  /** 显示标签 */
  label: string
  /** 字段类型 */
  type: 'string' | 'number' | 'boolean' | 'select'
  /** 选项（仅 type 为 select 时有效） */
  options?: string[]
  /** 默认值 */
  default?: string | number | boolean
  /** 是否必填 */
  required?: boolean
  /** 占位符 */
  placeholder?: string
  /** 字段描述 */
  description?: string
}

/**
 * 搜索引擎模板
 */
export interface SearchEngineTemplate {
  /** 模板 ID */
  id: SearchEngineType
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 搜索引擎分类 */
  category: SearchEngineCategory
  /** 图标（emoji 或 URL） */
  icon?: string
  /** 认证配置 */
  authConfig: SearchEngineAuthConfig
  /** 默认最大结果数 */
  defaultMaxResults: number
  /** 最大结果数上限 */
  maxResultsLimit: number
  /** 是否为官方模板 */
  isOfficial?: boolean
  /** 搜索引擎优先级（用于排序） */
  priority?: number
}

/**
 * 用户搜索引擎配置
 */
export interface UserSearchEngineConfig {
  /** 配置 ID（系统生成） */
  id: string
  /** 关联的模板 ID */
  templateId: SearchEngineType
  /** 用户自定义名称 */
  name: string
  /** API 密钥（加密存储） */
  apiKey?: string
  /** 额外配置参数 */
  extraConfig?: Record<string, unknown>
  /** 最大结果数 */
  maxResults: number
  /** 是否启用 */
  isEnabled: boolean
  /** 是否为默认搜索引擎 */
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
 * 网页搜索结果项
 */
export interface WebSearchResultItem {
  /** 结果标题 */
  title: string
  /** 结果链接 */
  url: string
  /** 结果摘要 */
  snippet: string
  /** 来源搜索引擎 */
  source: SearchEngineType
  /** 来源显示名称 */
  sourceName?: string
  /** 相关性分数（可选） */
  score?: number
}

/**
 * 网页搜索响应
 */
export interface WebSearchResponse {
  /** 是否成功 */
  success: boolean
  /** 搜索结果列表 */
  results: WebSearchResultItem[]
  /** 错误信息 */
  error?: string
  /** 搜索耗时（毫秒） */
  duration?: number
  /** 搜索查询词 */
  query?: string
}

/**
 * IPC 响应类型 - 模板列表
 */
export interface SearchEngineTemplateListResponse {
  success: boolean
  templates?: SearchEngineTemplate[]
  error?: string
}

/**
 * IPC 响应类型 - 配置列表（统一 { success, data, error } 契约）
 */
export interface SearchEngineConfigListResponse {
  success: boolean
  data?: UserSearchEngineConfig[]
  error?: string
}

/**
 * IPC 响应类型 - 单个配置
 */
export interface SearchEngineConfigResponse {
  success: boolean
  config?: UserSearchEngineConfig
  error?: string
}

/**
 * IPC 响应类型 - 测试配置
 */
export interface TestSearchEngineConfigResponse {
  success: boolean
  message: string
}

/**
 * 创建/更新配置请求
 */
export interface SaveSearchEngineConfigRequest {
  templateId: SearchEngineType
  name: string
  apiKey?: string
  extraConfig?: Record<string, unknown>
  maxResults?: number
  isEnabled?: boolean
  isDefault?: boolean
}

/**
 * 测试配置请求
 */
export interface TestSearchEngineConfigRequest {
  configId?: string
  // 或者直接测试（未保存的配置）
  templateId?: SearchEngineType
  apiKey?: string
  extraConfig?: Record<string, unknown>
}

/**
 * 执行搜索请求
 */
export interface ExecuteSearchRequest {
  /** 搜索查询词 */
  query: string
  /** 搜索引擎类型 */
  engine: SearchEngineType
  /** 用户配置 ID（API 型引擎需要） */
  configId?: string
  /** 最大结果数 */
  maxResults?: number
}

/**
 * 搜索引擎配置 ID（用于前端传递）
 * 快速搜索引擎使用模板 ID，配置型引擎使用配置 ID
 */
export type SearchEngineConfigId = SearchEngineType | string

/**
 * 联网搜索配置（用于发送消息时）
 */
export interface WebSearchConfig {
  /** 是否启用联网搜索 */
  enabled: boolean
  /** 搜索引擎类型 */
  engine: SearchEngineType
  /** 搜索引擎配置 ID（快速搜索使用模板 ID，配置型使用用户配置 ID） */
  configId?: SearchEngineConfigId
}