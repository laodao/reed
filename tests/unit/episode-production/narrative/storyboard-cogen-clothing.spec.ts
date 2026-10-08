/**
 * 约束 9 服饰/外貌校验强化单测（提示词优化方案 §4.3，Phase 3）
 * @module tests/unit/episode-production/narrative/storyboard-cogen-clothing
 *
 * 优化前口径（弱）：在整个 frameDescription 任意位置命中资产卡任意 ≥4 字片段 1 个即过。
 * §4.3 升级为：
 *   1. 限定【人物】段（四段式解析后取人物段匹配）；
 *   2. 片段下限 4 → 2 字，短片段要求词边界命中；
 *   3. 提示语优先推荐"像服饰外貌"的片段（不把叙述文本推荐给模型照抄）。
 */

import { describe, it, expect } from 'vitest'
import {
  appearanceFragments,
  buildCharacterFragments,
  extractFrameSections,
  fragmentMatches,
  rankFragmentsForHint,
  validateCogenOutput,
  MIN_FRAGMENT_LEN,
} from '@core/platform/episode-production/narrative/ai/storyboard-cogen'

describe('extractFrameSections · 四段式解析（§4.3 限定【人物】段）', () => {
  it('正确切出四段', () => {
    const s = extractFrameSections(
      '【场景】船舱。【人物】阿蘅着素白衣裙。【动作】转身。【氛围】冷青。',
    )
    expect(s.parsed).toBe(true)
    expect(s.scene).toContain('船舱')
    expect(s.character).toContain('素白衣裙')
    expect(s.action).toContain('转身')
    expect(s.atmosphere).toContain('冷青')
  })

  it('段内文本不串到相邻段', () => {
    const s = extractFrameSections(
      '【场景】场景文字。【人物】人物文字。【动作】动作文字。【氛围】氛围文字。',
    )
    expect(s.scene).not.toContain('人物文字')
    expect(s.character).not.toContain('动作文字')
  })

  it('缺段时 parsed=false 且 character 回退全文（保持可用）', () => {
    const s = extractFrameSections('阿蘅着素白衣裙站在船头')
    expect(s.parsed).toBe(false)
    expect(s.character).toBe('阿蘅着素白衣裙站在船头')
  })
})

describe('片段提取 · 下限 2 字（§4.3）', () => {
  it('MIN_FRAGMENT_LEN = 2', () => {
    expect(MIN_FRAGMENT_LEN).toBe(2)
  })

  it('2 字服饰词可参与校验（旧版 ≥4 字把它们全豁免）', () => {
    const frags = appearanceFragments('红衣，玉簪')
    expect(frags).toContain('红衣')
    expect(frags).toContain('玉簪')
  })

  it('单字不参与（信息量不足）', () => {
    expect(appearanceFragments('红，衣')).toEqual([])
  })

  it('折行不打断片段（去空白匹配）', () => {
    const frags = appearanceFragments('素白\n衣裙，外披披风')
    expect(frags).toContain('素白衣裙')
  })

  it('buildCharacterFragments 分要素', () => {
    const f = buildCharacterFragments({
      outfit: '深灰旧袍',
      description: '忘川渡口摆渡人',
      appearance: '面容枯瘦',
    })
    expect(f.outfit).toContain('深灰旧袍')
    expect(f.appearance).toContain('面容枯瘦')
    expect(f.description).toContain('忘川渡口摆渡人')
  })
})

describe('fragmentMatches · 词边界（§4.3 防假命中）', () => {
  it('短片段落在切分片段内部算命中', () => {
    expect(fragmentMatches('她身着红衣站在船头', '红衣')).toBe(true)
  })

  it('跨标点拼接不算命中（"红衣，架上" 不应命中 "红衣架上"）', () => {
    // 片段被标点切断后，拼接后的长片段不应命中
    expect(fragmentMatches('红衣，架上', '红衣架上')).toBe(false)
  })

  it('长片段普通包含即可', () => {
    expect(fragmentMatches('她身着素白衣裙', '素白衣裙')).toBe(true)
  })

  it('空片段不命中', () => {
    expect(fragmentMatches('任何文本', '')).toBe(false)
  })
})

describe('rankFragmentsForHint · 提示语排序（§4.3）', () => {
  it('服饰/外貌类片段排在叙述类之前', () => {
    const ranked = rankFragmentsForHint(['第一集主角', '素白衣裙', '不喝孟婆汤的活人', '黑发半挽'])
    expect(ranked[0]).toBe('素白衣裙')
    expect(ranked.indexOf('素白衣裙')).toBeLessThan(ranked.indexOf('第一集主角'))
  })

  it('同类中更长的片段优先（信息更多）', () => {
    const ranked = rankFragmentsForHint(['红衣', '素白衣裙外披披风'])
    expect(ranked[0]).toBe('素白衣裙外披披风')
  })
})

// ==================== 端到端校验行为 ====================

const EXISTING = [
  {
    kind: 'character' as const,
    id: 'cb_1',
    name: '角色甲',
    description: '第一集主角，年轻女性形象\n服饰：素白衣裙，外披淡青披风',
  },
  { kind: 'location' as const, id: 'lb_1', name: '渡船', description: '河上渡船' },
]

function output(frameDescription: string): any {
  return {
    assets: {
      characters: [],
      location: { name: '渡船', description: '河上渡船', existing: true },
      items: [],
    },
    shots: [
      {
        shotType: 'full',
        cameraAngle: 'eye_level',
        cameraMovement: 'static',
        duration: 5,
        frameDescription,
        characters: [{ name: '角色甲', position: 'left' }],
        itemNames: [],
        dialogueIds: [],
      },
      {
        shotType: 'close',
        cameraAngle: 'eye_level',
        cameraMovement: 'static',
        duration: 3,
        frameDescription: '【场景】船舱。【人物】无人物。【动作】静止。【氛围】冷。',
        characters: [],
        itemNames: [],
        dialogueIds: [],
      },
    ],
  }
}

describe('§4.3 端到端：[人物]段限定', () => {
  it('服饰原文出现在【人物】段 → 通过', () => {
    const errs = validateCogenOutput(
      output('【场景】船舱。【人物】角色甲着素白衣裙立于左侧。【动作】转身。【氛围】冷青。'),
      EXISTING,
    )
    expect(errs).toEqual([])
  })

  it('服饰原文只出现在【动作】段（旧口径会误判通过）→ 现在报错', () => {
    const errs = validateCogenOutput(
      output(
        '【场景】船舱。【人物】角色甲立于左侧。【动作】她整理素白衣裙的袖口。【氛围】冷青。',
      ),
      EXISTING,
    )
    expect(errs.length).toBe(1)
    expect(errs[0]).toContain('角色甲')
    expect(errs[0]).toContain('已按【人物】段校验')
  })

  it('服饰原文只出现在【场景】段 → 现在报错', () => {
    const errs = validateCogenOutput(
      output(
        '【场景】船舱一角的素白衣裙挂在架上（前场遗留）。【人物】角色甲立于左侧。【动作】转身。【氛围】冷青。',
      ),
      EXISTING,
    )
    expect(errs.length).toBe(1)
    expect(errs[0]).toContain('角色甲')
  })

  it('四段式的某段缺标记时按全文匹配（不因解析失败而误报服饰）', () => {
    // 注意：完全缺失四段会先被"约束 5 四段式"规则拦下（既有校验，非 §4.3 范围）。
    // 这里验证的是"解析不出四段时 extractFrameSections 回退全文"这一分支本身。
    const s = extractFrameSections('角色甲着素白衣裙站在船头')
    expect(s.parsed).toBe(false)
    expect(s.character).toBe('角色甲着素白衣裙站在船头')
  })

  it('纠错提示推荐服饰类片段而非叙述文本', () => {
    const errs = validateCogenOutput(
      output('【场景】船舱。【人物】角色甲着素色布衣。【动作】转身。【氛围】冷青。'),
      EXISTING,
    )
    expect(errs.length).toBe(1)
    // 不应把"第一集主角"这类叙述文本推荐给模型照抄
    expect(errs[0]).not.toContain('第一集主角')
    expect(errs[0]).toMatch(/素白衣裙|外披淡青披风|年轻女性形象|服饰/)
  })
})