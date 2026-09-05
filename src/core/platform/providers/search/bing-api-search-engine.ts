/**
 * 必应 Web Search API 引擎
 * @module platform/providers/search/bing-api-search-engine
 * @description 微软必应 Web Search API（Azure Cognitive Services v7）：
 *              GET https://api.bing.microsoft.com/v7.0/search?q=<query>&count=<n>
 *              - Header：Ocp-Apim-Subscription-Key: <API Key>
 *              - 响应：{ webPages: { value: [{ name, url, snippet }] } }
 */

import { BaseSearchEngine } from './base-search-engine'
import type { WebSearchResultItem, WebSearchResponse, SearchEngineType } from '@shared/types/search-engine.types'

export class BingApiSearchEngine extends BaseSearchEngine {
  readonly type: SearchEngineType = 'bing-api'
  readonly name: string = '必应搜索 API'

  private readonly apiUrl = 'https://api.bing.microsoft.com/v7.0/search'
  private readonly timeout = 30000

  async search(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
    const startTime = this.getTimestamp()

    if (!this.config.apiKey) {
      return this.createErrorResponse('必应搜索 API 需要配置 API Key', query)
    }

    try {
      const url = `${this.apiUrl}?q=${encodeURIComponent(query)}&count=${maxResults}&mkt=zh-CN`
      const response = await fetch(url, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.config.apiKey,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[BingApiSearchEngine] API 错误响应:', errorText)
        return this.createErrorResponse(`API 请求失败: HTTP ${response.status}`, query)
      }

      const data = await response.json()
      const results = this.parseResults(data, maxResults)
      return this.createSuccessResponse(results, query, this.calculateDuration(startTime))
    } catch (error: any) {
      console.error('[BingApiSearchEngine] 搜索失败:', error)
      return this.createErrorResponse(
        error.name === 'TimeoutError' ? '搜索请求超时' : `搜索失败: ${error.message}`,
        query
      )
    }
  }

  /** 解析必应响应：webPages.value[] → { name, url, snippet } */
  private parseResults(data: any, maxResults: number): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = []
    try {
      const items = data?.webPages?.value
      if (!Array.isArray(items)) return results

      for (const item of items) {
        if (results.length >= maxResults) break
        const title = item.name || ''
        const url = item.url || ''
        if (!title || !url) continue
        results.push({
          title: this.truncateText(title, 100),
          url: this.normalizeUrl(url),
          snippet: this.truncateText(this.stripHtml(item.snippet || ''), 200),
          source: 'bing-api',
          sourceName: this.name,
        })
      }
    } catch (error) {
      console.error('[BingApiSearchEngine] 解析搜索结果失败:', error)
    }
    return results
  }
}
