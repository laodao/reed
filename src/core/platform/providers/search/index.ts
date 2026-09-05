/**
 * 搜索引擎工厂和模板定义
 * @module platform/providers/search/index
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
import { PerplexitySearchEngine, DeepSeekWebSearchEngine } from './openai-compat-preset-search-engine'
import { BochaSearchEngine } from './bocha-search-engine'
import { BingApiSearchEngine } from './bing-api-search-engine'
import { GoogleCseSearchEngine } from './google-cse-search-engine'
import { SearxngSearchEngine } from './searxng-search-engine'

/**
 * 搜索引擎模板预定义
 */
export const SEARCH_ENGINE_TEMPLATES: SearchEngineTemplate[] = [
  // ========== 网页抓取型搜索引擎 ==========
  {
    id: 'baidu',
    siteUrl: 'https://www.baidu.com',
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
    siteUrl: 'https://www.bing.com',
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
    siteUrl: 'https://www.google.com',
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
    siteUrl: 'https://www.zhipuai.cn',
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
    siteUrl: 'https://tavily.com',
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
    id: 'perplexity',
    siteUrl: 'https://www.perplexity.ai',
    name: 'Perplexity',
    description: 'Perplexity 联网搜索（sonar-pro），OpenAI 兼容接口',
    category: 'api',
    icon: '✨',
    authConfig: {
      requiresApiKey: true,
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: '请输入 Perplexity API Key',
      requiresExtraConfig: true,
      extraConfigFields: [
        {
          key: 'apiUrl',
          label: 'API 地址',
          type: 'string',
          default: 'https://api.perplexity.ai',
          placeholder: 'https://api.perplexity.ai',
          description: 'Perplexity API 基础地址，默认为官方地址'
        },
        {
          key: 'model',
          label: '模型名',
          type: 'string',
          default: 'sonar-pro',
          placeholder: 'sonar / sonar-pro / sonar-reasoning-pro',
          description: '用于联网搜索的模型名'
        }
      ]
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 12
  },
  {
    id: 'deepseek-web',
    siteUrl: 'https://www.deepseek.com',
    name: 'DeepSeek（模型生成）',
    description: '用 DeepSeek 模型生成搜索结果。注意：模型无实时联网能力，只会依据训练知识作答，返回的链接可能是模型编造、不准确——请谨慎使用并二次核实（非真实联网搜索）',
    category: 'api',
    icon: '🐋',
    authConfig: {
      requiresApiKey: true,
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: '请输入 DeepSeek API Key',
      requiresExtraConfig: true,
      extraConfigFields: [
        {
          key: 'apiUrl',
          label: 'API 地址',
          type: 'string',
          default: 'https://api.deepseek.com',
          placeholder: 'https://api.deepseek.com',
          description: 'DeepSeek API 基础地址，默认为官方地址'
        },
        {
          key: 'model',
          label: '模型名',
          type: 'string',
          default: 'deepseek-chat',
          placeholder: 'deepseek-chat / deepseek-reasoner',
          description: '用于生成的模型名'
        }
      ]
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 13
  },
  {
    id: 'bocha',
    siteUrl: 'https://www.bochaai.com',
    name: '博查 AI 搜索',
    description: '博查 AI 联网搜索 API，中文搜索质量高',
    category: 'api',
    icon: '🍵',
    authConfig: {
      requiresApiKey: true,
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: '请输入博查 API Key',
      requiresExtraConfig: false
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 14
  },
  {
    id: 'searxng',
    siteUrl: 'https://docs.searxng.org',
    name: 'SearXNG',
    description: '自托管元搜索引擎，无需 API Key（需配置实例地址）',
    category: 'api',
    icon: '🧭',
    authConfig: {
      requiresApiKey: false,
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: 'SearXNG 无需 API Key',
      requiresExtraConfig: true,
      extraConfigFields: [
        {
          key: 'apiUrl',
          label: '实例地址',
          type: 'string',
          default: 'http://localhost:8080',
          placeholder: 'https://search.example.com',
          required: true,
          description: '自托管 SearXNG 实例基础地址（启用 JSON API）'
        }
      ]
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: false,
    priority: 15
  },
  {
    id: 'google-cse',
    siteUrl: 'https://www.google.com',
    name: 'Google 自定义搜索',
    description: 'Google Custom Search JSON API——需 API Key + Search Engine ID（cx）',
    category: 'api',
    icon: '🌐',
    authConfig: {
      requiresApiKey: true,
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: '请输入 Google API Key',
      requiresExtraConfig: true,
      extraConfigFields: [
        {
          key: 'cx',
          label: 'Search Engine ID',
          type: 'string',
          placeholder: '如 0123456789abcdef0123',
          required: true,
          description: 'Google 自定义搜索引擎 ID（Programmable Search Engine 控制台获取）'
        }
      ]
    },
    defaultMaxResults: 5,
    maxResultsLimit: 10,
    isOfficial: true,
    priority: 17
  },
  {
    id: 'custom-api',
    name: '自定义搜索引擎',
    description: '接入任意 OpenAI 兼容的联网搜索 API（Perplexity/DeepSeek/Kimi 等）——填 API 地址 + Key + 模型名',
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
    priority: 20
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
    case 'perplexity':
      return new PerplexitySearchEngine(config)
    case 'deepseek-web':
      return new DeepSeekWebSearchEngine(config)
    case 'bocha':
      return new BochaSearchEngine(config)
    case 'bing-api':
      return new BingApiSearchEngine(config)
    case 'google-cse':
      return new GoogleCseSearchEngine(config)
    case 'searxng':
      return new SearxngSearchEngine(config)
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
  CustomApiSearchEngine,
  PerplexitySearchEngine,
  DeepSeekWebSearchEngine,
  BochaSearchEngine,
  BingApiSearchEngine,
  GoogleCseSearchEngine,
  SearxngSearchEngine
}