/**
 * 模块参数登记表总表（设置页 Tab 的唯一来源）
 * @module shared/constants/module-params
 *
 * 「参数设置」页面里**一个模块一个 Tab**，Tab 的顺序 = 本数组的顺序。
 * 新增一个模块的可调参数 = 加一份 `ModuleParamDefinition` + 在这里登记 + 在读取点改成读生效值。
 *
 * 纪律（见 `shared/types/module-params.types.ts` 头部）：
 * - 登记的参数必须**代码真的会读**（`tests/unit/shared/module-params.spec.ts` 有护栏）；
 * - 默认值引用各域的 `*_DEFAULTS` 常量，不在这里复制一遍数值（避免两处漂移）。
 */

import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { AGENT_RUNTIME_PARAMS } from './agent-runtime.params'
import { AGENT_CONTEXT_PARAMS } from './agent-context.params'
import { AGENT_TOOL_PARAMS } from './agent-tool.params'
import { DOMAIN_LEARNING_PARAMS } from './domain-learning.params'
import { SYSTEM_AGENT_PARAMS } from './system-agent.params'
import { EPISODE_PRODUCTION_PARAMS } from './episode-production.params'
import { WORKFLOW_PARAMS } from './workflow.params'
import { EVENT_SYSTEM_PARAMS } from './event-system.params'
import { KNOWLEDGE_PARAMS } from './knowledge.params'
import { LONGWRITING_PARAMS } from './longwriting.params'
import { ASSET_PARAMS } from './asset.params'
import { PORTRAIT_PARAMS } from './portrait.params'

/**
 * 全部模块参数登记表（顺序 = 设置页 Tab 顺序）。
 * 「AI 运行时」放最前：它是跨模块的护栏，其余是各业务模块自己的参数。
 */
export const MODULE_PARAMS: readonly ModuleParamDefinition[] = [
  AGENT_RUNTIME_PARAMS,
  AGENT_CONTEXT_PARAMS,
  AGENT_TOOL_PARAMS,
  DOMAIN_LEARNING_PARAMS,
  SYSTEM_AGENT_PARAMS,
  EPISODE_PRODUCTION_PARAMS,
  WORKFLOW_PARAMS,
  KNOWLEDGE_PARAMS,
  LONGWRITING_PARAMS,
  ASSET_PARAMS,
  PORTRAIT_PARAMS,
  EVENT_SYSTEM_PARAMS,
]

/** 按模块标识取登记表（未知标识返回 undefined） */
export function getModuleParams(key: string): ModuleParamDefinition | undefined {
  return MODULE_PARAMS.find((m) => m.key === key)
}

/** 某个 settings 键被哪些模块的参数用到（宿主按键取生效值时用） */
export function modulesUsingSettingsKey(settingsKey: string): ModuleParamDefinition[] {
  return MODULE_PARAMS.filter((m) => m.groups.some((g) => g.params.some((p) => (p.settingsKey ?? m.settingsKey) === settingsKey)))
}

export {
  AGENT_RUNTIME_PARAMS,
  AGENT_CONTEXT_PARAMS,
  AGENT_TOOL_PARAMS,
  DOMAIN_LEARNING_PARAMS,
  SYSTEM_AGENT_PARAMS,
  EPISODE_PRODUCTION_PARAMS,
  WORKFLOW_PARAMS,
  EVENT_SYSTEM_PARAMS,
  KNOWLEDGE_PARAMS,
  LONGWRITING_PARAMS,
  ASSET_PARAMS,
  PORTRAIT_PARAMS,
}
