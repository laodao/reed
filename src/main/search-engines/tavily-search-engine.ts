/**
 * Tavily 搜索引擎
 * @module search-engines/tavily-search-engine
 * @description 通过 Tavily API 实现联网搜索
 */

import { BaseSearchEngine } from './base-search-engine'
import type { WebSearchResultItem, WebSearchResponse, SearchEngineType } from '../../shared/types/search-engine.types'

/**
 * Tavily 搜索引擎实现
 */
export class TavilySearchEngine extends BaseSearchEngine {
  readonly type: SearchEngineType = 'tavily'
  readonly name: string = 'Tavily'

  /** 默认 API 基础 URL */
  private readonly defaultBaseUrl = 'https://api.tavily.com'

  /** 请求超时时间（毫秒） */
  private readonly timeout = 60000

  /**
   * 获取 API 基础 URL
   */
  private get baseUrl(): string {
    // 支持自定义 API 地址
    const customUrl = this.config.extraConfig?.apiUrl as string | undefined
    return customUrl || this.defaultBaseUrl
  }

  /**
   * 执行搜索
   */
  async search(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
    const startTime = this.getTimestamp()

    if (!this.config.apiKey) {
      return this.createErrorResponse('Tavily 搜索需要配置 API Key', query)
    }

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          query,
          max_results: Math.min(maxResults, 10),
          include_answer: false,
          include_raw_content: false,
          include_images: false,
          search_depth: 'basic'
        }),
        signal: AbortSignal.timeout(this.timeout)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[TavilySearchEngine] API 错误响应:', errorText)
        return this.createErrorResponse(`API 请求失败: HTTP ${response.status}`, query)
      }

      const data = await response.json()
      const results = this.parseSearchResults(data, maxResults)

      return this.createSuccessResponse(results, query, this.calculateDuration(startTime))
    } catch (error: any) {
      console.error('[TavilySearchEngine] 搜索失败:', error)
      return this.createErrorResponse(
        error.name === 'TimeoutError' ? '搜索请求超时' : `搜索失败: ${error.message}`,
        query
      )
    }
  }

  /**
   * 解析搜索结果
   */
  private parseSearchResults(data: any, maxResults: number): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = []

    try {
      // Tavily 的搜索结果结构
      // 格式: { results: [{ title, url, content, score }] }
      const searchResults = data.results || []

      for (const item of searchResults) {
        if (results.length >= maxResults) break

        const title = item.title || ''
        const url = item.url || ''
        const snippet = item.content || ''
        const score = item.score

        if (!title || !url) continue

        results.push({
          title: this.truncateText(title, 100),
          url: this.normalizeUrl(url),
          snippet: this.truncateText(snippet, 200),
          source: 'tavily',
          sourceName: this.name,
          score: typeof score === 'number' ? score : undefined
        })
      }
    } catch (error) {
      console.error('[TavilySearchEngine] 解析搜索结果失败:', error)
    }

    return results
  }
}