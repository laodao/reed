/**
 * 智谱 AI 搜索引擎
 * @module search-engines/zhipu-search-engine
 * @description 通过智谱 AI API 实现联网搜索
 */

import { BaseSearchEngine } from './base-search-engine'
import type { WebSearchResultItem, WebSearchResponse, SearchEngineType } from '@shared/types/search-engine.types'

/**
 * 智谱 AI 搜索引擎实现
 */
export class ZhipuSearchEngine extends BaseSearchEngine {
  readonly type: SearchEngineType = 'zhipu'
  readonly name: string = '智谱 AI'

  /** 默认 API 基础 URL */
  private readonly defaultBaseUrl = 'https://open.bigmodel.cn/api/paas/v4'

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
      return this.createErrorResponse('智谱 AI 搜索需要配置 API Key', query)
    }

    try {
      // 智谱 AI web-search-pro API
      // 文档: https://docs.bigmodel.cn/cn/best-practice/case/ai-search-engine
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model: 'web-search-pro',
          messages: [
            {
              role: 'user',
              content: query
            }
          ],
          stream: false
        }),
        signal: AbortSignal.timeout(this.timeout)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[ZhipuSearchEngine] API 错误响应:', errorText)
        return this.createErrorResponse(`API 请求失败: HTTP ${response.status}`, query)
      }

      const data = await response.json()
      const results = this.parseSearchResults(data, maxResults)

      return this.createSuccessResponse(results, query, this.calculateDuration(startTime))
    } catch (error: any) {
      console.error('[ZhipuSearchEngine] 搜索失败:', error)
      return this.createErrorResponse(
        error.name === 'TimeoutError' ? '搜索请求超时' : `搜索失败: ${error.message}`,
        query
      )
    }
  }

  /**
   * 解析搜索结果
   * 响应格式: choices[0].message.tool_calls[1].search_result
   */
  private parseSearchResults(data: any, maxResults: number): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = []

    try {
      const choices = data.choices || []
      if (!choices.length) return results

      const message = choices[0].message || {}
      const toolCalls = message.tool_calls || []

      // 搜索结果在 tool_calls[1].search_result 中
      // tool_calls[0] 通常是搜索工具调用本身，tool_calls[1] 包含搜索结果
      for (const toolCall of toolCalls) {
        if (results.length >= maxResults) break

        // 检查是否有 search_result 字段
        const searchResult = toolCall.search_result
        if (!searchResult || !Array.isArray(searchResult)) continue

        for (const item of searchResult) {
          if (results.length >= maxResults) break

          const title = item.title || ''
          const url = item.link || item.url || ''
          const snippet = item.content || ''

          if (!title || !url) continue

          results.push({
            title: this.truncateText(title, 100),
            url: this.normalizeUrl(url),
            snippet: this.truncateText(snippet, 200),
            source: 'zhipu',
            sourceName: this.name
          })
        }
      }
    } catch (error) {
      console.error('[ZhipuSearchEngine] 解析搜索结果失败:', error)
    }

    return results
  }
}