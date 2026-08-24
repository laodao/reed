/**
 * 通用 API 型搜索引擎（OpenAI 兼容 /chat/completions）
 * @module search-engines/custom-api-search-engine
 * @description 用户自定义 API 搜索引擎：填 API 地址 + Key + 模型名即可接入
 *              任意 OpenAI 兼容搜索端点（如 Perplexity、Exa、DeepSeek 联网等）。
 *              配置项通用（apiUrl/model），支持在提示词中要求返回链接。
 */

import { BaseSearchEngine } from './base-search-engine'
import type { WebSearchResultItem, WebSearchResponse, SearchEngineType } from '@shared/types/search-engine.types'

export class CustomApiSearchEngine extends BaseSearchEngine {
  readonly type: SearchEngineType = 'custom-api'
  readonly name: string = '通用 API 搜索'

  private readonly timeout = 60000

  /** API 基础 URL（必填：extraConfig.apiUrl） */
  private get baseUrl(): string {
    return (this.config.extraConfig?.apiUrl as string | undefined)?.replace(/\/+$/, '') || ''
  }

  /** 模型名（extraConfig.model；缺省 web-search-pro 类常见默认） */
  private get model(): string {
    return (this.config.extraConfig?.model as string | undefined) || ''
  }

  async search(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
    const startTime = this.getTimestamp()
    if (!this.config.apiKey) {
      return this.createErrorResponse('通用 API 搜索需要配置 API Key', query)
    }
    if (!this.baseUrl) {
      return this.createErrorResponse('请配置 API 地址（apiUrl）', query)
    }
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: `请搜索以下内容并返回结果列表（含标题、链接、摘要）：\n${query}\n\n只返回搜索结果，每个结果一行，格式：标题 | 链接 | 摘要`,
            },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[CustomApiSearchEngine] API 错误响应:', errorText)
        return this.createErrorResponse(`API 请求失败: HTTP ${response.status}`, query)
      }

      const data = await response.json()
      const results = this.parseSearchResults(data, maxResults)
      return this.createSuccessResponse(results, query, this.calculateDuration(startTime))
    } catch (error: any) {
      console.error('[CustomApiSearchEngine] 搜索失败:', error)
      return this.createErrorResponse(
        error.name === 'TimeoutError' ? '搜索请求超时' : `搜索失败: ${error.message}`,
        query
      )
    }
  }

  /**
   * 解析 OpenAI 兼容响应：优先 choices[0].message.tool_calls 的 search_result/web_search；
   * 回退 content 文本中的「标题 | 链接 | 摘要」行。
   */
  private parseSearchResults(data: any, maxResults: number): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = []
    try {
      const choices = data.choices || []
      const message = choices[0]?.message || {}

      // 1) 工具调用里的结构化结果（search_result / web_search / results）
      for (const toolCall of message.tool_calls || []) {
        const arr = toolCall.search_result || toolCall.web_search || toolCall.results
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (results.length >= maxResults) break
            const title = item.title || ''
            const url = item.link || item.url || ''
            const snippet = item.content || item.snippet || ''
            if (!title || !url) continue
            results.push({
              title: this.truncateText(title, 100),
              url: this.normalizeUrl(url),
              snippet: this.truncateText(snippet, 200),
              source: 'custom-api',
              sourceName: this.name,
            })
          }
        }
      }
      if (results.length >= maxResults) return results

      // 2) content 文本回退解析（标题 | 链接 | 摘要 行格式）
      const content: string = typeof message.content === 'string' ? message.content : ''
      if (content) {
        for (const line of content.split(/\r?\n/)) {
          if (results.length >= maxResults) break
          const parts = line.split('|').map(s => s.trim()).filter(Boolean)
          if (parts.length < 2) continue
          const [title, url, ...rest] = parts
          if (!title || !url) continue
          if (!/^https?:\/\//i.test(url)) continue
          results.push({
            title: this.truncateText(title, 100),
            url: this.normalizeUrl(url),
            snippet: this.truncateText(rest.join(' | '), 200),
            source: 'custom-api',
            sourceName: this.name,
          })
        }
      }
    } catch (error) {
      console.error('[CustomApiSearchEngine] 解析搜索结果失败:', error)
    }
    return results
  }
}
