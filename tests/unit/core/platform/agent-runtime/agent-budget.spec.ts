/**
 * Agent 预算解析测试（resolveAgentBudget / loadAgentBudget）
 * @module tests/unit/core/platform/agent-runtime/agent-budget.spec
 *
 * 背景（2026-09-13 用户需求）：maxCalls 这类参数不该写死；改成 settings 表可配。
 * 本用例钉死解析纪律：**不配置时与改造前完全一致**、覆盖生效、超限夹取并说明、
 * 非法值回落且不静默、部分字段可只配一个。
 */

import { describe, it, expect } from 'vitest'
import { resolveAgentBudget, loadAgentBudget } from '@core/platform/agent-runtime/budget/agent-budget'
import {
  AGENT_BUDGET_DEFAULTS,
  AGENT_BUDGET_LIMITS,
  AGENT_BUDGET_SETTINGS_KEY,
  AGENT_TOOL_MAX_CALLS_CEILING,
} from '@shared/types/agent-budget.types'

describe('resolveAgentBudget（内置默认 → 覆盖 → 硬上限）', () => {
  it('不配置（null/undefined/非对象）→ 完整内置默认，行为与改造前一致', () => {
    for (const raw of [null, undefined, 42, 'x', []]) {
      const { budget } = resolveAgentBudget(raw)
      expect(budget).toEqual(AGENT_BUDGET_DEFAULTS)
    }
    // 关键默认值就是改造前写死的那些
    expect(resolveAgentBudget(null).budget.maxCalls.byTool.dl_save_concept).toBe(12)
    expect(resolveAgentBudget(null).budget.maxSteps.research).toBe(12)
    expect(resolveAgentBudget(null).budget.maxSteps.task).toBe(16)
    expect(resolveAgentBudget(null).budget.maxSteps.workflowAgentLoop).toBe(20)
    expect(resolveAgentBudget(null).budget.domainLearning.saveBudget).toEqual({ concepts: 30, relations: 40 })
    expect(resolveAgentBudget(null).budget.guards.maxToolResultBytes).toBe(16_384)
  })

  it('部分覆盖：只写一个字段时，其余保持默认', () => {
    const { budget, notes } = resolveAgentBudget({
      maxSteps: { research: 20 },
      domainLearning: { maxConcurrentRuns: 5 },
      guards: { maxAuditPreviewChars: 800 },
    })
    expect(budget.maxSteps.research).toBe(20)
    expect(budget.maxSteps.task).toBe(AGENT_BUDGET_DEFAULTS.maxSteps.task)
    expect(budget.domainLearning.maxConcurrentRuns).toBe(5)
    expect(budget.domainLearning.saveBudget).toEqual(AGENT_BUDGET_DEFAULTS.domainLearning.saveBudget)
    expect(budget.guards.maxAuditPreviewChars).toBe(800)
    expect(budget.guards.maxToolResultBytes).toBe(AGENT_BUDGET_DEFAULTS.guards.maxToolResultBytes)
    expect(notes).toEqual([])
  })

  it('工具上限覆盖与新增：默认表打底、用户键生效、新工具名也接受', () => {
    const { budget } = resolveAgentBudget({
      maxCalls: { byTool: { dl_save_concept: 40, my_new_tool: 7 }, read: { http_get: 9 } },
    })
    expect(budget.maxCalls.byTool.dl_save_concept).toBe(40)
    expect(budget.maxCalls.byTool.my_new_tool).toBe(7)
    expect(budget.maxCalls.byTool.dl_save_relation).toBe(14) // 未列出 → 默认
    expect(budget.maxCalls.read.http_get).toBe(9)
    expect(budget.maxCalls.read.wf_web_extract).toBe(3) // 未列出 → 默认
  })

  it('overrides 只含用户显式设置的键（跨宿主接入读它，避免同名工具默认互相污染）', () => {
    const none = resolveAgentBudget(null).budget.maxCalls.overrides
    expect(none).toEqual({})
    const some = resolveAgentBudget({
      maxCalls: { byTool: { invoke_skill: 4 }, read: { http_get: 9 } },
    }).budget.maxCalls.overrides
    expect(some).toEqual({ invoke_skill: 4, http_get: 9 })
    // 合并表里仍有默认值，但它不参与"跨宿主默认"判定
    const b = resolveAgentBudget({ maxCalls: { byTool: { invoke_skill: 4 } } }).budget
    expect(b.maxCalls.byTool.invoke_skill).toBe(4)
    expect(b.maxCalls.overrides.invoke_skill).toBe(4)
    expect(b.maxCalls.overrides.dl_save_concept).toBeUndefined()
  })

  it('超硬上限 → 夹到上限并记 note（用户能看到值没被完整采纳）', () => {
    const { budget, notes } = resolveAgentBudget({
      maxSteps: { research: 9999 },
      domainLearning: { maxSaveBudget: 9999 },
      guards: { maxToolResultBytes: 100 * 1024 * 1024 },
    })
    expect(budget.maxSteps.research).toBe(AGENT_BUDGET_LIMITS.maxSteps.research)
    expect(budget.domainLearning.maxSaveBudget).toBe(AGENT_BUDGET_LIMITS.domainLearning.maxSaveBudget)
    expect(budget.guards.maxToolResultBytes).toBe(AGENT_BUDGET_LIMITS.guards.maxToolResultBytes)
    expect(notes.filter((n) => n.includes('硬上限')).length).toBe(3)
  })

  it('工具上限：特例工具用更严格的封顶，其余用通用封顶', () => {
    const { budget } = resolveAgentBudget({
      maxCalls: { byTool: { dl_save_card: 9999, some_readonly_tool: 9999 } },
    })
    expect(budget.maxCalls.byTool.dl_save_card).toBe(AGENT_BUDGET_LIMITS.maxCalls.byTool.dl_save_card)
    expect(budget.maxCalls.byTool.some_readonly_tool).toBe(AGENT_TOOL_MAX_CALLS_CEILING)
  })

  it('非法值 → 回落默认并记 note（0/负数/NaN/字符串/空）', () => {
    const { budget, notes } = resolveAgentBudget({
      maxSteps: { research: 0, task: -3, systemAgent: 'abc', episode: null },
      domainLearning: { maxConcurrentRuns: NaN },
    })
    expect(budget.maxSteps.research).toBe(AGENT_BUDGET_DEFAULTS.maxSteps.research)
    expect(budget.maxSteps.task).toBe(AGENT_BUDGET_DEFAULTS.maxSteps.task)
    expect(budget.maxSteps.systemAgent).toBe(AGENT_BUDGET_DEFAULTS.maxSteps.systemAgent)
    expect(budget.maxSteps.episode).toBe(AGENT_BUDGET_DEFAULTS.maxSteps.episode)
    expect(budget.domainLearning.maxConcurrentRuns).toBe(AGENT_BUDGET_DEFAULTS.domainLearning.maxConcurrentRuns)
    expect(notes.length).toBeGreaterThanOrEqual(4)
    expect(notes.every((n) => n.includes('回落默认'))).toBe(true)
  })

  it('一致性护栏：relations 不得小于 concepts；subagentCeiling 不得小于 subagent', () => {
    const { budget, notes } = resolveAgentBudget({
      domainLearning: { saveBudget: { concepts: 100, relations: 5 } },
      maxSteps: { subagent: 30, subagentCeiling: 10 },
    })
    expect(budget.domainLearning.saveBudget.relations).toBe(100)
    expect(budget.maxSteps.subagentCeiling).toBe(30)
    expect(notes.some((n) => n.includes('小于'))).toBe(true)
  })

  it('非法工具名忽略并记 note（不因一个坏键毁掉整份配置）', () => {
    const { budget, notes } = resolveAgentBudget({
      maxCalls: { byTool: { 'Bad Name!': 5, dl_save_card: 6 } },
    })
    expect(budget.maxCalls.byTool['Bad Name!']).toBeUndefined()
    expect(budget.maxCalls.byTool.dl_save_card).toBe(6)
    expect(notes.some((n) => n.includes('非法键名'))).toBe(true)
  })

  it('解析口径来自「参数设置」登记表：新增/调整模块参数会自动进入预算（第二轮）', () => {
    // 事件系统模块登记的护栏字段（第一轮登记了却没人读的 maxDeepScanDepth 也在这里）
    const { budget } = resolveAgentBudget({ guards: { maxDeepScanDepth: 12, maxEventPayloadBytes: 4096 } })
    expect(budget.guards.maxDeepScanDepth).toBe(12)
    expect(budget.guards.maxEventPayloadBytes).toBe(4096)
  })
})

describe('loadAgentBudget（带存储兜底）', () => {
  it('从 settings 读 agent:budget 并解析', async () => {
    const { budget } = await loadAgentBudget({
      get: async (key: string) => (key === AGENT_BUDGET_SETTINGS_KEY ? { maxSteps: { research: 20 } } : null),
    })
    expect(budget.maxSteps.research).toBe(20)
  })

  it('settings 不可用 / 读取抛错 → 回落内置默认并在 notes 里说明（不让配置坏了就跑不起来）', async () => {
    const noPort = await loadAgentBudget(null)
    expect(noPort.budget).toEqual(AGENT_BUDGET_DEFAULTS)
    expect(noPort.notes[0]).toContain('settings 不可用')

    const broken = await loadAgentBudget({
      get: async () => {
        throw new Error('db closed')
      },
    })
    expect(broken.budget).toEqual(AGENT_BUDGET_DEFAULTS)
    expect(broken.notes[0]).toContain('db closed')
  })
})
