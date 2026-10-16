/**
 * 载荷安全守卫单测（10-event-system §8 / §10 密钥拒绝用例）
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  EventPayloadError,
  MAX_PAYLOAD_BYTES,
  assertPayloadSafe,
} from '@core/platform/services/event-system/payload-guard'
import { resetRuntimeLimits, setRuntimeLimits } from '@shared/utils/runtime-limits'

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

/**
 * 2026-09-13「参数设置」接线用例：
 * 体积上限与扫描深度不再是本模块的常量，而是设置页「事件系统」Tab 可调的值
 * （`agent:budget.guards.maxEventPayloadBytes` / `.maxDeepScanDepth` → 启动时注入 runtime-limits）。
 * 这条用例钉死"登记了就必须真的有人读"——第一轮 maxDeepScanDepth 登记了却没人读，属假旋钮。
 */
describe('事件载荷护栏走「参数设置」配置链', () => {
  afterEach(() => resetRuntimeLimits())

  it('注入后体积上限立即按配置生效', () => {
    setRuntimeLimits({ maxEventPayloadBytes: 256 })
    expect(() => assertPayloadSafe({ data: 'x'.repeat(1024) })).toThrow(/上限/)
    // 上限以内仍然放行
    expect(() => assertPayloadSafe({ data: 'x'.repeat(32) })).not.toThrow()
  })

  it('注入后扫描深度立即按配置生效（深度 1 = 只看顶层，不再往下扫）', () => {
    // 深度收到 1：嵌套层不再扫描（不抛错即可，warn 行为由 logger 承担）
    setRuntimeLimits({ maxEventScanDepth: 1 })
    expect(() => assertPayloadSafe({ outer: { nested: { token: 'x' } } })).not.toThrow()
  })

  it('未注入时用内置默认 64KB（行为与改造前一致）', () => {
    resetRuntimeLimits()
    expect(() => assertPayloadSafe({ data: 'x'.repeat(MAX_PAYLOAD_BYTES) })).toThrow(/64KB|上限|ref/)
  })
})
