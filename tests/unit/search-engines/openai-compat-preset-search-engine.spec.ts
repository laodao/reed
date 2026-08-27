/**
 * OpenAI 兼容预置引擎测试（perplexity / deepseek-web）
 * @module tests/unit/search-engines/openai-compat-preset-search-engine
 * @description mock fetch：验证预置默认端点/模型回落、类型名与 source 标识。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PerplexitySearchEngine, DeepSeekWebSearchEngine } from '@core/search-engines/openai-compat-preset-search-engine'
import type { UserSearchEngineConfig } from '@shared/types/search-engine.types'

describe('OpenAI 兼容预置引擎（Perplexity / DeepSeek 联网）', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('Perplexity：未填 extraConfig 时回落官方端点与 sonar-pro', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '标题A | https://a.com | 摘要A' } }] }),
    })
    const engine = new PerplexitySearchEngine({ apiKey: 'key_1' } as UserSearchEngineConfig)
    expect(engine.type).toBe('perplexity')
    const resp = await engine.search('测试查询', 5)
    expect(resp.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.perplexity.ai/chat/completions')
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('sonar-pro')
    expect(resp.results[0].source).toBe('perplexity')
  })

  it('DeepSeek 联网：回落官方端点与 deepseek-chat', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '标题A | https://a.com | 摘要A' } }] }),
    })
    const engine = new DeepSeekWebSearchEngine({ apiKey: 'key_1' } as UserSearchEngineConfig)
    expect(engine.type).toBe('deepseek-web')
    const resp = await engine.search('测试查询', 5)
    expect(resp.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.deepseek.com/chat/completions')
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('deepseek-chat')
  })

  it('extraConfig 显式配置优先于默认值', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'T | https://x.com | S' } }] }),
    })
    const engine = new PerplexitySearchEngine({
      apiKey: 'key_1',
      extraConfig: { apiUrl: 'https://custom.example.com', model: 'sonar-reasoning-pro' },
    } as UserSearchEngineConfig)
    await engine.search('q', 5)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://custom.example.com/chat/completions')
    expect(JSON.parse(String(init.body)).model).toBe('sonar-reasoning-pro')
  })

  it('缺 API Key → 明确报错', async () => {
    const engine = new PerplexitySearchEngine({} as UserSearchEngineConfig)
    const resp = await engine.search('q', 5)
    expect(resp.success).toBe(false)
    expect(resp.error).toContain('API Key')
  })
})
