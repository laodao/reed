/**
 * 搜索引擎基类
 * @module platform/providers/search/base-search-engine
 * @description 定义搜索引擎的基本接口和通用方法
 */

import type {
  WebSearchResultItem,
  WebSearchResponse,
  SearchEngineType
} from '@shared/types/search-engine.types'

/**
 * 搜索引擎配置接口
 */
export interface SearchEngineConfig {
  /** API 密钥（可选，网页抓取型不需要） */
  apiKey?: string
  /** 额外配置参数 */
  extraConfig?: Record<string, unknown>
  /** 最大结果数 */
  maxResults?: number
}

/**
 * 搜索引擎抽象基类
 */
export abstract class BaseSearchEngine {
  /** 搜索引擎类型 */
  abstract readonly type: SearchEngineType

  /** 搜索引擎名称 */
  abstract readonly name: string

  /** 配置 */
  protected config: SearchEngineConfig

  constructor(config: SearchEngineConfig = {}) {
    this.config = config
  }

  /**
   * 执行搜索
   * @param query - 搜索查询词
   * @param maxResults - 最大结果数
   * @returns Promise<WebSearchResponse>
   */
  abstract search(query: string, maxResults?: number): Promise<WebSearchResponse>

  /**
   * 创建成功响应
   */
  protected createSuccessResponse(
    results: WebSearchResultItem[],
    query: string,
    duration?: number
  ): WebSearchResponse {
    return {
      success: true,
      results,
      query,
      duration
    }
  }

  /**
   * 创建错误响应
   */
  protected createErrorResponse(error: string, query?: string): WebSearchResponse {
    return {
      success: false,
      results: [],
      error,
      query
    }
  }

  /**
   * 获取当前时间戳
   */
  protected getTimestamp(): number {
    return Date.now()
  }

  /**
   * 计算耗时
   */
  protected calculateDuration(startTime: number): number {
    return Date.now() - startTime
  }

  /**
   * 截断文本
   */
  protected truncateText(text: string, maxLength: number = 200): string {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  /**
   * 清理 HTML 标签
   */
  protected stripHtml(html: string): string {
    if (!html) return ''
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * 延迟函数
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 检查 URL 是否有效
   */
  protected isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  /**
   * 标准化 URL
   */
  protected normalizeUrl(url: string, baseUrl?: string): string {
    if (!url) return ''

    // 如果已经是完整 URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }

    // 如果有 baseUrl，拼接
    if (baseUrl) {
      try {
        const base = new URL(baseUrl)
        return new URL(url, base).toString()
      } catch {
        return url
      }
    }

    return url
  }
}