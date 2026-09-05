import { describe, it, expect } from 'vitest'
import {
  buildSettingEnrichmentSystemPrompt,
  buildSettingEnrichmentUserPrompt,
  type EnrichmentTodo,
  type EnrichmentContext,
} from '@core/platform/episode-production/assets/prompts/setting-enrichment-prompt'

describe('setting-enrichment-prompt', () => {
  it('system prompt 含设计师定位与忠实/合理设计/允许空缺三条规则', () => {
    const sys = buildSettingEnrichmentSystemPrompt('character')
    expect(sys.includes('设计师')).toBe(true)
    expect(sys.includes('忠实')).toBe(true)
    expect(sys.includes('合理')).toBe(true)
    expect(sys.includes('空缺') || sys.includes('null')).toBe(true)
  })

  it('system prompt 不同 kind 文案不一样', () => {
    expect(buildSettingEnrichmentSystemPrompt('character')).not.toBe(
      buildSettingEnrichmentSystemPrompt('location'),
    )
    expect(buildSettingEnrichmentSystemPrompt('character').includes('角色')).toBe(true)
    expect(buildSettingEnrichmentSystemPrompt('location').includes('地点')).toBe(true)
    expect(buildSettingEnrichmentSystemPrompt('item').includes('物品')).toBe(true)
  })

  it('user prompt 含原文 / 已有上下文 / 待补清单 / schema 提示', () => {
    const todo: EnrichmentTodo[] = [{ id: 'b1', name: '老者', alias: null }]
    const ctx: EnrichmentContext[] = [
      { name: '少年', fields: { age: 16, race: 'east_asian' } },
    ]
    const user = buildSettingEnrichmentUserPrompt({
      kind: 'character',
      originalText: '茶馆里有个老者',
      existingContext: ctx,
      todo,
    })
    expect(user.includes('茶馆里有个老者')).toBe(true)
    expect(user.includes('少年')).toBe(true)
    expect(user.includes('老者')).toBe(true)
  })

  it('user prompt: existingContext 为空仍可用', () => {
    const user = buildSettingEnrichmentUserPrompt({
      kind: 'location',
      originalText: '街角',
      existingContext: [],
      todo: [{ id: 'l1', name: '街角', alias: null }],
    })
    expect(user.includes('街角')).toBe(true)
  })
})
