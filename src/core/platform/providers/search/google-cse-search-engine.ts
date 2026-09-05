/**
 * Google Custom Search JSON API 引擎
 * @module platform/providers/search/google-cse-search-engine
 * @description Google Custom Search JSON API：
 *              GET https://www.googleapis.com/customsearch/v1?key=<key>&cx=<cx>&q=<query>&num=<n>
 *              - API Key 走 query 参数；cx（Search Engine ID）为必填额外配置
 *              - 响应：{ items: [{ title, link, snippet }] }
 */

import { BaseSearchEngine } from './base-search-engine'
import type { WebSearchResultItem, WebSearchResponse, SearchEngineType } from '@shared/types/search-engine.types'

export class GoogleCseSearchEngine extends BaseSearchEngine {
  readonly type: SearchEngineType = 'google-cse'
  readonly name: string = 'Google 自定义搜索'

  private readonly timeout = 30000

  /** Search Engine ID（extraConfig.cx，必填） */
  private get cx(): string {
    return (this.config.extraConfig?.cx as string | undefined)?.trim() || ''
  }

  async search(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
    const startTime = this.getTimestamp()

    if (!this.config.apiKey) {
      return this.createErrorResponse('Google 自定义搜索需要配置 API Key', query)
    }
    if (!this.cx) {
      return this.createErrorResponse('请配置 Search Engine ID（cx）', query)
    }

    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(this.config.apiKey)}&cx=${encodeURIComponent(this.cx)}&q=${encodeURIComponent(query)}&num=${maxResults}`
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[GoogleCseSearchEngine] API 错误响应:', errorText)
        return this.createErrorResponse(`API 请求失败: HTTP ${response.status}`, query)
      }

      const data = await response.json()
      const results = this.parseResults(data, maxResults)
      return this.createSuccessResponse(results, query, this.calculateDuration(startTime))
    } catch (error: any) {
      console.error('[GoogleCseSearchEngine] 搜索失败:', error)
      return this.createErrorResponse(
        error.name === 'TimeoutError' ? '搜索请求超时' : `搜索失败: ${error.message}`,
        query
      )
    }
  }

  /** 解析 Google CSE 响应：items[] → { title, link, snippet } */
  private parseResults(data: any, maxResults: number): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = []
    try {
      const items = data?.items
      if (!Array.isArray(items)) return results

      for (const item of items) {
        if (results.length >= maxResults) break
        const title = item.title || ''
        const url = item.link || ''
        if (!title || !url) continue
        results.push({
          title: this.truncateText(this.stripHtml(title), 100),
          url: this.normalizeUrl(url),
          snippet: this.truncateText(this.stripHtml(item.snippet || ''), 200),
          source: 'google-cse',
          sourceName: this.name,
        })
      }
    } catch (error) {
      console.error('[GoogleCseSearchEngine] 解析搜索结果失败:', error)
    }
    return results
  }
}
