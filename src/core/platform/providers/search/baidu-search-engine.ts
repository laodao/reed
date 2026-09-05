/**
 * 百度搜索引擎
 * @module platform/providers/search/baidu-search-engine
 * @description 通过网页抓取实现百度搜索
 */

import { BaseSearchEngine } from './base-search-engine'
import type { WebSearchResultItem, WebSearchResponse, SearchEngineType } from '@shared/types/search-engine.types'

/**
 * 百度搜索引擎实现
 */
export class BaiduSearchEngine extends BaseSearchEngine {
  readonly type: SearchEngineType = 'baidu'
  readonly name: string = '百度'

  /** 搜索 URL 模板 */
  private readonly searchUrl = 'https://www.baidu.com/s'

  /** 请求超时时间（毫秒） */
  private readonly timeout = 30000

  /**
   * 执行搜索
   */
  async search(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
    const startTime = this.getTimestamp()

    try {
      const url = `${this.searchUrl}?wd=${encodeURIComponent(query)}&rn=${Math.min(maxResults * 2, 20)}`

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
      console.error('[BaiduSearchEngine] 搜索失败:', error)
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

    // 匹配百度搜索结果容器
    // 百度的搜索结果通常在 <div class="result c-container " ...> 或 <div class="c-container"> 中
    const resultRegex = /<div[^>]*class="[^"]*(?:result\s+c-container|c-container)[^"]*"[^>]*>([\s\S]*?)<\/div>(?=\s*(?:<div[^>]*class="[^"]*(?:result|c-container)|<\/div>\s*<\/div>|$))/gi

    let match
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const container = match[1]

      // 提取标题和链接
      const titleMatch = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(container)
      if (!titleMatch) continue

      const url = titleMatch[1]
      const title = this.stripHtml(titleMatch[2])

      // 提取摘要
      const snippetMatch = /<span[^>]*class="[^"]*content-right_[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(container)
        || /<div[^>]*class="[^"]*(?:c-abstract|c-span9)[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(container)
        || /<p[^>]*class="[^"]*content-right_[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(container)

      const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]) : ''

      // 跳过无效结果
      if (!title || !url || url.includes('javascript:') || url.startsWith('/')) {
        continue
      }

      results.push({
        title: this.truncateText(title, 100),
        url: url.startsWith('http') ? url : `https://www.baidu.com${url}`,
        snippet: this.truncateText(snippet, 200),
        source: 'baidu',
        sourceName: this.name
      })
    }

    return results
  }
}