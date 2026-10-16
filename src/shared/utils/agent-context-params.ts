/**
 * Agent 上下文与记忆参数持有者（进程级；启动注入 + settings 保存后重注入）
 * @module shared/utils/agent-context-params
 *
 * 与 `workflow-runtime-params` 同构（共用 `param-holder` 工厂）：
 * 默认 → settings 覆盖 → 硬上限夹取 → 使用点现读；保存后由 `settings-reload` 重注入，不必重启。
 *
 * 两个 settings 键：`agent:context`（上下文装配与压缩）、`agent:memory`（记忆飞轮）。
 * 解析走登记表（`AGENT_CONTEXT_PARAMS` 的 `resolveModuleParams`），与设置页同一口径。
 */

import { SETTINGS_KEYS } from '../constants/settings-keys'
import { AGENT_CONTEXT_PARAMS } from '../constants/module-params/agent-context.params'
import {
  AGENT_CONTEXT_DEFAULTS,
  AGENT_CONTEXT_LIMITS,
  type AgentContextRuntimeParams,
} from '../types/agent-context-params.types'
import { createParamHolder, pickNumericFields } from './param-holder'
import { resolveModuleParams } from './module-params'

const holder = createParamHolder({
  defaults: AGENT_CONTEXT_DEFAULTS,
  limits: AGENT_CONTEXT_LIMITS,
})

/** 读当前生效值（使用点现读；未注入时即内置默认 = 改造前的常量） */
export function agentContextParams(): AgentContextRuntimeParams {
  return holder.get() as AgentContextRuntimeParams
}

/** 注入生效值（非法项保留原值、超限夹取） */
export function setAgentContextParams(
  patch: Partial<AgentContextRuntimeParams>,
): AgentContextRuntimeParams {
  return holder.set(patch) as AgentContextRuntimeParams
}

/** 测试隔离用：回到内置默认 */
export function resetAgentContextParams(): void {
  holder.reset()
}

/**
 * 从 settings 载荷解析（按键给出：`agent:context` / `agent:memory`）。
 *
 * 这两个键的载荷是**平铺**的（键名本身已经是"模块:对象"，再套一层 `context.context` 没有意义），
 * 所以用 `pickNumericFields` 取一层。
 */
export function agentContextParamsFromSettings(
  rawByKey: Record<string, unknown>,
): AgentContextRuntimeParams {
  const tree = resolveModuleParams(AGENT_CONTEXT_PARAMS, rawByKey).trees
  return {
    context: pickNumericFields(tree[SETTINGS_KEYS.agentContext], AGENT_CONTEXT_DEFAULTS.context),
    memory: pickNumericFields(tree[SETTINGS_KEYS.agentMemory], AGENT_CONTEXT_DEFAULTS.memory),
  }
}

/** 便捷：置信度闸门（0~1；读取点用的小数形态） */
export function memoryConfidenceGate(): number {
  return agentContextParams().memory.confidenceGatePercent / 100
}

/** 便捷：查重重叠率阈值（0~1；读取点用的小数形态） */
export function memoryDedupOverlapThreshold(): number {
  return agentContextParams().memory.dedupOverlapThresholdPercent / 100
}
