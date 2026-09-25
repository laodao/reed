/**
 * storyboard-cogen validateCogenOutput 单测（2026-09-18 约束 9 落地）
 *
 * 服饰/外貌原文校验：
 * - 分镜【人物】段必须逐字命中角色资产卡至少一个片段（≥4 字）
 * - 新资产：outfit + description 提供片段；已有资产：注入的 description 提供片段
 * - 全漂移（一个片段都不含）→ 校验错误（纠错重试会拿到具体片段提示）
 * - 资产卡无 ≥4 字片段 → 该角色跳过校验（不误伤）
 */

import { describe, expect, it } from 'vitest'
import { validateCogenOutput } from '@core/platform/episode-production/narrative/ai/storyboard-cogen'

const EXISTING = [
  {
    kind: 'character' as const,
    id: 'cb_1',
    name: '阿蘅',
    description: '第一集主角，不喝孟婆汤的活人，年轻女性形象\n服饰：素白衣裙，外披淡青披风，黑发半挽',
  },
  { kind: 'location' as const, id: 'lb_1', name: '忘川渡船', description: '忘川河上的渡船，阴森幽暗' },
]

function validOutput(frameDescription: string) {
  return {
    assets: {
      characters: [
        {
          name: '陈舟',
          description: '忘川渡口摆渡人，守船三百年的中年男子',
          outfit: '深灰旧袍，腰间挂一枚灯芯信物',
          existing: false,
        },
      ],
      location: { name: '忘川渡船', description: '忘川河上的渡船，阴森幽暗', existing: true },
      items: [],
    },
    shots: [
      {
        shotType: 'full',
        cameraAngle: 'eye_level',
        cameraMovement: 'static',
        duration: 5,
        frameDescription,
        characters: [
          { name: '阿蘅', position: 'left' },
          { name: '陈舟', position: 'right' },
        ],
        itemNames: [],
        dialogueIds: [],
      },
      {
        shotType: 'close',
        cameraAngle: 'eye_level',
        cameraMovement: 'static',
        duration: 3,
        frameDescription: '【场景】船舱。【人物】无人物出镜。【动作】名册页角颤动。【氛围】冷青。',
        characters: [],
        itemNames: [],
        dialogueIds: [],
      },
    ],
  }
}

describe('validateCogenOutput · 约束 9 服饰/外貌原文校验', () => {
  it('【人物】段命中已有资产与新资产各一个片段 → 通过', () => {
    const out = validOutput(
      '【场景】忘川渡船船舱。【人物】阿蘅：素白衣裙，立于左侧；陈舟：深灰旧袍，立于右侧。【动作】对视。【氛围】冷青。',
    )
    expect(validateCogenOutput(out, EXISTING)).toEqual([])
  })

  it('已有资产服饰全漂移（披风写成布衣）→ 报错并给出可引用片段', () => {
    const out = validOutput(
      '【场景】忘川渡船船舱。【人物】阿蘅：素色布衣，发髻简单，立于左侧；陈舟：深灰旧袍，立于右侧。【动作】对视。【氛围】冷青。',
    )
    const errors = validateCogenOutput(out, EXISTING)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('阿蘅')
    expect(errors[0]).toContain('素白衣裙')
  })

  it('新资产 outfit 片段缺失 → 报错', () => {
    const out = validOutput(
      '【场景】船舱。【人物】阿蘅：素白衣裙；陈舟：深青色宽袖长袍，腰间系黑带。【动作】对视。【氛围】冷青。',
    )
    const errors = validateCogenOutput(out, EXISTING)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('陈舟')
    expect(errors[0]).toContain('深灰旧袍')
  })

  it('片段跨空白/换行也能命中（去空白匹配）', () => {
    const out = validOutput(
      '【场景】船舱。【人物】阿蘅：身着素白\n衣裙；陈舟：深灰旧袍。【动作】对视。【氛围】冷青。',
    )
    expect(validateCogenOutput(out, EXISTING)).toEqual([])
  })

  it('资产卡无 ≥4 字片段的角色跳过校验', () => {
    const existing = [
      { kind: 'character' as const, id: 'cb_2', name: '路人', description: '男' },
      { kind: 'location' as const, id: 'lb_1', name: '忘川渡船', description: '渡船' },
    ]
    const out = validOutput(
      '【场景】船舱。【人物】阿蘅：素白衣裙；陈舟：深灰旧袍。【动作】对视。【氛围】冷青。',
    )
    // 把阿蘅换成"路人"：无片段可校验 → 不因约束 9 报错
    out.shots[0].characters = [
      { name: '路人', position: 'left' },
      { name: '陈舟', position: 'right' },
    ]
    expect(validateCogenOutput(out, existing)).toEqual([])
  })
})
