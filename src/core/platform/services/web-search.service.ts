/**
 * 网页搜索服务
 * @module platform/services/web-search.service
 * @description 提供联网搜索功能，支持 Bing、Google 等搜索引擎
 */

import type { WebSearchResult, WebSearchResponse } from '@shared/types/message.types'

/**
 * 搜索引擎配置接口
 */
interface SearchEngineConfig {
  /** API 端点 */
  endpoint: string
  /** 是否需要 API Key */
  requiresApiKey: boolean
  /** 结果数量 */
  maxResults: number
}

/**
 * 网页搜索服务
 */
export class WebSearchService {
  /**
   * 搜索引擎配置
   */
  private static readonly ENGINE_CONFIGS: Record<string, SearchEngineConfig> = {
    bing: {
      endpoint: 'https://api.bing.microsoft.com/v7.0/search',
      requiresApiKey: true,
      maxResults: 5
    },
    google: {
      endpoint: 'https://www.googleapis.com/customsearch/v1',
      requiresApiKey: true,
      maxResults: 5
    }
  }

  /**
   * 执行搜索
   * @param query - 搜索查询
   * @param engine - 搜索引擎
   * @param apiKey - API 密钥（可选）
   * @param maxResults - 最大结果数
   * @returns 搜索结果
   */
  static async search(
    query: string,
    engine: 'baidu' | 'bing' | 'google',
    apiKey?: string,
    maxResults: number = 5
  ): Promise<WebSearchResponse> {
    console.log(`[WebSearchService.search] 开始搜索: query="${query}", engine=${engine}`)

    try {
      switch (engine) {
        case 'bing':
          return await this.searchBing(query, apiKey, maxResults)
        case 'google':
          return await this.searchGoogle(query, apiKey, maxResults)
        case 'baidu':
          // Baidu 暂不支持，返回错误提示
          return {
            success: false,
            results: [],
            error: '百度搜索暂不支持，请使用 Bing 或 Google'
          }
        default:
          return {
            success: false,
            results: [],
            error: `不支持的搜索引擎: ${engine}`
          }
      }
    } catch (error: any) {
      console.error('[WebSearchService.search] 搜索失败:', error)
      return {
        success: false,
        results: [],
        error: error.message || '搜索失败'
      }
    }
  }

  /**
   * Bing 搜索
   */
  private static async searchBing(
    query: string,
    apiKey?: string,
    maxResults: number = 5
  ): Promise<WebSearchResponse> {
    if (!apiKey) {
      return {
        success: false,
        results: [],
        error: 'Bing 搜索需要配置 API Key'
      }
    }

    try {
      const endpoint = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${maxResults}&responseFilter=Webpages`

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Bing API 错误 (${response.status}): ${errorText}`)
      }

      const data = await response.json()

      // 解析 Bing 搜索结果
      const results: WebSearchResult[] = (data.webPages?.value || []).map((item: any) => ({
        title: item.name || '',
        url: item.url || '',
        snippet: item.snippet || '',
        source: 'bing' as const
      }))

      console.log(`[WebSearchService.searchBing] 搜索成功，返回 ${results.length} 条结果`)

      return {
        success: true,
        results
      }
    } catch (error: any) {
      console.error('[WebSearchService.searchBing] Bing 搜索失败:', error)
      return {
        success: false,
        results: [],
        error: error.message || 'Bing 搜索失败'
      }
    }
  }

  /**
   * Google 搜索
   */
  private static async searchGoogle(
    query: string,
    apiKey?: string,
    maxResults: number = 5
  ): Promise<WebSearchResponse> {
    // Google Custom Search 需要 API Key 和 Search Engine ID
    // 这里先返回错误提示，实际使用时需要用户配置
    if (!apiKey) {
      return {
        success: false,
        results: [],
        error: 'Google 搜索需要配置 API Key 和 Search Engine ID'
      }
    }

    try {
      // 注意：Google Custom Search API 需要 cx (Search Engine ID) 参数
      // 这里我们假设 apiKey 包含两部分：API_KEY:SEARCH_ENGINE_ID
      const [googleApiKey, searchEngineId] = apiKey.split(':')

      if (!searchEngineId) {
        return {
          success: false,
          results: [],
          error: 'Google 搜索需要配置 Search Engine ID（格式：API_KEY:SEARCH_ENGINE_ID）'
        }
      }

      const endpoint = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=${maxResults}`

      const response = await fetch(endpoint, {
        method: 'GET'
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Google API 错误 (${response.status}): ${errorText}`)
      }

      const data = await response.json()

      // 解析 Google 搜索结果
      const results: WebSearchResult[] = (data.items || []).map((item: any) => ({
        title: item.title || '',
        url: item.link || '',
        snippet: item.snippet || '',
        source: 'google' as const
      }))

      console.log(`[WebSearchService.searchGoogle] 搜索成功，返回 ${results.length} 条结果`)

      return {
        success: true,
        results
      }
    } catch (error: any) {
      console.error('[WebSearchService.searchGoogle] Google 搜索失败:', error)
      return {
        success: false,
        results: [],
        error: error.message || 'Google 搜索失败'
      }
    }
  }

  /**
   * 将搜索结果格式化为上下文文本
   * @param results - 搜索结果列表
   * @returns 格式化的上下文文本
   */
  static formatResultsAsContext(results: WebSearchResult[]): string {
    if (!results || results.length === 0) {
      return ''
    }

    const formattedResults = results.map((result, index) => {
      return `[${index + 1}] ${result.title}\n来源: ${result.url}\n摘要: ${result.snippet}`
    }).join('\n\n')

    return `搜索结果：\n\n${formattedResults}`
  }
}