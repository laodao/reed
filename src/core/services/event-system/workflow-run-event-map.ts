/**
 * 引擎 run 生命周期事件 ↔ 平台事件类型映射（10-event-system §9 前端推送行）
 * @module core/services/event-system/workflow-run-event-map
 * @description `WorkflowRunEvent` 五型判别（wf:run-event 通道载荷，
 *              workflow.types.ts:735-778）与点分层平台类型 `workflow.run.*` 的双向映射。
 *              - producer 适配器：引擎事件 → 平台类型（发布时载荷剥离 type 字段）
 *              - ipc/ws 通道：平台类型 → 五型载荷（重建 type 字段，前端零改动）
 *
 *              命名规范（§5.1）：点分层语法仅用于引擎 run 生命周期事件族。
 */

import {
  WORKFLOW_RUN_EVENT_TYPES,
  type WorkflowRunEvent,
} from '@shared/types/workflow.types'
import type { PlatformEvent } from '@shared/types/event.types'

/** run 生命周期事件的聚合 kind（§9：aggregate={kind:'workflow_run', id:runId}） */
export const WORKFLOW_RUN_AGGREGATE_KIND = 'workflow_run'

/**
 * 五型 → 平台类型映射表（§9 事件类型映射表，单一事实源）。
 * 键用 WORKFLOW_RUN_EVENT_TYPES 常量引用，防拼写漂移。
 */
export const WORKFLOW_RUN_EVENT_TYPE_MAP = {
  [WORKFLOW_RUN_EVENT_TYPES.runStatus]: 'workflow.run.run-status',
  [WORKFLOW_RUN_EVENT_TYPES.nodeStatus]: 'workflow.run.node-status',
  [WORKFLOW_RUN_EVENT_TYPES.nodeProgress]: 'workflow.run.node-progress',
  [WORKFLOW_RUN_EVENT_TYPES.reviewRequested]: 'workflow.run.review-requested',
  [WORKFLOW_RUN_EVENT_TYPES.notify]: 'workflow.run.notify',
} as const satisfies Record<WorkflowRunEvent['type'], string>

/** 平台类型 → 五型（映射表逆运算，启动时构建一次） */
const PLATFORM_TO_WF_TYPE: ReadonlyMap<string, WorkflowRunEvent['type']> = new Map(
  Object.entries(WORKFLOW_RUN_EVENT_TYPE_MAP).map(([wfType, platformType]) => [
    platformType,
    wfType as WorkflowRunEvent['type'],
  ])
)

/** ipc/ws 通道默认订阅类型集（§5.4：workflow.run.* 族） */
export const DEFAULT_RUN_EVENT_CHANNEL_TYPES: readonly string[] = ['workflow.run.*']

/** 五型 → 平台类型（producer 适配器用；未知类型返回 null，调用方回退存量直推） */
export function toRunPlatformEventType(wfType: WorkflowRunEvent['type']): string | null {
  return WORKFLOW_RUN_EVENT_TYPE_MAP[wfType] ?? null
}

/** 平台类型 → 五型（通道用；未登记映射的 workflow.run.* 未来扩展类型返回 null） */
export function toWorkflowRunEventType(platformType: string): WorkflowRunEvent['type'] | null {
  return PLATFORM_TO_WF_TYPE.get(platformType) ?? null
}

/**
 * 平台事件 → WorkflowRunEvent 五型载荷（ipc/ws 通道翻译核心）。
 * 载荷即 producer 发布时剥离 type 的剩余字段，此处重建 type——
 * 与引擎原始 emit 的载荷字段级相等（前端零改动契约，§9）。
 * 未登记映射的类型返回 null（通道跳过不推前端）。
 */
export function translateRunPlatformEvent(event: PlatformEvent): WorkflowRunEvent | null {
  const wfType = toWorkflowRunEventType(event.type)
  if (!wfType) return null
  const payload = (event.payload ?? {}) as Record<string, unknown>
  return { type: wfType, ...payload } as WorkflowRunEvent
}
