/**
 * Agent 预算解析（纯函数；2026-09-13 用户需求）
 * @module shared/utils/agent-budget
 *
 * 职责：把 settings 表 `agent:budget` 的**任意输入**解析成一份可用的完整预算。
 *
 * ── 与「参数设置」框架的关系（2026-09-13 第二轮）──
 * 解析口径**不再各写一份**：`agent:budget` 里的参数按"归属模块"登记在
 * `shared/constants/module-params/`（AI 运行时 / 领域共学 / 系统助手 / 剧集制作 / 事件系统），
 * 每个登记表由 `shared/utils/module-params.ts` 通用解析（默认 → 覆盖 → 硬上限夹取 → 跨字段修正）。
 * 本文件只做**装配**：把各模块的解析结果按 settings 键合并成 `ResolvedAgentBudget` 的强类型结构，
 * 并补上"只属于 agent 语义"的派生字段（`maxCalls.overrides`）。
 *
 * 这样做的原因：如果宿主自己再写一套 clamp，早晚会出现"设置页显示 40、实际跑 30"这类鬼故事。
 *
 * 纪律：
 * - 数字必须有限、为正、整数化；字符串/NaN/负数/0 一律回落默认（护栏静默失效比报错更危险）；
 * - 用户想抬到超过硬上限时不报错，而是夹到上限并记 note；
 * - 记录型（maxCalls.byTool / maxCalls.read）按 key 合并：未列出的键保留默认，用户新增的键也接受。
 */

import { AGENT_BUDGET_SETTINGS_KEY, type ResolvedAgentBudget } from '../types/agent-budget.types'
import { MODULE_PARAMS } from '../constants/module-params'
import { isPlainObject, resolveModuleParams } from './module-params'

export interface ResolvedAgentBudgetWithNotes {
  budget: ResolvedAgentBudget
  /** 解析过程中的取舍说明（被夹上限 / 非法值回落 / 未知键不计），供设置页与日志展示 */
  notes: string[]
}

/** 深合并（把分布在不同模块/不同 settings 键下的参数树拼回一棵） */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    const cur = target[key]
    if (isPlainObject(cur) && isPlainObject(value)) deepMerge(cur, value)
    else target[key] = value
  }
  return target
}

/** 用到 `agent:budget` 的模块（按登记顺序） */
function agentBudgetModules() {
  return MODULE_PARAMS.filter((m) =>
    m.groups.some((g) => g.params.some((p) => (p.settingsKey ?? m.settingsKey) === AGENT_BUDGET_SETTINGS_KEY)),
  )
}

/** 解析一份完整的 agent 预算（任何输入都不抛错） */
export function resolveAgentBudget(raw: unknown): ResolvedAgentBudgetWithNotes {
  const notes: string[] = []
  if (raw !== undefined && raw !== null && !isPlainObject(raw)) {
    notes.push('agent:budget 不是对象，已整体回落内置默认')
  }
  const payload: Record<string, unknown> = isPlainObject(raw) ? raw : {}

  const tree: Record<string, unknown> = {}
  const overrides: Record<string, number> = {}
  for (const def of agentBudgetModules()) {
    const resolved = resolveModuleParams(def, { [AGENT_BUDGET_SETTINGS_KEY]: payload })
    deepMerge(tree, resolved.trees[AGENT_BUDGET_SETTINGS_KEY] ?? {})
    notes.push(...resolved.notes)
    // 跨宿主接入读 overrides：只含用户**显式设置过**的工具上限，避免同名工具默认互相污染。
    // 遍历顺序 = 登记顺序（byTool 在 read 之前），后写覆盖前写 → 与改造前 `{...byTool, ...read}` 一致。
    for (const [valueKey, value] of Object.entries(resolved.values)) {
      const m = /^maxCalls\.(?:byTool|read)\.(.+)$/.exec(valueKey)
      if (m && resolved.touched[valueKey] && typeof value === 'number') overrides[m[1]] = value
    }
  }

  const t = tree as unknown as ResolvedAgentBudget
  return {
    budget: {
      maxSteps: t.maxSteps,
      maxCalls: { byTool: t.maxCalls?.byTool ?? {}, read: t.maxCalls?.read ?? {}, overrides },
      domainLearning: t.domainLearning,
      guards: t.guards,
    },
    notes,
  }
}
