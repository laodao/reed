/**
 * 知识库参数持有者（进程级；启动注入 + settings 保存后重注入）
 * @module shared/utils/knowledge-params
 *
 * 与其它模块参数持有者同构（共用 `param-holder` 工厂）：默认 → settings 覆盖 → 硬上限夹取 →
 * 使用点现读；保存后由 `settings-reload` 重注入，不必重启。
 *
 * 三个 settings 键：`knowledge:retrieval` / `knowledge:ingest` / `knowledge:summary`。
 * 解析走登记表（`KNOWLEDGE_PARAMS` 的 `resolveModuleParams`），与设置页同一口径。
 *
 * 注：`param-holder` 只承载**数字**参数（分组一致性/夹取都按数字做）。本模块登记表里的参数
 * 全部是数字；将来要开放布尔开关时，需要给持有者补布尔支持或单独走一条读取路径。
 */

import { SETTINGS_KEYS } from '../constants/settings-keys'
import { KNOWLEDGE_PARAMS } from '../constants/module-params/knowledge.params'
import {
  KNOWLEDGE_DEFAULTS,
  KNOWLEDGE_FLAG_DEFAULTS,
  KNOWLEDGE_LIMITS,
  type KnowledgeRuntimeParams,
  type KnowledgeSummaryFlags,
} from '../types/knowledge-params.types'
import { createFlagHolder, createParamHolder, pickBooleanFields, pickNumericFields } from './param-holder'
import { resolveModuleParams } from './module-params'

const holder = createParamHolder({
  defaults: KNOWLEDGE_DEFAULTS,
  limits: KNOWLEDGE_LIMITS,
})

/** 布尔开关单独持有（数字持有者会把 true 当 1 夹取，见 param-holder 注释） */
const flags = createFlagHolder(KNOWLEDGE_FLAG_DEFAULTS)

/** 读当前生效值（使用点现读；未注入时即内置默认 = 改造前的常量） */
export function knowledgeParams(): KnowledgeRuntimeParams {
  return holder.get()
}

/** 注入生效值（非法项保留原值、超限夹取） */
export function setKnowledgeParams(
  patch: Partial<KnowledgeRuntimeParams>,
): KnowledgeRuntimeParams {
  return holder.set(patch)
}

/** 测试隔离用：回到内置默认（数字与布尔一起） */
export function resetKnowledgeParams(): void {
  holder.reset()
  flags.reset()
}

/** 读章节摘要的布尔开关（使用点现读） */
export function knowledgeSummaryFlags(): KnowledgeSummaryFlags {
  return flags.get() as KnowledgeSummaryFlags
}

/** 注入章节摘要的布尔开关 */
export function setKnowledgeSummaryFlags(patch: Partial<KnowledgeSummaryFlags>): KnowledgeSummaryFlags {
  return flags.set(patch) as KnowledgeSummaryFlags
}

/** 从 settings 载荷解析布尔开关（`knowledge:summary` 键） */
export function knowledgeFlagsFromSettings(
  rawByKey: Record<string, unknown>,
): KnowledgeSummaryFlags {
  const tree = resolveModuleParams(KNOWLEDGE_PARAMS, rawByKey).trees
  return pickBooleanFields(tree[SETTINGS_KEYS.knowledgeSummary], KNOWLEDGE_FLAG_DEFAULTS)
}

/** 从 settings 载荷解析（按键给出三个键） */
export function knowledgeParamsFromSettings(
  rawByKey: Record<string, unknown>,
): KnowledgeRuntimeParams {
  const tree = resolveModuleParams(KNOWLEDGE_PARAMS, rawByKey).trees
  return {
    retrieval: pickNumericFields(tree[SETTINGS_KEYS.knowledgeRetrieval], KNOWLEDGE_DEFAULTS.retrieval),
    ingest: pickNumericFields(tree[SETTINGS_KEYS.knowledgeIngest], KNOWLEDGE_DEFAULTS.ingest),
    summary: pickNumericFields(tree[SETTINGS_KEYS.knowledgeSummary], KNOWLEDGE_DEFAULTS.summary),
  }
}

/** 便捷：QA 直出最低分（0~1 小数形态；读取点口径不变） */
export function knowledgeQaDirectMinScore(): number {
  return knowledgeParams().retrieval.qaDirectMinScorePercent / 100
}
