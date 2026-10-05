/**
 * createKbScopedLlm 每库模型隔离单测（review M7 回归）
 *
 * 背景：goal-distill/cleanup/layer-relabel/book-passes 是模块级单例，原实现
 * setModelOverride 覆盖共享解析函数——KB-A 提炼进行中（分钟级 fire-and-forget）
 * 用户触发 KB-B 的同类动作时，A 的后续 LLM 调用会解析到 B 的模型。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const genMock = vi.fn()

vi.mock('@core/platform/services/simple-llm', () => ({
  generateCompletionText: (...args: unknown[]) => {
    genMock(...args)
    return Promise.resolve('{"ok":true}')
  }
}))

import { createKbScopedLlm } from '@core/platform/services/kb-brain/llm'

describe('createKbScopedLlm 每库隔离（M7）', () => {
  beforeEach(() => {
    genMock.mockClear()
    delete process.env.KB_ADJUDICATE_MODEL
  })

  it('两个 kbId 各自的覆盖互不影响（并发交错调用仍解析正确）', async () => {
    const scoped = createKbScopedLlm('kb-brain-adjudicate')
    scoped.setOverride('kb-a', () => ({ modelId: 'model-a' }))
    scoped.setOverride('kb-b', () => ({ modelId: 'model-b' }))

    // 模拟单例并发交错：A 先发起、B 插入、A 再继续——旧实现 A 的第二次会解析到 model-b
    const llmA = scoped.llmFor('kb-a')
    const llmB = scoped.llmFor('kb-b')
    await llmA({ system: 's', user: 'a1' })
    await llmB({ system: 's', user: 'b1' })
    await llmA({ system: 's', user: 'a2' })

    const models = genMock.mock.calls.map(c => (c[2] as { modelId?: string }).modelId)
    expect(models).toEqual(['model-a', 'model-b', 'model-a'])
  })

  it('无覆盖的 kbId 回退构造 fallback，再回退 env（{}）', async () => {
    const scoped = createKbScopedLlm('kb-brain-adjudicate', {
      fallback: () => ({ providerConfigId: 'ctor', modelId: 'fallback-model' })
    })
    scoped.setOverride('kb-x', () => ({ modelId: 'per-kb-model' }))

    await scoped.llmFor('kb-x')({ system: 's', user: 'u' }) // kb 覆盖优先
    await scoped.llmFor('kb-no-override')({ system: 's', user: 'u' }) // 构造 fallback
    process.env.KB_ADJUDICATE_MODEL = 'env-model'
    const scoped2 = createKbScopedLlm('kb-brain-adjudicate') // 无 fallback → env
    await scoped2.llmFor('kb-any')({ system: 's', user: 'u' })

    const calls = genMock.mock.calls.map(c => c[2] as Record<string, unknown>)
    expect(calls[0]).toMatchObject({ modelId: 'per-kb-model' })
    expect(calls[1]).toMatchObject({ providerConfigId: 'ctor', modelId: 'fallback-model' })
    expect(calls[2]).toMatchObject({ modelId: 'env-model' })
  })

  it('injected（测试注入 llm）存在时覆盖整体失效', async () => {
    const injected = vi.fn(async () => 'injected-result')
    const scoped = createKbScopedLlm('kb-brain-adjudicate', { injected })
    scoped.setOverride('kb-a', () => ({ modelId: 'model-a' }))
    const out = await scoped.llmFor('kb-a')({ system: 's', user: 'u' })
    expect(out).toBe('injected-result')
    expect(genMock).not.toHaveBeenCalled()
  })

  it('覆盖可更新（同 kb 重复 set 取最新）', async () => {
    const scoped = createKbScopedLlm('kb-brain-adjudicate')
    scoped.setOverride('kb-a', () => ({ modelId: 'old' }))
    await scoped.llmFor('kb-a')({ system: 's', user: 'u' })
    scoped.setOverride('kb-a', () => ({ modelId: 'new' }))
    await scoped.llmFor('kb-a')({ system: 's', user: 'u' })
    const models = genMock.mock.calls.map(c => (c[2] as { modelId?: string }).modelId)
    expect(models).toEqual(['old', 'new'])
  })
})
