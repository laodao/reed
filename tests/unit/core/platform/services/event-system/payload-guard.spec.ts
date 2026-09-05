/**
 * 载荷安全守卫单测（10-event-system §8 / §10 密钥拒绝用例）
 */
import { describe, it, expect } from 'vitest'
import {
  EventPayloadError,
  MAX_PAYLOAD_BYTES,
  assertPayloadSafe,
} from '@core/platform/services/event-system/payload-guard'

describe('assertPayloadSafe 密钥键名拒绝', () => {
  it.each([
    ['password'],
    ['Password'],
    ['pass'],
    ['secret'],
    ['token'],
    ['access_token'],
    ['apiKey'],
    ['api_key'],
    ['api-key'],
    ['credential'],
    ['credentials'],
    ['privateKey'],
    ['private_key'],
  ])('顶层键 %s 命中密钥模式 → 拒绝发布', key => {
    expect(() => assertPayloadSafe({ [key]: 'x', foo: 1 })).toThrow(EventPayloadError)
  })

  it('普通键放行', () => {
    expect(() => assertPayloadSafe({ documentId: 'd1', status: 'completed' })).not.toThrow()
    expect(() => assertPayloadSafe({ runId: 'r1', qualityScore: 0.9 })).not.toThrow()
  })

  it('深层嵌套密钥键名只 warn 不拒绝', () => {
    expect(() =>
      assertPayloadSafe({ outer: { nested: { token: 'x' } }, documentId: 'd1' })
    ).not.toThrow()
  })

  it('非对象载荷放行（string/number/null）', () => {
    expect(() => assertPayloadSafe('plain')).not.toThrow()
    expect(() => assertPayloadSafe(42)).not.toThrow()
    expect(() => assertPayloadSafe(null)).not.toThrow()
  })
})

describe('assertPayloadSafe 64KB 上限', () => {
  it('超限拒绝并提示引用形态', () => {
    const big = { data: 'x'.repeat(MAX_PAYLOAD_BYTES) }
    expect(() => assertPayloadSafe(big)).toThrow(/64KB|上限|ref/)
  })

  it('边界内放行并返回序列化结果', () => {
    const payload = { data: 'x'.repeat(1024) }
    const json = assertPayloadSafe(payload)
    expect(JSON.parse(json)).toEqual(payload)
  })
})

describe('assertPayloadSafe 不可序列化', () => {
  it('循环引用拒绝', () => {
    const a: Record<string, unknown> = {}
    a.self = a
    expect(() => assertPayloadSafe(a)).toThrow(EventPayloadError)
  })
})
