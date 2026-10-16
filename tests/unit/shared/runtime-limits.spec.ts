/**
 * 进程级运行时限额测试（runtime-limits）
 * @module tests/unit/shared/runtime-limits.spec
 *
 * 背景（2026-09-13 参数配置化）：工具产物 / 会话流水 / 轨迹 payload 三个体积护栏，
 * 以及工作流 agent-loop 与子代理的缺省步数，原本写死在各自模块里。现在统一由
 * `agent:budget` 在启动时注入这份进程级限额（改需重启）；本用例钉死注入语义与默认值。
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  RUNTIME_LIMITS_DEFAULTS,
  resetRuntimeLimits,
  runtimeLimits,
  runtimeLimitsFromBudget,
  setRuntimeLimits,
} from '@shared/utils/runtime-limits'
import { AGENT_BUDGET_DEFAULTS } from '@shared/types/agent-budget.types'
import { resolveAgentBudget } from '@shared/utils/agent-budget'

afterEach(() => {
  resetRuntimeLimits()
})

describe('runtime-limits（进程级限额）', () => {
  it('缺省值 = 改造前写死在各自模块的常量', () => {
    expect(runtimeLimits()).toEqual(RUNTIME_LIMITS_DEFAULTS)
    expect(RUNTIME_LIMITS_DEFAULTS.maxArtifactBytes).toBe(256 * 1024)
    expect(RUNTIME_LIMITS_DEFAULTS.maxTranscriptMessageBytes).toBe(512 * 1024)
    expect(RUNTIME_LIMITS_DEFAULTS.maxTrajectoryPayloadBytes).toBe(16_384)
    expect(RUNTIME_LIMITS_DEFAULTS.maxWorkflowAgentLoopSteps).toBe(20)
    expect(RUNTIME_LIMITS_DEFAULTS.maxSubagentSteps).toBe(8)
    expect(RUNTIME_LIMITS_DEFAULTS.maxSubagentStepsCeiling).toBe(16)
  })

  it('部分注入：只改一项，其余保持原值', () => {
    setRuntimeLimits({ maxArtifactBytes: 1024 })
    expect(runtimeLimits().maxArtifactBytes).toBe(1024)
    expect(runtimeLimits().maxTrajectoryPayloadBytes).toBe(RUNTIME_LIMITS_DEFAULTS.maxTrajectoryPayloadBytes)
  })

  it('非法值忽略（非有限正数不动原值——护栏保守优先）', () => {
    setRuntimeLimits({ maxArtifactBytes: 4096 })
    setRuntimeLimits({ maxArtifactBytes: 0, maxTranscriptMessageBytes: -1, maxTrajectoryPayloadBytes: NaN })
    expect(runtimeLimits().maxArtifactBytes).toBe(4096)
    expect(runtimeLimits().maxTranscriptMessageBytes).toBe(RUNTIME_LIMITS_DEFAULTS.maxTranscriptMessageBytes)
    expect(runtimeLimits().maxTrajectoryPayloadBytes).toBe(RUNTIME_LIMITS_DEFAULTS.maxTrajectoryPayloadBytes)
  })

  it('一致性护栏：子代理步数顶不得低于缺省步数', () => {
    setRuntimeLimits({ maxSubagentSteps: 30, maxSubagentStepsCeiling: 10 })
    expect(runtimeLimits().maxSubagentStepsCeiling).toBe(30)
  })

  it('runtimeLimitsFromBudget：从解析后的预算映射（workflow-boot 的注入路径）', () => {
    const { budget } = resolveAgentBudget({
      maxSteps: { workflowAgentLoop: 33, subagent: 5, subagentCeiling: 12 },
      guards: { maxArtifactBytes: 2048 },
    })
    const limits = runtimeLimitsFromBudget(budget)
    expect(limits).toEqual({
      maxArtifactBytes: 2048,
      maxTranscriptMessageBytes: AGENT_BUDGET_DEFAULTS.guards.maxTranscriptMessageBytes,
      maxTrajectoryPayloadBytes: AGENT_BUDGET_DEFAULTS.guards.maxTrajectoryPayloadBytes,
      maxWorkflowAgentLoopSteps: 33,
      maxSubagentSteps: 5,
      maxSubagentStepsCeiling: 12,
      // 事件载荷护栏（2026-09-13 起从 payload-guard 的常量改为走这条配置链）
      maxEventPayloadBytes: AGENT_BUDGET_DEFAULTS.guards.maxEventPayloadBytes,
      maxEventScanDepth: AGENT_BUDGET_DEFAULTS.guards.maxDeepScanDepth,
    })
    setRuntimeLimits(limits)
    expect(runtimeLimits().maxWorkflowAgentLoopSteps).toBe(33)
  })

  it('resetRuntimeLimits：测试隔离用（回到内置默认）', () => {
    setRuntimeLimits({ maxSubagentSteps: 20 })
    resetRuntimeLimits()
    expect(runtimeLimits().maxSubagentSteps).toBe(RUNTIME_LIMITS_DEFAULTS.maxSubagentSteps)
  })
})
