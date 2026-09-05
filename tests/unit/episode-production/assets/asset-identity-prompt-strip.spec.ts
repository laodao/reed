/**
 * asset-identity-prompt · 系统约束剥离（stripSystemConstraints）
 * @module tests/unit/episode-production/assets/asset-identity-prompt-strip
 *
 * 验证：落库的完整 prompt（用户内容 + 系统约束）回填输入框前剥离系统段，
 * 避免用户基于完整拼接再次生成时约束重复追加 / 串 slot。
 */

import { describe, it, expect } from 'vitest'
import {
  stripSystemConstraints,
  appendEraConstraint,
} from '@core/platform/episode-production/assets/prompts/asset-identity-prompt'

describe('asset-identity-prompt · stripSystemConstraints（剥离系统追加段）', () => {
  it('剥离主图完整 prompt 中的 bust 约束段，保留用户内容', () => {
    const full =
      '杜十娘，清丽脱俗，半身定妆照（bust portrait, upper body shot, head and shoulders visible, waist-up），纯白背景（pure white background, clean white backdrop, no shadow on background）, 纯色背景（plain solid color background, no scenery, no ground），正面均匀光照、无任何阴影（front flat even lighting, shadowless）'
    const out = stripSystemConstraints(full)
    expect(out).toBe('杜十娘，清丽脱俗')
    expect(out).not.toContain('半身定妆照')
    expect(out).not.toContain('纯白背景')
    expect(out).not.toContain('正面均匀光照')
  })

  it('剥离年代特征约束段', () => {
    const full = appendEraConstraint('角色描述', { era: '明朝万历年间', region: '北京' })
    const out = stripSystemConstraints(full)
    expect(out).toBe('角色描述')
    expect(out).not.toContain('人物服饰')
  })

  it('剥离身份段里的故事年代/地域/背景标记', () => {
    const full = '角色描述，故事年代：明朝万历年间，故事地域：北京，故事背景：江南水乡'
    const out = stripSystemConstraints(full)
    expect(out).toBe('角色描述')
  })

  it('剥离身份保持段', () => {
    const full = '角色描述，保持人物身份（preserve character identity）'
    const out = stripSystemConstraints(full)
    expect(out).toBe('角色描述')
  })

  it('纯净内容（无系统段）原样返回', () => {
    const clean = '风韵犹存的中年妇人，珠翠满身，精明世故'
    expect(stripSystemConstraints(clean)).toBe(clean)
  })

  it('剥离后清理连续/首尾中文逗号', () => {
    const full = '角色描述，半身定妆照（bust portrait），，纯白背景（pure white）'
    const out = stripSystemConstraints(full)
    expect(out).toBe('角色描述')
  })

  it('用户自己写的"直立全身（…）"也会被剥离（生成时会按 framing 重新追加）', () => {
    const full = '人物描述，直立全身（standing full body）'
    const out = stripSystemConstraints(full)
    expect(out).toBe('人物描述')
  })
})
