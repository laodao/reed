import { describe, it, expect } from 'vitest'
import {
  buildSettingEnrichmentSystemPrompt,
  buildSettingEnrichmentUserPrompt,
  RACE_VALUES,
  type EnrichmentTodo,
  type EnrichmentContext,
} from '@core/platform/episode-production/assets/prompts/setting-enrichment-prompt'
import {
  buildPromptContext,
  createDefaultPromptContext,
} from '@core/platform/episode-production/prompts/prompt-context'

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

// ==================== §3.6 注入与单一事实源（2026-10-06） ====================

describe('§3.6 故事背景注入（此前第一批资产无时代锚）', () => {
  const ctx = buildPromptContext({
    storyEra: '唐代',
    storyRegion: '长安',
    storyExtra: '架空王朝',
  })

  it('system prompt 注入故事背景三行', () => {
    const sys = buildSettingEnrichmentSystemPrompt('character', ctx)
    expect(sys).toContain('## 故事背景')
    expect(sys).toContain('年代：唐代')
    expect(sys).toContain('地域：长安')
    expect(sys).toContain('其他：架空王朝')
  })

  it('声明新设计字段必须与背景时代地域相符', () => {
    const sys = buildSettingEnrichmentSystemPrompt('character', ctx)
    expect(sys).toContain('必须与该故事背景的时代与地域相符')
  })

  it('无上下文时不注入背景段（行为等价优化前）', () => {
    const sys = buildSettingEnrichmentSystemPrompt('character', createDefaultPromptContext())
    expect(sys).not.toContain('## 故事背景')
    expect(sys).not.toContain('必须与该故事背景的时代与地域相符')
  })

  it('三种 kind 都注入背景', () => {
    for (const kind of ['character', 'location', 'item'] as const) {
      expect(buildSettingEnrichmentSystemPrompt(kind, ctx)).toContain('年代：唐代')
    }
  })
})

describe('§3.6 role 字段用途说明（消除"填了被丢弃"的误导）', () => {
  it('注明 role 仅用于叙事参考、不影响图像生成', () => {
    const sys = buildSettingEnrichmentSystemPrompt('character')
    expect(sys).toContain('仅用于叙事参考，不影响图像生成')
    expect(sys).toContain('不进图像提示词')
  })

  it('仍然保留 role 字段本身（叙事元数据有独立用途）', () => {
    expect(buildSettingEnrichmentSystemPrompt('character')).toContain('role: 定位')
  })
})

describe('§3.6 race 枚举单一事实源', () => {
  it('导出 7 个枚举值', () => {
    expect(RACE_VALUES).toHaveLength(7)
    expect(RACE_VALUES).toContain('east_asian')
    expect(RACE_VALUES).toContain('south_american')
  })

  it('提示词里的枚举从 RACE_VALUES 渲染（不再手写字面量）', () => {
    const sys = buildSettingEnrichmentSystemPrompt('character')
    for (const v of RACE_VALUES) {
      expect(sys).toContain(`"${v}"`)
    }
  })

  it('枚举数量与提示词枚举项数一致（防两侧漂移）', () => {
    const sys = buildSettingEnrichmentSystemPrompt('character')
    const line = sys.split('\n').find((l) => l.startsWith('- race:')) ?? ''
    const quoted = line.match(/"[a-z_]+"/g) ?? []
    expect(quoted).toHaveLength(RACE_VALUES.length)
  })
})
