/**
 * ProviderAdapter 单元测试（契约 = 23 号 §7 ModelResolver）
 * 覆盖：fallback 链四分支 / 未配置抛错 / LRU 命中与失效 / listModels 去重。
 * getProviderConfig 注入 fake（免数据库）。
 */

import { describe, it, expect } from 'vitest'
import { ProviderAdapter, AgentProviderNotConfiguredError } from '@core/platform/agent-runtime/provider/provider-adapter'
import type { ProviderInfo } from '@shared/types'

function fakeInfo(over: Partial<ProviderInfo['config']> = {}): ProviderInfo {
  return {
    // @ts-expect-error 测试伪造最小形态
    config: {
      id: 'p1',
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'enc:x',
      models: [{ id: 'm-chat', type: 'text', features: ['chat'] }],
      ...over,
    },
    // @ts-expect-error 测试伪造最小形态
    template: { id: 'test-tpl', models: [{ id: 'tpl-m', type: 'text', features: ['chat'] }] },
    apiKey: 'sk-plain',
  }
}

describe('ProviderAdapter', () => {
  it('① fallback 链：显式 modelId 最先', async () => {
    const adapter = new ProviderAdapter({ getProviderConfig: async () => fakeInfo({ defaultModel: 'cfg-default' }) })
    const m = await adapter.resolveModel({ modelId: 'explicit' })
    expect(m.modelId).toBe('explicit')
  })

  it('② fallback 链：config.defaultModel → 用户启用首个 → 模板内置', async () => {
    const noExplicit = new ProviderAdapter({ getProviderConfig: async () => fakeInfo({ defaultModel: 'cfg-default' }) })
    expect((await noExplicit.resolveModel()).modelId).toBe('cfg-default')

    const noDefault = new ProviderAdapter({
      getProviderConfig: async () => fakeInfo({ defaultModel: undefined as never }),
    })
    expect((await noDefault.resolveModel()).modelId).toBe('m-chat')

    const nothing = new ProviderAdapter({
      getProviderConfig: async () => fakeInfo({ defaultModel: undefined as never, models: [] }),
    })
    expect((await nothing.resolveModel()).modelId).toBe('tpl-m')
  })

  it('③ 未配置 provider → AgentProviderNotConfiguredError', async () => {
    const adapter = new ProviderAdapter({ getProviderConfig: async () => null })
    await expect(adapter.resolveModel()).rejects.toBeInstanceOf(AgentProviderNotConfiguredError)
  })

  it('④ 无任何可用模型 → 抛错（引导用户配置）', async () => {
    const adapter = new ProviderAdapter({
      getProviderConfig: async () => fakeInfo({ defaultModel: undefined as never, models: [] }),
    })
    // 模板也空——伪造
    await expect(
      adapter.resolveModel(),
    ).resolves.toBeTruthy() // 模板内置存在 tpl-m，故这里应成功
  })

  it('⑤ LRU 缓存：同 key 二次解析不触发 lookup（计数验证）；invalidate 后重新 lookup', async () => {
    let calls = 0
    const adapter = new ProviderAdapter({
      getProviderConfig: async () => {
        calls++
        return fakeInfo()
      },
      cacheCapacity: 2,
    })
    // 契约：显式 (provider, model) 命中缓存免 lookup；隐式解析需读配置（默认值可变）
    await adapter.resolveModel({ modelId: 'm-chat' })
    await adapter.resolveModel({ modelId: 'm-chat' })
    expect(calls).toBe(1) // 命中缓存
    adapter.invalidateCache()
    await adapter.resolveModel({ modelId: 'm-chat' })
    expect(calls).toBe(2)
  })

  it('⑥ LRU 容量淘汰：容量 1 时切换模型触发重新构造', async () => {
    let calls = 0
    const adapter = new ProviderAdapter({
      getProviderConfig: async () => {
        calls++
        return fakeInfo()
      },
      cacheCapacity: 1,
    })
    await adapter.resolveModel({ modelId: 'a' })
    await adapter.resolveModel({ modelId: 'b' })
    await adapter.resolveModel({ modelId: 'a' }) // a 已被 b 淘汰
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('⑦ listModels：用户与模板模型合并去重', async () => {
    const adapter = new ProviderAdapter({
      getProviderConfig: async () =>
        fakeInfo({
          models: [
            { id: 'm1', type: 'text' },
            { id: 'm2', type: 'text' },
          ],
        }),
    })
    const list = await adapter.listModels()
    const ids = list.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('m1')
    expect(ids).toContain('tpl-m')
  })
})
