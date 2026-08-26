/**
 * item-constraints · 身份保持约束 spec（Phase 1 C1，spec 2026-05-09 ep-redesign）
 * @module tests/unit/episode-production/assets/item-constraints
 *
 * 同 character-constraints.spec.ts — 验证物品派生身份保持约束已缩减。
 */

import { describe, it, expect } from 'vitest'
import {
  appendItemIdentityPreservation,
  mergeItemIdentityNegative,
  appendItemConstraints,
  mergeItemNegative,
} from '@core/modules/episode-production/assets/prompts/item-constraints'

describe('item-constraints · 主图硬约束（白背景 + 产品视角锚点）', () => {
  it('主图约束含纯白背景（非含糊纯色）', () => {
    const suffix = appendItemConstraints('一把青铜剑')
    expect(suffix).toMatch(/white background/i)
    expect(suffix).toMatch(/纯白背景|白色背景/)
  })

  it('主图约束含标准产品视角 + 完整无裁切', () => {
    const suffix = appendItemConstraints('')
    expect(suffix).toMatch(/standard product photography/i)
    expect(suffix).toMatch(/entire object fully visible|full object visible/i)
  })

  it('negative 禁杂背景/多人/裁切', () => {
    const neg = mergeItemNegative(null)
    expect(neg).toMatch(/busy background/)
    expect(neg).toMatch(/cropped/)
  })
})

describe('item-constraints · 身份保持约束（v3 spec 缩减后）', () => {
  describe('appendItemIdentityPreservation', () => {
    it('SUFFIX 极简（< 50 字符）— baseline 313 → 缩减 ≥ 80%', () => {
      expect(appendItemIdentityPreservation('').length).toBeLessThan(50)
    })

    it('SUFFIX 含中英双写身份保持核心语义', () => {
      const suffix = appendItemIdentityPreservation('')
      expect(suffix).toMatch(/身份|物品/)
      expect(suffix).toMatch(/identity|object/i)
    })

    it('已含约束时幂等', () => {
      const once = appendItemIdentityPreservation('一把青铜剑')
      const twice = appendItemIdentityPreservation(once)
      expect(twice).toBe(once)
    })

    it('普通 prompt 用全角逗号拼接', () => {
      const out = appendItemIdentityPreservation('一把青铜剑')
      expect(out.startsWith('一把青铜剑，')).toBe(true)
    })
  })

  describe('mergeItemIdentityNegative', () => {
    it('NEGATIVE token 数 < 5', () => {
      const merged = mergeItemIdentityNegative(null)
      const tokens = merged.split(',').map((s) => s.trim()).filter(Boolean)
      expect(tokens.length).toBeLessThan(5)
    })

    it('用户 negative 非空时拼接', () => {
      const merged = mergeItemIdentityNegative('low quality')
      expect(merged.startsWith('low quality, ')).toBe(true)
    })
  })
})
