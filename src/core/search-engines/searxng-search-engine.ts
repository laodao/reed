/**
 * SearXNG（自托管元搜索引擎）引擎
 * @module search-engines/searxng-search-engine
 * @description SearXNG 提供 JSON API：GET {base}/search?q=<query>&format=json
 *              - 无需 API Key，需要用户自建实例并配置 API 地址（extraConfig.apiUrl）
 *              - 响应：{ results: [{ title, url, content }] }
 */

import { BaseSearchEngine } from './base-search-engine'
import type { WebSearchResultItem, WebSearchResponse, SearchEngineType } from '@shared/types/search-engine.types'

export class SearxngSearchEngine extends BaseSearchEngine {
  readonly type: SearchEngineType = 'searxng'
  readonly name: string = 'SearXNG'

  private readonly timeout = 30000

  /** SearXNG 实例基础地址（extraConfig.apiUrl，必填） */
  private get baseUrl(): string {
    return (this.config.extraConfig?.apiUrl as string | undefined)?.replace(/\/+$/, '') || ''
  }

  async search(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
    const startTime = this.getTimestamp()

    if (!this.baseUrl) {
      return this.createErrorResponse('请配置 SearXNG 实例地址（apiUrl）', query)
    }

    try {
      const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&format=json`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeout),
        headers: { 'Accept': 'application/json' },
      })

      if (!response.ok) {
        return this.createErrorResponse(`SearXNG 请求失败: HTTP ${response.status}`, query)
      }

      const data = await response.json()
      const results = this.parseResults(data, maxResults)
      return this.createSuccessResponse(results, query, this.calculateDuration(startTime))
    } catch (error: any) {
      console.error('[SearxngSearchEngine] 搜索失败:', error)
      return this.createErrorResponse(
        error.name === 'TimeoutError' ? '搜索请求超时' : `搜索失败: ${error.message}`,
        query
      )
    }
  }

  /**
   * 解析 SearXNG JSON 响应：results[] → { title, url, content }
   */
  private parseResults(data: any, maxResults: number): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = []
    try {
      const items = data?.results
      if (!Array.isArray(items)) return results

      for (const item of items) {
        if (results.length >= maxResults) break
        const title = item.title || ''
        const url = item.url || ''
        if (!title || !url) continue
        results.push({
          title: this.truncateText(title, 100),
          url: this.normalizeUrl(url),
          snippet: this.truncateText(this.stripHtml(item.content || ''), 200),
          source: 'searxng',
          sourceName: this.name,
        })
      }
    } catch (error) {
      console.error('[SearxngSearchEngine] 解析搜索结果失败:', error)
    }
    return results
  }
}
