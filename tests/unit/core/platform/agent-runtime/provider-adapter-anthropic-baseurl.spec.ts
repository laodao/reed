/**
 * ProviderAdapter Anthropic baseURL 规整单测
 * @module tests/unit/core/platform/agent-runtime/provider-adapter-anthropic-baseurl
 *
 * 背景：两条 Anthropic 链路对 baseUrl 的期望不同——
 * - `@ai-sdk/anthropic`（本适配器）：请求 `${baseURL}/messages`，baseURL 必须含版本段；
 * - `@anthropic-ai/sdk`（createProvider 链路）：请求 `${baseURL}/v1/messages`，baseURL 为根地址。
 *
 * 官方文档给第三方 Anthropic 兼容端点时给的是根地址，典型例子是阿里百炼 Token Plan：
 * `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic`。
 * 模板 baseUrl 保持文档原样，适配层补版本段——不补就会打到 `.../apps/anthropic/messages`（404）。
 */
import { describe, it, expect, vi } from 'vitest'

const spy = vi.hoisted(() => ({ opts: null as null | { apiKey?: string; baseURL?: string } }))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: (opts: { apiKey?: string; baseURL?: string }) => {
    spy.opts = opts
    return (modelId: string) => ({ modelId, provider: 'anthropic' })
  }
}))

import { ProviderAdapter } from '@core/platform/agent-runtime/provider/provider-adapter'
import type { ProviderInfo } from '@shared/types'

const TOKEN_PLAN_ANTHROPIC_BASE = 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic'

function fakeInfo(over: { userBaseUrl?: string; templateBaseUrl?: string } = {}): ProviderInfo {
  return {
    config: {
      id: `p-${Math.random().toString(36).slice(2)}`,
      name: '测试配置',
      // 用户未填 → 空串，走模板缺省端点
      baseUrl: over.userBaseUrl ?? '',
      apiKey: 'enc:x',
      models: [{ id: 'qwen3.8-max', type: 'multimodal', features: ['chat'] }],
      isEnabled: true,
      isDefault: false,
      createdAt: '',
      updatedAt: '',
    },
    template: {
      id: 'bailian-token-plan-anthropic',
      name: '阿里百炼 Token Plan（Anthropic 兼容）',
      category: 'anthropic',
      apiConfig: { baseUrl: over.templateBaseUrl ?? TOKEN_PLAN_ANTHROPIC_BASE },
      models: [],
      allowCustomModels: true,
    },
    apiKey: 'sk-sp-plain',
  } as unknown as ProviderInfo
}

async function resolveWith(info: ProviderInfo): Promise<{ apiKey?: string; baseURL?: string }> {
  spy.opts = null
  // cacheCapacity 0：不做实例缓存，保证每例都真实构造
  const adapter = new ProviderAdapter({ getProviderConfig: async () => info, cacheCapacity: 0 })
  await adapter.resolveModel({ modelId: 'qwen3.8-max' })
  if (!spy.opts) throw new Error('createAnthropic 未被调用')
  return spy.opts
}

describe('ProviderAdapter：Anthropic baseURL 规整', () => {
  it('模板缺省根地址（百炼 Token Plan apps/anthropic）→ 补 /v1', async () => {
    const opts = await resolveWith(fakeInfo())
    expect(opts.baseURL).toBe(`${TOKEN_PLAN_ANTHROPIC_BASE}/v1`)
    expect(opts.apiKey).toBe('sk-sp-plain')
  })

  it('官方根地址（https://api.anthropic.com）→ 省略 baseURL，用 SDK 规范默认', async () => {
    const opts = await resolveWith(fakeInfo({ templateBaseUrl: 'https://api.anthropic.com' }))
    expect(opts.baseURL).toBeUndefined()
  })

  it('已带版本段的自定义地址 → 原样透传（不叠加 /v1）', async () => {
    const opts = await resolveWith(fakeInfo({ userBaseUrl: 'https://proxy.example.com/anthropic/v1' }))
    expect(opts.baseURL).toBe('https://proxy.example.com/anthropic/v1')
  })

  it('用户填写的根地址（无版本段）→ 补 /v1', async () => {
    const opts = await resolveWith(fakeInfo({ userBaseUrl: 'https://proxy.example.com/anthropic/' }))
    expect(opts.baseURL).toBe('https://proxy.example.com/anthropic/v1')
  })
})
