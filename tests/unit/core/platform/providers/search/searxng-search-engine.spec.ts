/**
 * SearXNG 搜索引擎测试（searxng）
 * @module tests/unit/search-engines/searxng-search-engine
 * @description mock fetch：验证 GET 查询串、results[] 解析（HTML 清理）、缺实例地址报错。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SearxngSearchEngine } from '@core/platform/providers/search/searxng-search-engine'
import type { UserSearchEngineConfig } from '@shared/types/search-engine.types'

function makeEngine(apiUrl?: string): SearxngSearchEngine {
  return new SearxngSearchEngine({
    extraConfig: apiUrl ? { apiUrl } : undefined,
  } as UserSearchEngineConfig)
}

describe('SearxngSearchEngine', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('GET {base}/search?q=&format=json', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    const engine = makeEngine('https://search.example.com')
    const resp = await engine.search('测试查询', 5)
    expect(resp.success).toBe(true)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toBe('https://search.example.com/search?q=%E6%B5%8B%E8%AF%95%E6%9F%A5%E8%AF%A2&format=json')
  })

  it('解析 results[] → 结果列表（清理 content HTML）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: '标题A', url: 'https://a.com', content: '<b>加粗</b> &amp; 摘要' },
          { title: '标题B', url: 'https://b.com', content: '纯文本' },
          { title: '无URL', url: '', content: '跳过' },
        ],
      }),
    })
    const engine = makeEngine('https://search.example.com')
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(true)
    expect(resp.results.length).toBe(2)
    expect(resp.results[0]).toMatchObject({ title: '标题A', url: 'https://a.com', source: 'searxng' })
    expect(resp.results[0].snippet).toContain('加粗')
    expect(resp.results[0].snippet).not.toContain('<b>')
    expect(resp.results[1].snippet).toBe('纯文本')
  })

  it('缺实例地址 → 明确报错', async () => {
    const engine = makeEngine()
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(false)
    expect(resp.error).toContain('实例地址')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
