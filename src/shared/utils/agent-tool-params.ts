/**
 * 工具与审批参数持有者（进程级；启动注入 + settings 保存后重注入）
 * @module shared/utils/agent-tool-params
 *
 * 与 `workflow-runtime-params` / `agent-context-params` 同构（共用 `param-holder` 工厂）：
 * 默认 → settings 覆盖 → 硬上限夹取 → 使用点现读；保存后由 `settings-reload` 重注入，不必重启。
 *
 * 两个 settings 键：`agent:tools`（工具执行与结果处理）、`agent:approval`（人工审批）。
 * 解析走登记表（`AGENT_TOOL_PARAMS` 的 `resolveModuleParams`），与设置页同一口径。
 */

import { SETTINGS_KEYS } from '../constants/settings-keys'
import { AGENT_TOOL_PARAMS } from '../constants/module-params/agent-tool.params'
import {
  AGENT_TOOL_DEFAULTS,
  AGENT_TOOL_LIMITS,
  type AgentToolRuntimeParams,
} from '../types/agent-tool-params.types'
import { createParamHolder, pickNumericFields } from './param-holder'
import { resolveModuleParams } from './module-params'

const holder = createParamHolder({
  defaults: AGENT_TOOL_DEFAULTS,
  limits: AGENT_TOOL_LIMITS,
})

/** 读当前生效值（使用点现读；未注入时即内置默认 = 改造前的常量） */
export function agentToolParams(): AgentToolRuntimeParams {
  return holder.get()
}

/** 注入生效值（非法项保留原值、超限夹取） */
export function setAgentToolParams(
  patch: Partial<AgentToolRuntimeParams>,
): AgentToolRuntimeParams {
  return holder.set(patch)
}

/** 测试隔离用：回到内置默认 */
export function resetAgentToolParams(): void {
  holder.reset()
}

/** 从 settings 载荷解析（按键给出：`agent:tools` / `agent:approval`） */
export function agentToolParamsFromSettings(
  rawByKey: Record<string, unknown>,
): AgentToolRuntimeParams {
  const tree = resolveModuleParams(AGENT_TOOL_PARAMS, rawByKey).trees
  return {
    tools: pickNumericFields(tree[SETTINGS_KEYS.agentTools], AGENT_TOOL_DEFAULTS.tools),
    approval: pickNumericFields(tree[SETTINGS_KEYS.agentApproval], AGENT_TOOL_DEFAULTS.approval),
  }
}
