/**
 * ProviderAdapter category 分派（25 号 M2 批4）
 *
 * 钉死：template.category = anthropic/google → 原生 SDK 工厂；其余（openai
 * 兼容/custom/未知）→ createOpenAICompatible。官方根地址省略 baseURL（SDK
 * 规范路径），自定义地址透传。三家 SDK 全部 mock（断言工厂入参，无网络）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const anthropicFactory = vi.fn(() => (id: string) => ({ modelId: id, provider: 'anthropic-mock' }))
const googleFactory = vi.fn(() => (id: string) => ({ modelId: id, provider: 'google-mock' }))
const compatFactory = vi.fn(() => (id: string) => ({ modelId: id, provider: 'compat-mock' }))

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: (...a: unknown[]) => anthropicFactory(...(a as [])) }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: (...a: unknown[]) => googleFactory(...(a as [])) }))
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: (...a: unknown[]) => compatFactory(...(a as [])) }))

import { ProviderAdapter } from '@core/platform/agent-runtime/provider/provider-adapter'
import type { ProviderInfo } from '@shared/types'

function fakeInfo(category: string, baseUrl: string): ProviderInfo {
  return {
    // @ts-expect-error 测试伪造最小形态
    config: { id: 'p1', baseUrl, apiKey: 'enc:x', models: [{ id: 'm-chat', type: 'text', features: ['chat'] }] },
    // @ts-expect-error 测试伪造最小形态
    template: { id: 'tpl', category, models: [{ id: 'tpl-m', type: 'text', features: ['chat'] }] },
    apiKey: 'sk-plain',
  }
}

beforeEach(() => {
  anthropicFactory.mockClear()
  googleFactory.mockClear()
  compatFactory.mockClear()
})

describe('category 分派', () => {
  it('anthropic 模板 → createAnthropic；官方根地址省略 baseURL（SDK 规范 /v1 路径）', async () => {
    const adapter = new ProviderAdapter({ getProviderConfig: async () => fakeInfo('anthropic', 'https://api.anthropic.com') })
    const m = await adapter.resolveModel({ modelId: 'claude-x' })
    expect(anthropicFactory).toHaveBeenCalledTimes(1)
    expect(anthropicFactory).toHaveBeenCalledWith({ apiKey: 'sk-plain' })
    expect(compatFactory).not.toHaveBeenCalled()
    expect((m as { provider: string }).provider).toBe('anthropic-mock')
  })

  it('anthropic 自定义地址（中转）→ baseURL 透传', async () => {
    const adapter = new ProviderAdapter({ getProviderConfig: async () => fakeInfo('anthropic', 'https://proxy.example.com/v1/') })
    await adapter.resolveModel({ modelId: 'claude-x' })
    expect(anthropicFactory).toHaveBeenCalledWith({ apiKey: 'sk-plain', baseURL: 'https://proxy.example.com/v1' })
  })

  it('google 模板 → createGoogleGenerativeAI；官方根地址省略 baseURL', async () => {
    const adapter = new ProviderAdapter({ getProviderConfig: async () => fakeInfo('google', 'https://generativelanguage.googleapis.com') })
    const m = await adapter.resolveModel({ modelId: 'gemini-x' })
    expect(googleFactory).toHaveBeenCalledTimes(1)
    expect(googleFactory).toHaveBeenCalledWith({ apiKey: 'sk-plain' })
    expect((m as { provider: string }).provider).toBe('google-mock')
  })

  it('openai-compatible / custom / 未知类别 → createOpenAICompatible（name+baseURL+apiKey）', async () => {
    const a = new ProviderAdapter({ getProviderConfig: async () => fakeInfo('openai-compatible', 'https://api.test.com/v1') })
    await a.resolveModel({ modelId: 'm1' })
    expect(compatFactory).toHaveBeenCalledWith({ name: 'tpl', baseURL: 'https://api.test.com/v1', apiKey: 'sk-plain' })

    const b = new ProviderAdapter({ getProviderConfig: async () => fakeInfo('custom', 'https://self.hosted/v1') })
    await b.resolveModel({ modelId: 'm2' })
    expect(compatFactory).toHaveBeenCalledTimes(2)

    const c = new ProviderAdapter({ getProviderConfig: async () => fakeInfo('mystery', 'https://x.io') })
    await c.resolveModel({ modelId: 'm3' })
    expect(compatFactory).toHaveBeenCalledTimes(3)
    expect(anthropicFactory).not.toHaveBeenCalled()
    expect(googleFactory).not.toHaveBeenCalled()
  })
})
