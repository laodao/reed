/**
 * asset-identity-prompt · metadata 解耦 spec（Phase 1 C2，spec 2026-05-09 ep-redesign）
 * @module tests/unit/episode-production/assets/asset-identity-prompt-metadata-shrink
 *
 * 验证 §3.2 P-2 决策：alias / role 是叙事 metadata，**不进** image prompt。
 *   - 别名（"三爷"）对图像生成无影响，是 noise
 *   - 定位（"主角 / 配角 / 反派"）是叙事概念非视觉概念
 *
 * 两者保留在 EffectiveAssetForPrompt 类型（兼容；调用方仍可读），但不再拼进 prompt。
 */

import { describe, it, expect } from 'vitest'
import {
  buildAssetIdentityPrompt,
  type EffectiveAssetForPrompt,
} from '@core/modules/episode-production/assets/prompts/asset-identity-prompt'

const fixture: EffectiveAssetForPrompt = {
  name: '李白',
  alias: '青莲居士',         // 应不进 prompt
  role: '主角',              // 应不进 prompt
  gender: '男',
  age: 25,
  race: 'east_asian',
  appearance: '剑眉星目，束发，腰间佩剑',
  outfit: '青衣长袍',
  outfitsExtra: ['素衣', '甲胄'],
  styleAnchors: ['国风工笔'],
}

describe('asset-identity-prompt · metadata 与 image prompt 解耦（v3 spec P-2）', () => {
  it('character prompt 不含 alias 字段（"别名：青莲居士"）', () => {
    const out = buildAssetIdentityPrompt('character', fixture, null)
    expect(out).not.toContain('别名')
    expect(out).not.toContain('青莲居士')
  })

  it('character prompt 不含 role 字段（"定位：主角"）', () => {
    const out = buildAssetIdentityPrompt('character', fixture, null)
    expect(out).not.toContain('定位')
    expect(out).not.toContain('主角')
  })

  it('视觉相关字段保留（外貌 / 服装 / 风格 / 性别 / 年龄 / 人种）', () => {
    const out = buildAssetIdentityPrompt('character', fixture, null)
    expect(out).toContain('外貌：剑眉星目')
    expect(out).toContain('服装：青衣长袍')
    expect(out).toContain('备选服装：素衣 / 甲胄')
    expect(out).toContain('风格：')
    expect(out).toContain('性别：男')
    expect(out).toContain('年龄：25')
    expect(out).toContain('人种：东亚')
  })

  it('name 字段保留（中英语料中常作人物特征引子）', () => {
    const out = buildAssetIdentityPrompt('character', fixture, null)
    expect(out).toContain('李白')
  })

  it('故事背景（era / region / extra）保留', () => {
    const out = buildAssetIdentityPrompt('character', fixture, {
      era: '唐朝',
      region: '长安',
      extra: '盛世',
    })
    expect(out).toContain('故事年代：唐朝')
    expect(out).toContain('故事地域：长安')
    expect(out).toContain('故事背景：盛世')
  })

  it('字符数缩减 — 删 alias / role 后明显短于 baseline', () => {
    const out = buildAssetIdentityPrompt('character', fixture, null)
    // baseline 有 "别名：青莲居士" (8 字) + "定位：主角" (6 字) + 2 个分隔符 = ~16 字
    // 实际收益 < 16 字，但应 < 800（含全部视觉字段 + 风格中英 + 上下文）
    expect(out.length).toBeLessThan(800)
    expect(out.length).toBeGreaterThan(50)  // 不能空
  })

  it('location / item 不受影响（无 alias/role 字段）', () => {
    const locFixture: EffectiveAssetForPrompt = {
      name: '黄鹤楼',
      description: '三层楼阁，江景',
      styleAnchors: ['国风'],
    }
    const out = buildAssetIdentityPrompt('location', locFixture, null)
    expect(out).toContain('黄鹤楼')
    expect(out).toContain('三层楼阁')
    expect(out).not.toContain('别名')
    expect(out).not.toContain('定位')
  })
})
