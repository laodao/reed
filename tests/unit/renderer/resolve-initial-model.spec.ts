/**
 * W1.5 主编模型选择器 stage 权威：resolveInitialModelSelection 纯函数单测
 */
import { describe, expect, it } from 'vitest'
import { resolveInitialModelSelection } from '@/utils/resolve-initial-model'

const opts = [
  { value: 'p1|m1', label: 'Provider1 / model-1' },
  { value: 'p2|m2', label: 'Provider2 / model-2' },
]

const lookup = new Map([
  ['p1', { name: 'Provider1', enabled: true }],
  ['p2', { name: 'Provider2', enabled: true }],
  ['p3', { name: 'Provider3', enabled: false }],
])

describe('resolveInitialModelSelection', () => {
  it('stage 配置命中列表 → 直接选中', () => {
    const r = resolveInitialModelSelection(
      [{ stage: 'story-room', providerConfigId: 'p1', modelId: 'm1' }],
      opts,
      lookup,
    )
    expect(r).toEqual({ value: 'p1|m1' })
  })

  it('配置列表外模型且 provider 启用 → 注入合成项（尊重显式配置，不静默覆盖）', () => {
    const r = resolveInitialModelSelection(
      [{ stage: 'story-room', providerConfigId: 'p1', modelId: 'custom-model' }],
      opts,
      lookup,
    )
    expect(r.value).toBe('p1|custom-model')
    expect(r.syntheticLabel).toBe('Provider1 / custom-model')
  })

  it('配置的 provider 未启用 → 跳到下一档 stage', () => {
    const r = resolveInitialModelSelection(
      [
        { stage: 'story-room', providerConfigId: 'p3', modelId: 'mx' },
        { stage: 'overview', providerConfigId: 'p2', modelId: 'm2' },
      ],
      opts,
      lookup,
    )
    expect(r.value).toBe('p2|m2')
  })

  it('兜底链顺序：story-room → overview → chapter', () => {
    const r = resolveInitialModelSelection(
      [
        { stage: 'chapter', providerConfigId: 'p1', modelId: 'm1' },
        { stage: 'overview', providerConfigId: 'p2', modelId: 'm2' },
      ],
      opts,
      lookup,
    )
    expect(r.value).toBe('p2|m2')
  })

  it('全部无配置 → 空串（调用方回退第一个模型）', () => {
    const r = resolveInitialModelSelection([], opts, lookup)
    expect(r.value).toBe('')
  })

  it('配置不完整（缺 modelId）→ 视同无配置跳过', () => {
    const r = resolveInitialModelSelection(
      [{ stage: 'story-room', providerConfigId: 'p1' }],
      opts,
      lookup,
    )
    expect(r.value).toBe('')
  })
})
