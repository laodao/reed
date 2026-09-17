/**
 * 知识大脑配置（brain-config）测试
 *
 * 契约：null/空 = 关闭（返回 null）；非法 = 响亮失败（抛错带原因）；
 * partial 输入补全缺省值；stringify 写前校验。
 */
import { describe, it, expect } from 'vitest'
import {
  parseBrainConfig,
  stringifyBrainConfig,
  parseBrainState,
  defaultBrainConfig,
} from '@core/platform/services/kb-brain/brain-config'

describe('parseBrainConfig', () => {
  it('null/空串/"null" → 大脑关闭', () => {
    expect(parseBrainConfig(null)).toBeNull()
    expect(parseBrainConfig(undefined)).toBeNull()
    expect(parseBrainConfig('')).toBeNull()
    expect(parseBrainConfig('  ')).toBeNull()
    expect(parseBrainConfig('null')).toBeNull()
  })

  it('partial 输入补全缺省值', () => {
    const cfg = parseBrainConfig('{"enabled":true}')
    expect(cfg).not.toBeNull()
    expect(cfg!.enabled).toBe(true)
    expect(cfg!.digestion.enabled).toBe(true)
    expect(cfg!.patterns.plotEnabled).toBe(false) // 情节卡缺省关（高风险）
    expect(cfg!.patterns.settingEnabled).toBe(true)
    expect(cfg!.autoApproveThreshold).toBe(0.8)
    expect(cfg!.learning.enabled).toBe(false)
  })

  it('partial 嵌套覆盖：只改 patterns.plotEnabled 不丢其余', () => {
    const cfg = parseBrainConfig(
      '{"enabled":true,"patterns":{"settingEnabled":true,"plotEnabled":true}}',
    )
    expect(cfg!.patterns.plotEnabled).toBe(true)
    expect(cfg!.patterns.settingEnabled).toBe(true)
    expect(cfg!.distillation.importanceThreshold).toBe(50)
  })

  it('enabled=false 时其余字段仍解析（配置保留，入口早退）', () => {
    const cfg = parseBrainConfig(
      '{"enabled":false,"digestion":{"enabled":false}}',
    )
    expect(cfg!.enabled).toBe(false)
    expect(cfg!.digestion.enabled).toBe(false)
  })

  it('非法 JSON → 响亮失败', () => {
    expect(() => parseBrainConfig('{broken')).toThrow(/brainConfig 不是合法 JSON/)
  })

  it('schema 违例 → 响亮失败且带原因', () => {
    expect(() => parseBrainConfig('{"enabled":"yes"}')).toThrow(/brainConfig 校验失败/)
    expect(() => parseBrainConfig('{"enabled":true,"nope":1}')).toThrow(/校验失败/) // additionalProperties
    expect(() => parseBrainConfig('{"enabled":true,"autoApproveThreshold":2}')).toThrow(/校验失败/) // 超范围
    expect(() => parseBrainConfig('{"digestion":{"enabled":true}}')).toThrow(/校验失败/) // 缺 enabled
  })

  it('roundtrip：stringify(parse(x)) 可再次 parse', () => {
    const cfg = defaultBrainConfig(true)
    const raw = stringifyBrainConfig(cfg)
    const again = parseBrainConfig(raw)
    expect(again).toEqual(cfg)
  })

  it('stringify 拒绝非法对象', () => {
    expect(() => stringifyBrainConfig({ enabled: false } as never)).not.toThrow()
    expect(() => stringifyBrainConfig({ foo: 1 } as never)).toThrow(/校验失败/)
  })
})

describe('parseBrainState', () => {
  it('空 → 初始态', () => {
    expect(parseBrainState(null)).toEqual({ importance: 0, lastDistillAt: null })
  })
  it('损坏 JSON → 初始态（运行态容错）', () => {
    expect(parseBrainState('{bad')).toEqual({ importance: 0, lastDistillAt: null })
  })
  it('正常解析', () => {
    const s = parseBrainState('{"importance":12,"lastDistillAt":"2026-09-16T00:00:00Z"}')
    expect(s.importance).toBe(12)
    expect(s.lastDistillAt).toBe('2026-09-16T00:00:00Z')
  })
})
