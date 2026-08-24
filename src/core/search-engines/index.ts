/**
 * 搜索引擎工厂和模板定义
 * @module search-engines/index
 * @description 提供搜索引擎模板和创建搜索引擎实例的工厂函数
 */

import type {
  SearchEngineTemplate,
  SearchEngineType,
  UserSearchEngineConfig,
  WebSearchResponse
} from '@shared/types/search-engine.types'
import { BaseSearchEngine } from './base-search-engine'
import { BaiduSearchEngine } from './baidu-search-engine'
import { BingWebSearchEngine } from './bing-web-search-engine'
import { GoogleWebSearchEngine } from './google-web-search-engine'
import { ZhipuSearchEngine } from './zhipu-search-engine'
import { TavilySearchEngine } from './tavily-search-engine'
import { CustomApiSearchEngine } from './custom-api-search-engine'

/**
 * 搜索引擎模板预定义
 */
export const SEARCH_ENGINE_TEMPLATES: SearchEngineTemplate[] = [
  // ========== 网页抓取型搜索引擎 ==========
  {
    id: 'baidu',
    name: '百度',
    description: '中国最大的搜索引擎，适合中文内容搜索',
    category: 'web-scrape',
    icon: '🔍',
    authConfig: {
      requiresApiKey: false
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 1
  },
  {
    id: 'bing-web',
    name: '必应',
    description: '微软必应搜索引擎，支持中英文搜索',
    category: 'web-scrape',
    icon: '🔎',
    authConfig: {
      requiresApiKey: false
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 2
  },
  {
    id: 'google-web',
    name: 'Google',
    description: '全球最大的搜索引擎，搜索结果丰富',
    category: 'web-scrape',
    icon: '🌐',
    authConfig: {
      requiresApiKey: false
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 3
  },

  // ========== API 型搜索引擎 ==========
  {
    id: 'zhipu',
    name: '智谱 AI',
    description: '智谱 AI 联网搜索，返回结构化结果',
    category: 'api',
    icon: '🤖',
    authConfig: {
      requiresApiKey: true,
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: '请输入智谱 AI API Key',
      requiresExtraConfig: true,
      extraConfigFields: [
        {
          key: 'apiUrl',
          label: 'API 地址',
          type: 'string',
          default: 'https://open.bigmodel.cn/api/paas/v4',
          placeholder: 'https://open.bigmodel.cn/api/paas/v4',
          description: '智谱 AI API 基础地址，默认为官方地址'
        }
      ]
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 10
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: '专为 AI 设计的搜索 API，返回精准结果',
    category: 'api',
    icon: '🔎',
    authConfig: {
      requiresApiKey: true,
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: '请输入 Tavily API Key',
      requiresExtraConfig: true,
      extraConfigFields: [
        {
          key: 'apiUrl',
          label: 'API 地址',
          type: 'string',
          default: 'https://api.tavily.com',
          placeholder: 'https://api.tavily.com',
          description: 'Tavily API 基础地址，默认为官方地址'
        }
      ]
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 11
  },
  {
    id: 'custom-api',
    name: '通用 API 搜索',
    description: '接入任意 OpenAI 兼容搜索 API（Perplexity/Exa/DeepSeek 联网等）——填 API 地址 + Key + 模型名',
    category: 'api',
    icon: '🔌',
    authConfig: {
      requiresApiKey: true,
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: '请输入 API Key',
      requiresExtraConfig: true,
      extraConfigFields: [
        {
          key: 'apiUrl',
          label: 'API 地址',
          type: 'string',
          default: 'https://api.perplexity.ai',
          placeholder: 'https://api.perplexity.ai',
          required: true,
          description: 'OpenAI 兼容 /chat/completions 端点的基础地址（不带 /chat/completions）'
        },
        {
          key: 'model',
          label: '模型名',
          type: 'string',
          default: 'sonar',
          placeholder: 'sonar / sonar-pro / 或服务商提供的搜索模型名',
          description: '该端点用于联网搜索的模型名'
        }
      ]
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: false,
    priority: 12
  },

  // ========== 模型内置搜索 ==========
  {
    id: 'model',
    name: '模型内置',
    description: '使用模型自带的联网搜索功能（如 Perplexity）',
    category: 'model-built-in',
    icon: '🧠',
    authConfig: {
      requiresApiKey: false
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 0
  }
]

/**
 * 获取搜索引擎模板
 * @param templateId - 模板 ID
 * @returns SearchEngineTemplate | undefined
 */
export function getSearchEngineTemplate(templateId: SearchEngineType): SearchEngineTemplate | undefined {
  return SEARCH_ENGINE_TEMPLATES.find(t => t.id === templateId)
}

/**
 * 创建搜索引擎实例
 * @param templateId - 模板 ID
 * @param config - 配置（可选）
 * @returns BaseSearchEngine | null
 */
export function createSearchEngine(
  templateId: SearchEngineType,
  config?: {
    apiKey?: string
    extraConfig?: Record<string, unknown>
    maxResults?: number
  }
): BaseSearchEngine | null {
  switch (templateId) {
    case 'baidu':
      return new BaiduSearchEngine(config)
    case 'bing-web':
      return new BingWebSearchEngine(config)
    case 'google-web':
      return new GoogleWebSearchEngine(config)
    case 'zhipu':
      return new ZhipuSearchEngine(config)
    case 'tavily':
      return new TavilySearchEngine(config)
    case 'custom-api':
      return new CustomApiSearchEngine(config)
    case 'model':
      // 模型内置搜索不需要单独的搜索引擎实例
      return null
    default:
      console.warn(`[createSearchEngine] 未知的搜索引擎类型: ${templateId}`)
      return null
  }
}

/**
 * 执行搜索
 * @param templateId - 模板 ID
 * @param query - 搜索查询词
 * @param config - 用户配置（可选）
 * @param maxResults - 最大结果数
 * @returns Promise<WebSearchResponse>
 */
export async function executeSearch(
  templateId: SearchEngineType,
  query: string,
  config?: UserSearchEngineConfig,
  maxResults?: number
): Promise<WebSearchResponse> {
  const engine = createSearchEngine(templateId, {
    apiKey: config?.apiKey,
    extraConfig: config?.extraConfig,
    maxResults: maxResults || config?.maxResults || 5
  })

  if (!engine) {
    return {
      success: false,
      results: [],
      error: templateId === 'model'
        ? '模型内置搜索需要在聊天时由模型处理'
        : `不支持的搜索引擎类型: ${templateId}`
    }
  }

  return engine.search(query, maxResults || config?.maxResults || 5)
}

/**
 * 判断搜索引擎是否需要 API Key
 * @param templateId - 模板 ID
 * @returns boolean
 */
export function requiresApiKey(templateId: SearchEngineType): boolean {
  const template = getSearchEngineTemplate(templateId)
  return template?.authConfig.requiresApiKey ?? false
}

/**
 * 获取快速搜索引擎列表（不需要配置的）
 * @returns SearchEngineTemplate[]
 */
export function getQuickSearchEngines(): SearchEngineTemplate[] {
  return SEARCH_ENGINE_TEMPLATES.filter(t =>
    t.category === 'web-scrape' && t.id !== 'model'
  ).sort((a, b) => (a.priority || 0) - (b.priority || 0))
}

/**
 * 获取 API 型搜索引擎列表
 * @returns SearchEngineTemplate[]
 */
export function getApiSearchEngines(): SearchEngineTemplate[] {
  return SEARCH_ENGINE_TEMPLATES.filter(t => t.category === 'api')
}

// 导出所有搜索引擎类
export {
  BaseSearchEngine,
  BaiduSearchEngine,
  BingWebSearchEngine,
  GoogleWebSearchEngine,
  ZhipuSearchEngine,
  TavilySearchEngine,
  CustomApiSearchEngine
}