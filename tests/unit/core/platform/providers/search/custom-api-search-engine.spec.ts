/**
 * 通用 API 搜索引擎测试（custom-api：OpenAI 兼容 /chat/completions）
 * @module tests/unit/search-engines/custom-api-search-engine
 * @description mock fetch：验证请求头/体构造、结构化结果解析（tool_calls）、
 *              文本回退解析、缺 Key/缺 URL 报错。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CustomApiSearchEngine } from '@core/platform/providers/search/custom-api-search-engine'
import type { UserSearchEngineConfig } from '@shared/types/search-engine.types'

function makeEngine(over: Partial<Record<string, unknown>> = {}): CustomApiSearchEngine {
  return new CustomApiSearchEngine({
    apiKey: 'key_1',
    extraConfig: { apiUrl: 'https://api.example.com', model: 'sonar' },
    maxResults: 5,
    ...over,
  } as UserSearchEngineConfig)
}

describe('CustomApiSearchEngine', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('请求 OpenAI 兼容 /chat/completions（Bearer + model + 搜索指令）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '标题A | https://a.com | 摘要A' } }] }),
    })
    const engine = makeEngine()
    const resp = await engine.search('测试查询', 5)
    expect(resp.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.example.com/chat/completions')
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('sonar')
    expect(init.headers.Authorization).toBe('Bearer key_1')
    expect(body.messages[0].content).toContain('测试查询')
  })

  it('解析 tool_calls 结构化结果（search_result）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            tool_calls: [{
              search_result: [
                { title: 'T1', link: 'https://x.com/1', content: 'S1' },
                { title: 'T2', url: 'https://x.com/2', snippet: 'S2' },
              ],
            }],
          },
        }],
      }),
    })
    const engine = makeEngine()
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(true)
    expect(resp.results.length).toBe(2)
    expect(resp.results[0]).toMatchObject({ title: 'T1', url: 'https://x.com/1', snippet: 'S1', source: 'custom-api' })
  })

  it('content 文本回退解析（标题 | 链接 | 摘要 行）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '标题A | https://a.com | 摘要A\n标题B | https://b.com | 摘要B\n非链接行' } }],
      }),
    })
    const engine = makeEngine()
    const resp = await engine.search('q', 5)
    expect(resp.results.length).toBe(2)
    expect(resp.results[1].url).toBe('https://b.com')
  })

  it('缺 API Key / 缺 URL → 明确报错', async () => {
    const noKey = makeEngine({ apiKey: undefined })
    const r1 = await noKey.search('q', 5)
    expect(r1.success).toBe(false)
    expect(r1.error).toContain('API Key')

    const noUrl = makeEngine({ extraConfig: { model: 'm' } })
    const r2 = await noUrl.search('q', 5)
    expect(r2.success).toBe(false)
    expect(r2.error).toContain('API 地址')
  })

  it('HTTP 非 2xx → 错误响应', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' })
    const engine = makeEngine()
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(false)
    expect(resp.error).toContain('401')
  })
})
