/**
 * 博查 AI 搜索（Bocha）引擎
 * @module search-engines/bocha-search-engine
 * @description 博查（Bocha AI Search，https://open.bochaai.com）联网搜索 API：
 *              POST https://api.bochaai.com/v1/web-search
 *              - Header：Authorization: Bearer <API Key>
 *              - Body：{ query, freshness, summary, count }
 *              响应：{ code, data: { webPages: { value: [{ name, url, snippet, summary }] } } }
 */

import { BaseSearchEngine } from './base-search-engine'
import type { WebSearchResultItem, WebSearchResponse, SearchEngineType } from '@shared/types/search-engine.types'

export class BochaSearchEngine extends BaseSearchEngine {
  readonly type: SearchEngineType = 'bocha'
  readonly name: string = '博查 AI 搜索'

  private readonly apiUrl = 'https://api.bochaai.com/v1/web-search'
  private readonly timeout = 60000

  async search(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
    const startTime = this.getTimestamp()

    if (!this.config.apiKey) {
      return this.createErrorResponse('博查搜索需要配置 API Key', query)
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query,
          freshness: 'noLimit',
          summary: true,
          count: maxResults,
        }),
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[BochaSearchEngine] API 错误响应:', errorText)
        return this.createErrorResponse(`API 请求失败: HTTP ${response.status}`, query)
      }

      const data = await response.json()
      const results = this.parseResults(data, maxResults)
      return this.createSuccessResponse(results, query, this.calculateDuration(startTime))
    } catch (error: any) {
      console.error('[BochaSearchEngine] 搜索失败:', error)
      return this.createErrorResponse(
        error.name === 'TimeoutError' ? '搜索请求超时' : `搜索失败: ${error.message}`,
        query
      )
    }
  }

  /**
   * 解析博查响应：data.webPages.value[] → { name, url, snippet, summary }
   */
  private parseResults(data: any, maxResults: number): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = []
    try {
      const items = data?.data?.webPages?.value
      if (!Array.isArray(items)) return results

      for (const item of items) {
        if (results.length >= maxResults) break
        const title = item.name || ''
        const url = item.url || ''
        if (!title || !url) continue
        results.push({
          title: this.truncateText(title, 100),
          url: this.normalizeUrl(url),
          snippet: this.truncateText(item.summary || item.snippet || '', 200),
          source: 'bocha',
          sourceName: this.name,
        })
      }
    } catch (error) {
      console.error('[BochaSearchEngine] 解析搜索结果失败:', error)
    }
    return results
  }
}
