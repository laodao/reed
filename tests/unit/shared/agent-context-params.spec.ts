/**
 * 「上下文与记忆」参数测试（登记表 + 持有者 + 从 settings 解析）
 * @module tests/unit/shared/agent-context-params
 *
 * 背景（2026-09-13 参数设置第三批）：上下文压缩预算与记忆飞轮尺度以前是模块级常量，
 * 用户改不动。现在归入「参数设置 → 上下文与记忆」Tab（两个 settings 键）。
 *
 * 钉死：默认 = 改造前常量、超限夹取、非法值保留、**一个 Tab 跨两个 settings 键**的解析正确、
 * 以及百分比参数在读取点被换算成小数（0~1）。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  agentContextParams,
  agentContextParamsFromSettings,
  memoryConfidenceGate,
  memoryDedupOverlapThreshold,
  resetAgentContextParams,
  setAgentContextParams,
} from '@shared/utils/agent-context-params'
import {
  AGENT_CONTEXT_DEFAULTS,
  AGENT_CONTEXT_LIMITS,
} from '@shared/types/agent-context-params.types'
import { getModuleParams } from '@shared/constants/module-params'
import { moduleParamSettingsKeys, resolveModuleParams } from '@shared/utils/module-params'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'

const DEF = getModuleParams('agentContext')!

beforeEach(() => resetAgentContextParams())

describe('登记表：一个 Tab 覆盖两个 settings 键', () => {
  it('Tab 名与归属键（分组级 settingsKey 生效）', () => {
    expect(DEF.name).toBe('上下文与记忆')
    expect(moduleParamSettingsKeys(DEF).sort()).toEqual(
      [SETTINGS_KEYS.agentContext, SETTINGS_KEYS.agentMemory].sort(),
    )
  })

  it('两条记录分别落在各自的键上（摘要组在 agent:memory）', () => {
    const r = resolveModuleParams(DEF, {
      [SETTINGS_KEYS.agentContext]: { windowTokens: 12_000 },
      [SETTINGS_KEYS.agentMemory]: { assembleTopK: 7 },
    })
    const byKey = r.groups.flatMap((g) => g.entries.map((e) => [e.valueKey, e.settingsKey] as const))
    expect(byKey.find(([k]) => k === 'windowTokens')?.[1]).toBe(SETTINGS_KEYS.agentContext)
    expect(byKey.find(([k]) => k === 'assembleTopK')?.[1]).toBe(SETTINGS_KEYS.agentMemory)
    // 值进各自的树
    expect(r.trees[SETTINGS_KEYS.agentContext].windowTokens).toBe(12_000)
    expect(r.trees[SETTINGS_KEYS.agentMemory].assembleTopK).toBe(7)
    // 不串味：窗口不在 memory 树里
    expect(r.trees[SETTINGS_KEYS.agentMemory].windowTokens).toBeUndefined()
  })

  it('默认值 = 改造前写死的常量', () => {
    const r = resolveModuleParams(DEF, {})
    expect(r.values['windowTokens']).toBe(32_768)
    expect(r.values['userMessageBudgetTokens']).toBe(20_000)
    expect(r.values['protectedTailTokens']).toBe(8_000)
    expect(r.values['minPruneSavingsTokens']).toBe(4_000)
    expect(r.values['supersedeCollapseMinTokens']).toBe(1_500)
    expect(r.values['maxTurnSnapshotChars']).toBe(8_000)
    expect(r.values['assembleTopK']).toBe(3)
    expect(r.values['distillMaxItems']).toBe(3)
    expect(r.values['confidenceGatePercent']).toBe(70) // 0.7
    expect(r.values['dedupOverlapThresholdPercent']).toBe(60) // 0.6
    expect(r.values['maxDistillInputChars']).toBe(16_000)
    expect(r.values['archiveStaleDays']).toBe(30)
  })

  it('默认值不超过硬上限（登记表一致性）', () => {
    for (const group of Object.keys(AGENT_CONTEXT_DEFAULTS) as Array<'context' | 'memory'>) {
      const d = AGENT_CONTEXT_DEFAULTS[group] as unknown as Record<string, number>
      const l = AGENT_CONTEXT_LIMITS[group] as unknown as Record<string, number>
      for (const key of Object.keys(d)) expect(d[key], `${group}.${key}`).toBeLessThanOrEqual(l[key])
    }
  })
})

describe('持有者：注入 / 夹取 / 一致性', () => {
  it('不注入时 = 内置默认', () => {
    expect(agentContextParams()).toEqual(AGENT_CONTEXT_DEFAULTS)
  })

  it('覆盖生效、超上限夹取、非法值保留原值', () => {
    setAgentContextParams({ memory: { assembleTopK: 3 } })
    setAgentContextParams({ memory: { assembleTopK: 5 }, context: { windowTokens: 9_999_999 } })
    expect(agentContextParams().memory.assembleTopK).toBe(5)
    expect(agentContextParams().context.windowTokens).toBe(AGENT_CONTEXT_LIMITS.context.windowTokens)

    setAgentContextParams({ memory: { assembleTopK: -1, distillMaxItems: Number.NaN } })
    expect(agentContextParams().memory.assembleTopK).toBe(5) // 上次有效值保留
    expect(agentContextParams().memory.distillMaxItems).toBe(AGENT_CONTEXT_DEFAULTS.memory.distillMaxItems)
  })

  it('百分比参数在读取点换算成 0~1 小数（读取点不用改口径）', () => {
    expect(memoryConfidenceGate()).toBeCloseTo(0.7, 5)
    expect(memoryDedupOverlapThreshold()).toBeCloseTo(0.6, 5)
    setAgentContextParams({ memory: { confidenceGatePercent: 90, dedupOverlapThresholdPercent: 35 } })
    expect(memoryConfidenceGate()).toBeCloseTo(0.9, 5)
    expect(memoryDedupOverlapThreshold()).toBeCloseTo(0.35, 5)
  })

  it('reset 回到内置默认', () => {
    setAgentContextParams({ context: { windowTokens: 1000 } })
    expect(agentContextParams().context.windowTokens).toBe(1000)
    resetAgentContextParams()
    expect(agentContextParams()).toEqual(AGENT_CONTEXT_DEFAULTS)
  })
})

describe('从 settings 解析（与设置页同一口径）', () => {
  it('两个键各自解析、超限夹取、缺省回落默认', () => {
    const parsed = agentContextParamsFromSettings({
      [SETTINGS_KEYS.agentContext]: { windowTokens: 50_000, protectedTailTokens: 12_000 },
      [SETTINGS_KEYS.agentMemory]: { assembleTopK: 8, confidenceGatePercent: 999 },
    })
    expect(parsed.context.windowTokens).toBe(50_000)
    expect(parsed.context.protectedTailTokens).toBe(12_000)
    expect(parsed.context.userMessageBudgetTokens).toBe(AGENT_CONTEXT_DEFAULTS.context.userMessageBudgetTokens)
    expect(parsed.memory.assembleTopK).toBe(8)
    expect(parsed.memory.confidenceGatePercent).toBe(AGENT_CONTEXT_LIMITS.memory.confidenceGatePercent)
  })

  it('垃圾载荷一律回落默认（配置坏了不能让 Agent 跑不起来）', () => {
    for (const raw of [{}, { [SETTINGS_KEYS.agentContext]: 42 }, { [SETTINGS_KEYS.agentMemory]: [] }]) {
      expect(agentContextParamsFromSettings(raw)).toEqual(AGENT_CONTEXT_DEFAULTS)
    }
  })
})
