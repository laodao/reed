/**
 * character-constraints · 身份保持约束 spec（Phase 1 C1，spec 2026-05-09 ep-redesign）
 * @module tests/unit/episode-production/assets/character-constraints
 *
 * 验证 §3.2 P-1 决策：缩减 character / item 派生身份保持文本约束（让 reference image
 * latent guidance 主导一致性，prompt 不再被冗长 anchor 稀释）。
 *
 * 测试要点：
 *   - SUFFIX 极简（< 30 字）
 *   - NEGATIVE token 数 < 5
 *   - 函数签名 / 行为（幂等 / 拼接）不变
 */

import { describe, it, expect } from 'vitest'
import {
  appendCharacterIdentityPreservation,
  mergeCharacterIdentityNegative,
} from '@core/modules/episode-production/assets/prompts/character-constraints'

describe('character-constraints · 身份保持约束（v3 spec 缩减后）', () => {
  describe('appendCharacterIdentityPreservation', () => {
    it('SUFFIX 极简（< 50 字符）— 让 reference image 主导一致性（baseline 359 → 缩减 ≥ 85%）', () => {
      const suffix = appendCharacterIdentityPreservation('')
      expect(suffix.length).toBeLessThan(50)
    })

    it('SUFFIX 含中英双写身份保持核心语义', () => {
      const suffix = appendCharacterIdentityPreservation('')
      expect(suffix).toMatch(/身份/)
      expect(suffix).toMatch(/identity/i)
    })

    it('已含约束时幂等不重复', () => {
      const once = appendCharacterIdentityPreservation('青年男子，剑眉')
      const twice = appendCharacterIdentityPreservation(once)
      expect(twice).toBe(once)
    })

    it('普通 prompt 用全角逗号拼接', () => {
      const out = appendCharacterIdentityPreservation('青年男子')
      expect(out.startsWith('青年男子，')).toBe(true)
    })

    it('空 / null / undefined 返回纯后缀', () => {
      const ref = appendCharacterIdentityPreservation('')
      expect(appendCharacterIdentityPreservation(null as unknown as string)).toBe(ref)
      expect(appendCharacterIdentityPreservation(undefined as unknown as string)).toBe(ref)
    })
  })

  describe('mergeCharacterIdentityNegative', () => {
    it('NEGATIVE token 数 < 5 — 不堆 20+ 词的过度约束', () => {
      const merged = mergeCharacterIdentityNegative(null)
      const tokens = merged.split(',').map((s) => s.trim()).filter(Boolean)
      expect(tokens.length).toBeLessThan(5)
    })

    it('用户 negative 为空时返回纯身份 negative', () => {
      const a = mergeCharacterIdentityNegative()
      const b = mergeCharacterIdentityNegative('')
      const c = mergeCharacterIdentityNegative(null)
      expect(a).toBe(b)
      expect(b).toBe(c)
    })

    it('用户 negative 非空时拼接（用户在前，约束在后）', () => {
      const merged = mergeCharacterIdentityNegative('blurry, low quality')
      expect(merged.startsWith('blurry, low quality, ')).toBe(true)
    })

    it('NEGATIVE 含核心 anti-id token', () => {
      const merged = mergeCharacterIdentityNegative(null)
      expect(merged).toMatch(/different face/i)
    })
  })
})
