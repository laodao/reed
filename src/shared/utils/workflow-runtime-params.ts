/**
 * 工作流运行参数持有者（进程级；启动注入 + settings 保存后重注入）
 * @module shared/utils/workflow-runtime-params
 *
 * ── 解决什么问题 ──
 * 节点/驱动侧有一批"抓取礼貌、长任务轮询、代码沙箱超时"参数，读取点是模块级常量
 * （`WORKFLOW_DEFAULTS.crawlDelayMsMin` 这类）——用户改不动，只能改代码。
 * 本持有者把它们变成"运行时现读"：使用点调 `workflowRuntimeParams()` 取值，
 * 装配方在启动时与每次 settings 写入后注入。
 *
 * ── 与「参数设置」登记表的关系 ──
 * 解析**不在这里另写一套**：`workflowRuntimeParamsFromSettings()` 直接调
 * `resolveModuleParams(WORKFLOW_PARAMS, …)`（与设置页同一份口径），
 * 所以设置页显示的值与节点实际用的值不可能不一致。
 *
 * ── 生效时机 ──
 * 使用点是"每次调用现读"，装配方在 settings 保存后重注入（`settings-reload`），
 * 因此改动**下一次请求/下一次运行即生效，不需要重启**。
 * 例外：同站并发（`crawl.hostConcurrency`）—— 已建立的站点节流器沿用旧槽位，
 * 对新出现的站点立即按新值（设置页已如实标注）。
 */

import { SETTINGS_KEYS } from '../constants/settings-keys'
import { WORKFLOW_PARAMS } from '../constants/module-params/workflow.params'
import {
  WORKFLOW_PARAMS_DEFAULTS,
  WORKFLOW_PARAMS_LIMITS,
  type WorkflowRuntimeParams,
} from '../types/workflow-params.types'
import { createParamHolder, pickNumericGroups } from './param-holder'
import { resolveModuleParams } from './module-params'

const holder = createParamHolder({
  defaults: WORKFLOW_PARAMS_DEFAULTS,
  limits: WORKFLOW_PARAMS_LIMITS,
  /**
   * 抓取礼貌：间隔下限不得大于上限（否则随机等待区间为空 = 等于没限速）。
   * 设置页解析时也会做同样修正并给出说明（`workflow.params.ts` 的 crossFieldGuard）。
   */
  normalize: (groups) => {
    const crawl = groups.crawl
    if (crawl && crawl.delayMsMin > crawl.delayMsMax) crawl.delayMsMin = crawl.delayMsMax
  },
})

/** 读当前生效值（使用点现读；未注入时即内置默认 = 改造前的常量） */
export function workflowRuntimeParams(): WorkflowRuntimeParams {
  return holder.get() as WorkflowRuntimeParams
}

/** 注入生效值（非法项保留原值、超限夹取、分组一致性修正） */
export function setWorkflowRuntimeParams(
  patch: Partial<WorkflowRuntimeParams>,
): WorkflowRuntimeParams {
  return holder.set(patch) as WorkflowRuntimeParams
}

/** 测试隔离用：回到内置默认 */
export function resetWorkflowRuntimeParams(): void {
  holder.reset()
}

/**
 * 从 settings 载荷解析（`wf:defaults`；把整体载荷传进来即可）。
 * 用登记表解析 → 夹取/非法回落/说明与设置页完全一致。
 */
export function workflowRuntimeParamsFromSettings(raw: unknown): WorkflowRuntimeParams {
  const resolved = resolveModuleParams(WORKFLOW_PARAMS, { [SETTINGS_KEYS.wfDefaults]: raw })
  return pickNumericGroups(
    resolved.trees[SETTINGS_KEYS.wfDefaults],
    WORKFLOW_PARAMS_DEFAULTS,
  ) as WorkflowRuntimeParams
}
