/**
 * 「工具与审批」参数测试（登记表 + 持有者 + 读取点接线）
 * @module tests/unit/core/platform/agent-runtime/agent-tool-params
 *
 * 背景（2026-09-13 参数设置第四批）：调研发现两处"改不动"的默认值：
 * - 工具执行超时 120s，且**有两份默认值**（工具注册表 / Agent 循环），宿主构造时都没传；
 * - 审批超时 5 分钟（剧集制作另有一份 30 分钟），用户离开一会儿回来审批卡就超时了。
 *
 * 这里既测登记表/持有者，也用**真实函数**证明设置页改的值确实改变行为
 * （`serializeToolResult` 的数组保留项数 / 二进制字段长度、`AgentToolRegistry` 的超时）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  agentToolParams,
  agentToolParamsFromSettings,
  resetAgentToolParams,
  setAgentToolParams,
} from '@shared/utils/agent-tool-params'
import { AGENT_TOOL_DEFAULTS, AGENT_TOOL_LIMITS } from '@shared/types/agent-tool-params.types'
import { getModuleParams } from '@shared/constants/module-params'
import { moduleParamSettingsKeys, resolveModuleParams } from '@shared/utils/module-params'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'
import { AgentToolRegistry, serializeToolResult } from '@core/platform/agent-runtime/tools/registry'

const DEF = getModuleParams('agentTools')!

beforeEach(() => resetAgentToolParams())
afterEach(() => resetAgentToolParams())

describe('登记表：一个 Tab 覆盖 agent:tools + agent:approval', () => {
  it('归属键与分组', () => {
    expect(DEF.name).toBe('工具与审批')
    expect(moduleParamSettingsKeys(DEF).sort()).toEqual(
      [SETTINGS_KEYS.agentTools, SETTINGS_KEYS.agentApproval].sort(),
    )
  })

  it('默认值 = 改造前写死的常量；两条记录落在各自的键上', () => {
    const r = resolveModuleParams(DEF, {})
    expect(r.values['executeTimeoutMs']).toBe(120_000)
    expect(r.values['maxResultArrayItems']).toBe(20)
    expect(r.values['binaryFieldMinChars']).toBe(256)
    expect(r.values['hintToolListMax']).toBe(10)
    expect(r.values['timeoutMs']).toBe(300_000)
    expect(r.values['maxCardSummaryChars']).toBe(2_000)
    expect(r.values['sessionCacheCapacity']).toBe(64)

    const entries = r.groups.flatMap((g) => g.entries)
    expect(entries.find((e) => e.valueKey === 'executeTimeoutMs')?.settingsKey).toBe(SETTINGS_KEYS.agentTools)
    expect(entries.find((e) => e.valueKey === 'timeoutMs')?.settingsKey).toBe(SETTINGS_KEYS.agentApproval)
  })

  it('默认值不超过硬上限；免批缓存允许 0（= 关闭免批）', () => {
    for (const group of Object.keys(AGENT_TOOL_DEFAULTS) as Array<'tools' | 'approval'>) {
      const d = AGENT_TOOL_DEFAULTS[group] as unknown as Record<string, number>
      const l = AGENT_TOOL_LIMITS[group] as unknown as Record<string, number>
      for (const key of Object.keys(d)) expect(d[key], `${group}.${key}`).toBeLessThanOrEqual(l[key])
    }
    const zero = resolveModuleParams(DEF, {
      [SETTINGS_KEYS.agentApproval]: { sessionCacheCapacity: 0 },
    })
    expect(zero.values['sessionCacheCapacity']).toBe(0)
    expect(zero.notes).toEqual([]) // 0 是合法语义，不该报"不是有效正数"
  })
})

describe('持有者与从 settings 解析', () => {
  it('不注入时 = 内置默认；覆盖生效、超限夹取、非法值保留', () => {
    expect(agentToolParams()).toEqual(AGENT_TOOL_DEFAULTS)
    setAgentToolParams({ tools: { executeTimeoutMs: 600_000 } })
    expect(agentToolParams().tools.executeTimeoutMs).toBe(600_000)
    setAgentToolParams({ tools: { executeTimeoutMs: 99_999_999, maxResultArrayItems: -1 } })
    expect(agentToolParams().tools.executeTimeoutMs).toBe(AGENT_TOOL_LIMITS.tools.executeTimeoutMs)
    expect(agentToolParams().tools.maxResultArrayItems).toBe(AGENT_TOOL_DEFAULTS.tools.maxResultArrayItems)
  })

  it('从两个键解析并夹取', () => {
    const parsed = agentToolParamsFromSettings({
      [SETTINGS_KEYS.agentTools]: { executeTimeoutMs: 900_000, maxResultArrayItems: 50 },
      [SETTINGS_KEYS.agentApproval]: { timeoutMs: 9_999_999 },
    })
    expect(parsed.tools.executeTimeoutMs).toBe(900_000)
    expect(parsed.tools.maxResultArrayItems).toBe(50)
    expect(parsed.tools.hintToolListMax).toBe(AGENT_TOOL_DEFAULTS.tools.hintToolListMax)
    expect(parsed.approval.timeoutMs).toBe(AGENT_TOOL_LIMITS.approval.timeoutMs)
  })
})

describe('读取点接线（真实行为改变）', () => {
  it('数组保留项数：调成 2 后结果只留 2 项并标注', () => {
    const raw = { list: [1, 2, 3, 4, 5] }
    // 默认 20 项：5 项全留
    const before = serializeToolResult(raw).data as { list: unknown[] }
    expect(before.list).toHaveLength(5)

    setAgentToolParams({ tools: { maxResultArrayItems: 2 } })
    const after = serializeToolResult(raw)
    expect(after.truncated).toBe(true)
    const list = (after.data as { list: unknown[] }).list
    expect(list).toHaveLength(3) // 2 项 + 一条截断标注
    expect(list[2]).toMatchObject({ _truncated: { totalItems: 5, note: '仅保留前 2 项' } })
  })

  it('二进制字段判定长度：调小后更短的 base64 也会被剔除', () => {
    const payload = { base64: 'x'.repeat(300) }
    // 默认 256：300 > 256 → 已被剔除
    expect((serializeToolResult(payload).data as { base64: unknown }).base64).toMatchObject({ _omitted: 'binary' })
    // 调大到 512 → 300 不算"二进制大字段"，原样保留
    setAgentToolParams({ tools: { binaryFieldMinChars: 512 } })
    expect((serializeToolResult(payload).data as { base64: unknown }).base64).toBe('x'.repeat(300))
  })

  it('工具执行超时：注册表构造时读持有者（此前两处默认值都没人传）', () => {
    const registry = new AgentToolRegistry({})
    const defaultTimeout = (registry as unknown as { deps: { executeTimeoutMs: number } }).deps.executeTimeoutMs
    expect(defaultTimeout).toBe(AGENT_TOOL_DEFAULTS.tools.executeTimeoutMs)

    setAgentToolParams({ tools: { executeTimeoutMs: 900_000 } })
    const registry2 = new AgentToolRegistry({})
    expect((registry2 as unknown as { deps: { executeTimeoutMs: number } }).deps.executeTimeoutMs).toBe(900_000)

    // 长生命周期单例：保存后走 applyRuntimeOverrides 也能刷新（settings-reload 钩子用）
    registry.applyRuntimeOverrides({ executeTimeoutMs: 150_000 })
    expect((registry as unknown as { deps: { executeTimeoutMs: number } }).deps.executeTimeoutMs).toBe(150_000)
  })
})
