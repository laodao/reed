/**
 * 工具线上名兼容单测（41 号——pack:<id>:<name> 冒号被 OpenAI 兼容 API 拒绝的平台缺口）
 * 锚点：规范名折叠合法 / 64 上限确定性截断+摘要 / 碰撞消解确定性 / 映射双射可逆。
 */

import { describe, expect, it } from 'vitest'
import {
  WIRE_NAME_MAX,
  WIRE_NAME_RE,
  toWireName,
  buildWireNameMap,
} from '@core/platform/agent-runtime/tools/wire-name'

describe('toWireName', () => {
  it('pack 冒号名折叠为规范合法形态（OpenAI/Anthropic ^[a-zA-Z0-9_-]{1,64}$）', () => {
    const wire = toWireName('pack:lw-agent:generate_overview')
    expect(wire).toBe('pack_lw-agent_generate_overview')
    expect(WIRE_NAME_RE.test(wire)).toBe(true)
  })

  it('裸名原样保留', () => {
    expect(toWireName('http_get')).toBe('http_get')
  })

  it('超长截断：≤64 且带确定性摘要后缀（不同规范名不同后缀）', () => {
    const a = 'pack:very-long-pack-id:also_very_long_tool_base_name_aaaaaaaaaaaaaaaaaa'
    const b = 'pack:very-long-pack-id:also_very_long_tool_base_name_aaaaaaaaaaaaaaaaab'
    const wa = toWireName(a)
    const wb = toWireName(b)
    expect(wa.length).toBeLessThanOrEqual(WIRE_NAME_MAX)
    expect(wb.length).toBeLessThanOrEqual(WIRE_NAME_MAX)
    expect(wa.slice(0, 57)).toBe(wb.slice(0, 57)) // 截断前缀同形，靠摘要后缀区分
    expect(wa).not.toBe(wb) // 摘要后缀区分
    expect(toWireName(a)).toBe(wa) // 确定性
    expect(WIRE_NAME_RE.test(wa)).toBe(true)
  })
})

describe('buildWireNameMap', () => {
  it('双射可逆：canonicalToWire / wireToCanonical 互逆', () => {
    const names = ['http_get', 'pack:lw-agent:gen', 'pack:ep-agent:split']
    const { canonicalToWire, wireToCanonical } = buildWireNameMap(names)
    for (const canonical of names) {
      expect(wireToCanonical.get(canonicalToWire.get(canonical)!)).toBe(canonical)
    }
  })

  it('折叠碰撞消解：同形线上名按序加后缀，仍双射', () => {
    const names = ['pack:a:b', 'pack_a_b'] // 两者折叠同形
    const { canonicalToWire, wireToCanonical } = buildWireNameMap(names)
    const w1 = canonicalToWire.get('pack:a:b')!
    const w2 = canonicalToWire.get('pack_a_b')!
    expect(w1).not.toBe(w2)
    expect(WIRE_NAME_RE.test(w1)).toBe(true)
    expect(WIRE_NAME_RE.test(w2)).toBe(true)
    expect(wireToCanonical.get(w1)).toBe('pack:a:b')
    expect(wireToCanonical.get(w2)).toBe('pack_a_b')
  })

  it('确定性：同入参同序 → 同映射（run 内稳定）', () => {
    const names = ['pack:x:y', 'http_get']
    const m1 = buildWireNameMap(names)
    const m2 = buildWireNameMap(names)
    expect([...m1.canonicalToWire.entries()]).toEqual([...m2.canonicalToWire.entries()])
  })
})

describe('42号 review 回归：碰撞消解不击穿 64 上限 + 内容派生后缀', () => {
  it('折叠碰撞且折叠长 ≥63：消解后线上名恒合法（曾叠出 65 字符）', () => {
    const longA = 'pack:' + 'a'.repeat(58)
    const longB = 'pack_' + 'a'.repeat(58) // 与 longA 折叠同形（63 字符）
    const { canonicalToWire, wireToCanonical } = buildWireNameMap([longA, longB])
    const w1 = canonicalToWire.get(longA)!
    const w2 = canonicalToWire.get(longB)!
    for (const w of [w1, w2]) {
      expect(w.length).toBeLessThanOrEqual(64)
      expect(WIRE_NAME_RE.test(w)).toBe(true)
    }
    expect(w1).not.toBe(w2)
    expect(wireToCanonical.get(w1)).toBe(longA)
    expect(wireToCanonical.get(w2)).toBe(longB)
  })

  it('内容派生后缀：同集合内与顺序无关（序号后缀曾按序翻转归属）', () => {
    const a = 'pack:x:y'
    const b = 'pack_x_y'
    const m1 = buildWireNameMap([a, b]).canonicalToWire.get(b)!
    const m2 = buildWireNameMap([b, a]).canonicalToWire.get(b)!  // 顺序翻转
    expect(m1).toBe(m2) // 同集合确定性：b 的后缀由 b 的内容派生，不因声明顺序改变
    expect(canonicalToWireCheck(a)).toBe(canonicalToWireCheck(a))
    function canonicalToWireCheck(name: string): string | undefined {
      return buildWireNameMap([a, b]).canonicalToWire.get(name)
    }
    // 孤立集合无碰撞 → 无后缀（成员变化下的确定语义：按集合内容派生）
    expect(buildWireNameMap([b]).canonicalToWire.get(b)).toBe('pack_x_y')
  })

  it('空/全非法规范名折叠不产生空线上名（{1,64} 下限）', () => {
    expect(WIRE_NAME_RE.test(toWireName(''))).toBe(true)
    expect(WIRE_NAME_RE.test(toWireName(':::'))).toBe(true)
  })
})
