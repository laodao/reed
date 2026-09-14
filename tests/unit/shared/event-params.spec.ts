/**
 * 事件系统参数测试（总线 + 归档）
 * @module tests/unit/shared/event-params
 *
 * 背景（2026-09-13 参数设置第十二批）：事件总线与归档作业是**进程级单例**，
 * 行为参数（重试次数/扫表间隔与批量/在途上限/保留天数）此前写死在各自服务里。
 *
 * 这一批**不做持有者**：没有"运行时现读点"，加持有者等于引入无用机制；
 * 装配处（`getEventBus` / `startEventArchiveJob`）直接调 `eventParamsFromSettings` 解析。
 * 因此设置页如实标注"改动需重启客户端"（登记表里 `effect: 'restart'`）。
 */

import { describe, it, expect } from 'vitest'
import { eventParamsFromSettings } from '@shared/utils/event-params'
import { EVENT_PARAMS_DEFAULTS, EVENT_PARAMS_LIMITS } from '@shared/types/event-params.types'
import { getModuleParams } from '@shared/constants/module-params'
import { moduleParamSettingsKeys, resolveModuleParams } from '@shared/utils/module-params'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'

const DEF = getModuleParams('eventSystem')!

describe('登记表：事件系统覆盖三个键', () => {
  it('护栏（立即生效）+ 总线/归档（重启生效）分别落在各自键上', () => {
    expect(moduleParamSettingsKeys(DEF).sort()).toEqual(
      [SETTINGS_KEYS.agentBudget, SETTINGS_KEYS.eventBus, SETTINGS_KEYS.eventArchive].sort(),
    )
    const r = resolveModuleParams(DEF, {})
    const entry = (k: string) => r.groups.flatMap((g) => g.entries).find((e) => e.valueKey === k)!
    expect(entry('guards.maxEventPayloadBytes').settingsKey).toBe(SETTINGS_KEYS.agentBudget)
    expect(entry('guards.maxEventPayloadBytes').effect).toBe('immediate')
    expect(entry('maxAttempts').settingsKey).toBe(SETTINGS_KEYS.eventBus)
    expect(entry('maxAttempts').effect).toBe('restart')
    expect(entry('retentionDays').settingsKey).toBe(SETTINGS_KEYS.eventArchive)
    expect(entry('retentionDays').effect).toBe('restart')
  })

  it('默认值 = 改造前写死的常量', () => {
    const r = resolveModuleParams(DEF, {})
    expect(r.values['maxAttempts']).toBe(5)
    expect(r.values['sweepIntervalMs']).toBe(2_000)
    expect(r.values['scanBatchSize']).toBe(200)
    expect(r.values['maxInFlight']).toBe(1_000)
    expect(r.values['maxAnonymousInFlight']).toBe(1_000)
    expect(r.values['retentionDays']).toBe(90)
    expect(r.values['intervalMs']).toBe(24 * 60 * 60 * 1000)
    expect(r.values['batchSize']).toBe(1_000)
  })

  it('默认值不超过硬上限', () => {
    for (const group of Object.keys(EVENT_PARAMS_DEFAULTS) as Array<'bus' | 'archive'>) {
      const d = EVENT_PARAMS_DEFAULTS[group] as unknown as Record<string, number>
      const l = EVENT_PARAMS_LIMITS[group] as unknown as Record<string, number>
      for (const key of Object.keys(d)) expect(d[key], `${group}.${key}`).toBeLessThanOrEqual(l[key])
    }
  })
})

describe('eventParamsFromSettings（装配处用的解析）', () => {
  it('缺省/垃圾载荷 → 内置默认（配置坏了不能让总线起不来）', () => {
    expect(eventParamsFromSettings({})).toEqual(EVENT_PARAMS_DEFAULTS)
    expect(eventParamsFromSettings({ [SETTINGS_KEYS.eventBus]: 42 })).toEqual(EVENT_PARAMS_DEFAULTS)
  })

  it('读取配置并夹取上限', () => {
    const parsed = eventParamsFromSettings({
      [SETTINGS_KEYS.eventBus]: { maxAttempts: 9, scanBatchSize: 999_999 },
      [SETTINGS_KEYS.eventArchive]: { retentionDays: 30 },
    })
    expect(parsed.bus.maxAttempts).toBe(9)
    expect(parsed.bus.scanBatchSize).toBe(EVENT_PARAMS_LIMITS.bus.scanBatchSize)
    expect(parsed.archive.retentionDays).toBe(30)
    expect(parsed.archive.batchSize).toBe(EVENT_PARAMS_DEFAULTS.archive.batchSize)
  })
})
