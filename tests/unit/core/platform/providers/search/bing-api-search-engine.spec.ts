/**
 * 必应 Web Search API 引擎测试（bing-api）
 * @module tests/unit/search-engines/bing-api-search-engine
 * @description mock fetch：验证请求 URL/头、webPages.value 解析、缺 Key 报错、HTTP 错误。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BingApiSearchEngine } from '@core/platform/providers/search/bing-api-search-engine'
import type { UserSearchEngineConfig } from '@shared/types/search-engine.types'

function makeEngine(apiKey?: string): BingApiSearchEngine {
  return new BingApiSearchEngine({ apiKey } as UserSearchEngineConfig)
}

describe('BingApiSearchEngine', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('GET 必应 v7.0/search（Ocp-Apim-Subscription-Key 头 + q/count）', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ webPages: { value: [] } }) })
    const engine = makeEngine('key_1')
    const resp = await engine.search('测试查询', 5)
    expect(resp.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('https://api.bing.microsoft.com/v7.0/search')
    expect(String(url)).toContain('q=%E6%B5%8B%E8%AF%95%E6%9F%A5%E8%AF%A2')
    expect(String(url)).toContain('count=5')
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('key_1')
  })

  it('解析 webPages.value → 结果列表', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        webPages: {
          value: [
            { name: '标题A', url: 'https://a.com', snippet: '摘要A' },
            { name: '标题B', url: 'https://b.com', snippet: '<b>加粗</b> 摘要B' },
            { name: '无URL', url: '', snippet: '跳过' },
          ],
        },
      }),
    })
    const engine = makeEngine('key_1')
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(true)
    expect(resp.results.length).toBe(2)
    expect(resp.results[0]).toMatchObject({ title: '标题A', url: 'https://a.com', snippet: '摘要A', source: 'bing-api' })
    expect(resp.results[1].snippet).not.toContain('<b>')
  })

  it('缺 API Key → 明确报错', async () => {
    const engine = makeEngine()
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(false)
    expect(resp.error).toContain('API Key')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('HTTP 非 2xx → 错误响应', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' })
    const engine = makeEngine('key_1')
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(false)
    expect(resp.error).toContain('401')
  })
})
