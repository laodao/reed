/**
 * Google Custom Search JSON API 引擎测试（google-cse）
 * @module tests/unit/search-engines/google-cse-search-engine
 * @description mock fetch：验证请求 URL（key/cx/q/num）、items 解析、缺 Key/缺 cx 报错。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GoogleCseSearchEngine } from '@core/search-engines/google-cse-search-engine'
import type { UserSearchEngineConfig } from '@shared/types/search-engine.types'

function makeEngine(over: Partial<Record<string, unknown>> = {}): GoogleCseSearchEngine {
  return new GoogleCseSearchEngine({
    apiKey: 'key_1',
    extraConfig: { cx: 'cx_123' },
    ...over,
  } as UserSearchEngineConfig)
}

describe('GoogleCseSearchEngine', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('GET customsearch/v1（key/cx/q/num 全在 query）', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
    const engine = makeEngine()
    const resp = await engine.search('测试查询', 5)
    expect(resp.success).toBe(true)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('https://www.googleapis.com/customsearch/v1')
    expect(url).toContain('key=key_1')
    expect(url).toContain('cx=cx_123')
    expect(url).toContain('q=%E6%B5%8B%E8%AF%95%E6%9F%A5%E8%AF%A2')
    expect(url).toContain('num=5')
  })

  it('解析 items[] → 结果列表（清理 HTML）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { title: '标题A', link: 'https://a.com', snippet: '摘要A' },
          { title: '<b>标题B</b>', link: 'https://b.com', snippet: '摘要B' },
          { title: '无链接', link: '', snippet: '跳过' },
        ],
      }),
    })
    const engine = makeEngine()
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(true)
    expect(resp.results.length).toBe(2)
    expect(resp.results[0]).toMatchObject({ title: '标题A', url: 'https://a.com', snippet: '摘要A', source: 'google-cse' })
    expect(resp.results[1].title).toBe('标题B')
  })

  it('缺 API Key / 缺 cx → 明确报错', async () => {
    const noKey = makeEngine({ apiKey: undefined })
    const r1 = await noKey.search('q', 5)
    expect(r1.success).toBe(false)
    expect(r1.error).toContain('API Key')

    const noCx = makeEngine({ extraConfig: {} })
    const r2 = await noCx.search('q', 5)
    expect(r2.success).toBe(false)
    expect(r2.error).toContain('cx')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
