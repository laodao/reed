/**
 * asset-identity-prompt · 设定锚点补全 + 古风硬约束 单测（2026-09-21 F）
 * @module tests/unit/episode-production/assets/asset-identity-prompt-setting-anchors
 */

import { describe, it, expect } from 'vitest'
import {
  appendAssetSettingAnchors,
  appendAncientEraConstraint,
  mergeAncientEraNegative,
  isAncientEra,
  ANCIENT_ERA_CONSTRAINT_SUFFIX,
  ANCIENT_ERA_NEGATIVE,
} from '@core/platform/episode-production/assets/prompts/asset-identity-prompt'

describe('appendAssetSettingAnchors · character', () => {
  const eff = {
    name: '玄清掌门',
    gender: 'male',
    age: 50,
    race: 'east_asian',
    appearance: '长须，眉目威严',
    outfit: '藏青道袍',
  }

  it('全缺失 → 补全性别/年龄/人种/外貌/服装', () => {
    const r = appendAssetSettingAnchors('character', eff, '玄清掌门')
    expect(r).toContain('人物设定锚点')
    expect(r).toContain('性别：男')
    expect(r).toContain('年龄：50岁')
    expect(r).toContain('人种：东亚')
    expect(r).toContain('外貌：长须，眉目威严')
    expect(r).toContain('服装：藏青道袍')
  })

  it('prompt 已含年龄数字与性别词 → 不重复追加', () => {
    const r = appendAssetSettingAnchors('character', eff, '玄清掌门，50岁男性，长须，眉目威严，藏青道袍，东亚面孔')
    expect(r).not.toContain('人物设定锚点')
  })

  it('幂等：已含锚点段原样返回', () => {
    const once = appendAssetSettingAnchors('character', eff, '玄清掌门')
    expect(appendAssetSettingAnchors('character', eff, once)).toBe(once)
  })

  it('部分缺失只补缺的（年龄已在 prompt，只补性别）', () => {
    const r = appendAssetSettingAnchors('character', { gender: 'female', age: 16 }, '掌门千金，16岁')
    expect(r).toContain('性别：女')
    expect(r).not.toContain('年龄：16岁')
  })

  it('eff 为空 / item 类型 → 原样返回', () => {
    expect(appendAssetSettingAnchors('character', null, 'abc')).toBe('abc')
    expect(appendAssetSettingAnchors('item', { name: '剑' }, '青龙剑')).toBe('青龙剑')
  })
})

describe('appendAssetSettingAnchors · location', () => {
  it('缺失规模/类型/氛围 → 追加地点设定锚点；已含不重复', () => {
    const eff = { locationType: 'exterior', scale: '巨大', moodTags: ['肃杀', '开阔'] }
    const r = appendAssetSettingAnchors('location', eff, '演武场')
    expect(r).toContain('地点设定锚点')
    expect(r).toContain('类型：exterior')
    expect(r).toContain('规模：巨大')
    expect(r).toContain('氛围：肃杀 / 开阔')
    // 幂等
    expect(appendAssetSettingAnchors('location', eff, r)).toBe(r)
    // 已含全部关键词 → 不追加
    const full = '演武场，exterior，巨大，肃杀，开阔'
    expect(appendAssetSettingAnchors('location', eff, full)).toBe(full)
  })
})

describe('古风硬约束（F2）', () => {
  it('isAncientEra 关键词命中', () => {
    expect(isAncientEra('宋朝')).toBe(true)
    expect(isAncientEra('古代武侠')).toBe(true)
    expect(isAncientEra('大唐盛世')).toBe(true)
    expect(isAncientEra('现代都市')).toBe(false)
    expect(isAncientEra('')).toBe(false)
    expect(isAncientEra(null)).toBe(false)
  })

  it('appendAncientEraConstraint：命中追加、幂等、非古风原样', () => {
    const r = appendAncientEraConstraint('演武场', '宋朝')
    expect(r).toContain(ANCIENT_ERA_CONSTRAINT_SUFFIX)
    expect(appendAncientEraConstraint(r, '宋朝')).toBe(r)
    expect(appendAncientEraConstraint('演武场', '现代')).toBe('演武场')
  })

  it('mergeAncientEraNegative：命中合并、幂等、非古风原样', () => {
    const r = mergeAncientEraNegative('blurry', '宋朝')
    expect(r).toBe(`blurry, ${ANCIENT_ERA_NEGATIVE}`)
    expect(mergeAncientEraNegative(r, '宋朝')).toBe(r)
    expect(mergeAncientEraNegative(undefined, '宋朝')).toBe(ANCIENT_ERA_NEGATIVE)
    expect(mergeAncientEraNegative('blurry', '现代')).toBe('blurry')
  })
})
