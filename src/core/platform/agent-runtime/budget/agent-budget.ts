/**
 * Agent 预算读取（宿主侧；解析逻辑在 shared）
 * @module core/platform/agent-runtime/budget/agent-budget
 *
 * 解析（内置默认 → 覆盖 → 硬上限夹取 + 说明）在 `@shared/utils/agent-budget`——**主进程与设置页共用同一份**，
 * 避免"页面显示 40、实际跑 30"。本文件只负责**从 settings 读取并兜底**：
 * 配置缺失/读失败/格式坏都回落内置默认（配置坏了绝不能让功能跑不起来），并给出原因说明。
 */

import { AGENT_BUDGET_SETTINGS_KEY, type ResolvedAgentBudget } from '@shared/types/agent-budget.types'
import {
  resolveAgentBudget,
  type ResolvedAgentBudgetWithNotes,
} from '@shared/utils/agent-budget'

export { resolveAgentBudget } from '@shared/utils/agent-budget'
export type { ResolvedAgentBudgetWithNotes } from '@shared/utils/agent-budget'

/** 读取 settings 的最小端口（结构类型，避免 platform 依赖数据库层） */
export interface AgentBudgetSettingsPort {
  get(key: string): Promise<unknown>
}

/**
 * 从 settings 读取并解析（宿主调用；任何失败都回落内置默认）。
 * @returns 预算 + 说明；`notes` 里会追加读取失败的原因
 */
export async function loadAgentBudget(
  port: AgentBudgetSettingsPort | null | undefined,
): Promise<ResolvedAgentBudgetWithNotes> {
  if (!port) {
    return { ...resolveAgentBudget(null), notes: ['settings 不可用，使用内置默认预算'] }
  }
  try {
    const raw = await port.get(AGENT_BUDGET_SETTINGS_KEY)
    return resolveAgentBudget(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ...resolveAgentBudget(null), notes: [`读取 ${AGENT_BUDGET_SETTINGS_KEY} 失败（${msg}），使用内置默认预算`] }
  }
}

/** 便捷：只要预算（丢弃 notes；宿主已自行记日志的场景） */
export async function loadAgentBudgetOnly(
  port: AgentBudgetSettingsPort | null | undefined,
): Promise<ResolvedAgentBudget> {
  return (await loadAgentBudget(port)).budget
}
