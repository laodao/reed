import { describe, it, expect } from 'vitest'
import {
  appendLocationNoHumanConstraint,
  mergeLocationNoHumanNegative,
  LOCATION_NO_HUMAN_SUFFIX,
  LOCATION_NO_HUMAN_NEGATIVE,
  appendLocationBaseComposition,
  mergeLocationBaseCompositionNegative,
  LOCATION_BASE_COMPOSITION_SUFFIX,
} from '@core/modules/episode-production/assets/prompts/location-constraints'

describe('location-constraints · 主图基础构图锚点', () => {
  it('主图构图约束含标准全景 + 水平构图 + 无畸变', () => {
    const suffix = appendLocationBaseComposition('')
    expect(suffix).toMatch(/wide establishing shot/i)
    expect(suffix).toMatch(/straight-on|level camera/i)
    expect(suffix).toMatch(/no fisheye|no extreme lens distortion/i)
  })

  it('空 prompt 返回完整构图后缀，已含则幂等', () => {
    expect(appendLocationBaseComposition('')).toBe(LOCATION_BASE_COMPOSITION_SUFFIX)
    const once = appendLocationBaseComposition('古风茶馆')
    const twice = appendLocationBaseComposition(once)
    expect(twice).toBe(once)
  })

  it('negative 禁极端视角/倾斜地平线', () => {
    const neg = mergeLocationBaseCompositionNegative(null)
    expect(neg).toMatch(/fisheye/)
    expect(neg).toMatch(/tilted horizon/)
  })
})

describe('location-constraints · 无人约束', () => {
  it('appendLocationNoHumanConstraint: 空 prompt 返回完整后缀', () => {
    expect(appendLocationNoHumanConstraint('')).toBe(LOCATION_NO_HUMAN_SUFFIX)
    expect(appendLocationNoHumanConstraint(null as unknown as string)).toBe(LOCATION_NO_HUMAN_SUFFIX)
    expect(appendLocationNoHumanConstraint(undefined as unknown as string)).toBe(LOCATION_NO_HUMAN_SUFFIX)
  })

  it('appendLocationNoHumanConstraint: 已含约束则幂等不重复', () => {
    const once = appendLocationNoHumanConstraint('古风茶馆')
    const twice = appendLocationNoHumanConstraint(once)
    expect(twice).toBe(once)
  })

  it('appendLocationNoHumanConstraint: 普通 prompt 用逗号拼接', () => {
    const out = appendLocationNoHumanConstraint('古风茶馆')
    expect(out.startsWith('古风茶馆，')).toBe(true)
    expect(out.endsWith(LOCATION_NO_HUMAN_SUFFIX)).toBe(true)
  })

  it('mergeLocationNoHumanNegative: 用户 negative 为空时返回无人 negative', () => {
    expect(mergeLocationNoHumanNegative()).toBe(LOCATION_NO_HUMAN_NEGATIVE)
    expect(mergeLocationNoHumanNegative('')).toBe(LOCATION_NO_HUMAN_NEGATIVE)
    expect(mergeLocationNoHumanNegative(null)).toBe(LOCATION_NO_HUMAN_NEGATIVE)
  })

  it('mergeLocationNoHumanNegative: 用户 negative 与无人 negative 拼接', () => {
    const out = mergeLocationNoHumanNegative('low quality')
    expect(out.startsWith('low quality, ')).toBe(true)
    expect(out.endsWith(LOCATION_NO_HUMAN_NEGATIVE)).toBe(true)
  })

  it('LOCATION_NO_HUMAN_NEGATIVE 关键人物词齐备', () => {
    for (const w of ['person', 'people', 'human', 'character', 'figure', 'crowd']) {
      expect(LOCATION_NO_HUMAN_NEGATIVE.includes(w)).toBe(true)
    }
  })
})
