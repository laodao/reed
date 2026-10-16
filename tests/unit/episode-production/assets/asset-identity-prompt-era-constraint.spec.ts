/**
 * asset-identity-prompt · 时代特征约束（appendEraConstraint）
 * @module tests/unit/episode-production/assets/asset-identity-prompt-era-constraint
 *
 * 验证：用户编辑提示词（override）生成前自动追加故事年代/地域，
 * 确保人物服饰、发型、妆容符合时代特征；无年代不追加、已有约束不重复。
 */

import { describe, it, expect } from 'vitest'
import { appendEraConstraint } from '@core/platform/episode-production/assets/prompts/asset-identity-prompt'

describe('asset-identity-prompt · 时代特征约束 appendEraConstraint', () => {
  it('有年代 → 在末尾追加时代特征段（含服饰/发型/妆容）', () => {
    const out = appendEraConstraint('杜十娘，清丽脱俗', { era: '明朝万历年间', region: '北京' })
    expect(out).toContain('杜十娘，清丽脱俗')
    expect(out).toContain('明朝万历年间')
    expect(out).toContain('北京')
    expect(out).toContain('服饰、发型、妆容')
    expect(out).toContain('period-appropriate clothing')
  })

  it('只有年代无地域 → 只追加年代', () => {
    const out = appendEraConstraint('角色描述', { era: '唐朝', region: '' })
    expect(out).toContain('唐朝')
    expect(out).not.toContain('、的时代特征')
    expect(out).toContain('符合唐朝的时代特征')
  })

  it('无年代 → 原样返回', () => {
    const out = appendEraConstraint('角色描述', { era: '', region: '北京' })
    expect(out).toBe('角色描述')
  })

  it('无年代信息（undefined）→ 原样返回', () => {
    const out = appendEraConstraint('角色描述', null)
    expect(out).toBe('角色描述')
  })

  it('已包含相同约束 → 不重复追加', () => {
    const suffix = '人物服饰、发型、妆容符合明朝的时代特征（period-appropriate clothing, hairstyle and accessories）'
    const prompt = `角色描述，${suffix}`
    const out = appendEraConstraint(prompt, { era: '明朝', region: '' })
    expect(out).toBe(prompt)
  })

  it('空 prompt + 有年代 → 只返回约束段', () => {
    const out = appendEraConstraint('', { era: '宋朝', region: '汴京' })
    expect(out).toContain('宋朝')
    expect(out).toContain('汴京')
  })
})
