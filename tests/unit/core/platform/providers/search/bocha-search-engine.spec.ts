/**
 * 博查 AI 搜索引擎测试（bocha）
 * @module tests/unit/search-engines/bocha-search-engine
 * @description mock fetch：验证请求头/体、data.webPages.value 解析、缺 Key 报错、HTTP 错误。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BochaSearchEngine } from '@core/platform/providers/search/bocha-search-engine'
import type { UserSearchEngineConfig } from '@shared/types/search-engine.types'

function makeEngine(apiKey?: string): BochaSearchEngine {
  return new BochaSearchEngine({ apiKey } as UserSearchEngineConfig)
}

describe('BochaSearchEngine', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('POST 博查 web-search 接口（Bearer + JSON body）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: { webPages: { value: [] } }, msg: 'success' }),
    })
    const engine = makeEngine('key_1')
    const resp = await engine.search('测试查询', 5)
    expect(resp.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.bochaai.com/v1/web-search')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer key_1')
    const body = JSON.parse(String(init.body))
    expect(body.query).toBe('测试查询')
    expect(body.count).toBe(5)
  })

  it('解析 data.webPages.value → 结果列表（优先 summary）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 200,
        data: {
          webPages: {
            value: [
              { name: '标题A', url: 'https://a.com', snippet: '摘要A', summary: '总结A' },
              { name: '标题B', url: 'https://b.com', snippet: '摘要B' },
              { name: '', url: 'https://c.com', snippet: '无标题' },
            ],
          },
        },
      }),
    })
    const engine = makeEngine('key_1')
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(true)
    expect(resp.results.length).toBe(2)
    expect(resp.results[0]).toMatchObject({ title: '标题A', url: 'https://a.com', snippet: '总结A', source: 'bocha' })
    expect(resp.results[1].snippet).toBe('摘要B')
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
