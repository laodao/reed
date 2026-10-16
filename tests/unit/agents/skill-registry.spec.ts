/**
 * Skill registry · spec（Phase 4 D4，spec 2026-05-09 §3.2 D4 · P-21）
 */

import { describe, it, expect } from 'vitest'
import * as registryRel from '../../../src/agents/skills/registry'

describe('Skill registry', () => {
  it('ALL_SKILLS 含至少 8 个 skill', () => {
    expect(registryRel.ALL_SKILLS.length).toBeGreaterThanOrEqual(8)
  })

  it('每个 skill 有完整元数据', () => {
    for (const s of registryRel.ALL_SKILLS) {
      expect(s.name).toMatch(/^[a-z][\w-]+$/)
      expect(s.displayName.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
      expect(['asset', 'narrative', 'render', 'compose']).toContain(s.category)
      expect(s.inputSchema).toBeTruthy()
      expect(s.outputSchema).toBeTruthy()
      expect(Array.isArray(s.errors)).toBe(true)
      expect(s.rateLimitPerHour).toBeGreaterThan(0)
      expect(typeof s.execute).toBe('function')
    }
  })

  it('skill name 唯一', () => {
    const names = registryRel.ALL_SKILLS.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('findSkill 反查正确', () => {
    expect(registryRel.findSkill('character-three-views')).not.toBeNull()
    expect(registryRel.findSkill('list-skills')).not.toBeNull()
    expect(registryRel.findSkill('not-exist')).toBeNull()
  })

  it('list-skills skill execute → 返回所有 skill 元数据', async () => {
    const skill = registryRel.findSkill('list-skills')
    expect(skill).not.toBeNull()
    const data = await skill!.execute({} as any, {})
    expect(Array.isArray(data)).toBe(true)
    expect((data as any[]).length).toBe(registryRel.ALL_SKILLS.length)
  })
})
