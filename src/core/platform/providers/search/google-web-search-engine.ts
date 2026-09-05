/**
 * Google 搜索引擎（网页抓取）
 * @module platform/providers/search/google-web-search-engine
 * @description 通过网页抓取实现 Google 搜索
 */

import { BaseSearchEngine } from './base-search-engine'
import type { WebSearchResultItem, WebSearchResponse, SearchEngineType } from '@shared/types/search-engine.types'

/**
 * Google 搜索引擎实现（网页抓取）
 */
export class GoogleWebSearchEngine extends BaseSearchEngine {
  readonly type: SearchEngineType = 'google-web'
  readonly name: string = 'Google'

  /** 搜索 URL 模板 */
  private readonly searchUrl = 'https://www.google.com/search'

  /** 请求超时时间（毫秒） */
  private readonly timeout = 30000

  /**
   * 执行搜索
   */
  async search(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
    const startTime = this.getTimestamp()

    try {
      const url = `${this.searchUrl}?q=${encodeURIComponent(query)}&num=${Math.min(maxResults * 2, 20)}&hl=zh-CN`

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        },
        signal: AbortSignal.timeout(this.timeout)
      })

      if (!response.ok) {
        return this.createErrorResponse(`搜索请求失败: HTTP ${response.status}`, query)
      }

      const html = await response.text()
      const results = this.parseSearchResults(html, maxResults)

      return this.createSuccessResponse(results, query, this.calculateDuration(startTime))
    } catch (error: any) {
      console.error('[GoogleWebSearchEngine] 搜索失败:', error)
      return this.createErrorResponse(
        error.name === 'TimeoutError' ? '搜索请求超时' : `搜索失败: ${error.message}`,
        query
      )
    }
  }

  /**
   * 解析搜索结果
   */
  private parseSearchResults(html: string, maxResults: number): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = []

    // Google 搜索结果在 <div class="g"> 或 <div class="Gx5Zad"> 中
    const resultRegex = /<div[^>]*class="[^"]*(?:g|Gx5Zad)[^"]*"[^>]*>([\s\S]*?)<\/div>(?=\s*(?:<div[^>]*class="[^"]*(?:g|Gx5Zad)|$))/gi

    let match
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const container = match[1]

      // 提取标题和链接
      const titleMatch = /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(container)
        || /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(container)

      if (!titleMatch) continue

      const url = titleMatch[1]
      const title = this.stripHtml(titleMatch[2])

      // 提取摘要
      const snippetMatch = /<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(container)
        || /<span[^>]*class="[^"]*aCOpRe[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(container)
        || /<div[^>]*class="[^"]*lEBKkf[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(container)

      const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]) : ''

      // 跳过无效结果和 Google 内部链接
      if (!title || !url || !this.isValidUrl(url) || url.includes('google.com/search')) {
        continue
      }

      results.push({
        title: this.truncateText(title, 100),
        url,
        snippet: this.truncateText(snippet, 200),
        source: 'google-web',
        sourceName: this.name
      })
    }

    return results
  }
}