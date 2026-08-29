/**
 * 工作流执行设置解析
 * @module core/modules/workflow/engine/execution-settings
 * @description 配置链末端在引擎侧的解析：
 *              节点级（retryCount/retryDelayMs）→ 工作流级 → WORKFLOW_DEFAULTS，
 *              全部封顶于 WORKFLOW_LIMITS（防失控最终防线）。
 *
 *              settings 表 wf:defaults 的全局覆盖由服务层（片5）在调用
 *              resolveExecutionSettings 前合并进 definitionSettings——引擎不感知存储。
 */

import {
  WORKFLOW_DEFAULTS,
  WORKFLOW_LIMITS,
  type WorkflowExecutionSettings,
  type WorkflowNodeSettings,
} from '@shared/types/workflow.types'

const { maxDurationMs, maxLoopIterations, maxOutputChars, maxRetryCount, maxParallelNodes, maxNodeRuns } =
  WORKFLOW_DEFAULTS

/** 引擎实际生效的运行级设置（已解析、已封顶） */
export interface ResolvedExecutionSettings {
  maxDurationMs: number
  maxLoopIterations: number
  maxOutputChars: number
  maxRetryCount: number
  maxParallelNodes: number
  maxNodeRuns: number
  /** 多轮对话（布尔透传：true=LLM 节点共享对话上下文；默认 false） */
  multiTurn: boolean
}

const clamp = (value: number | undefined, fallback: number, limit: number): number => {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.min(value, limit)
}

/**
 * 解析运行级设置：definition.settings 覆盖默认值，全部封顶于硬性上限。
 */
export function resolveExecutionSettings(
  definitionSettings?: WorkflowExecutionSettings | null
): ResolvedExecutionSettings {
  const s = definitionSettings ?? {}
  return {
    maxDurationMs: clamp(s.maxDurationMs, maxDurationMs, WORKFLOW_LIMITS.maxDurationMs),
    maxLoopIterations: clamp(
      s.maxLoopIterations,
      maxLoopIterations,
      WORKFLOW_LIMITS.maxLoopIterations
    ),
    maxOutputChars: clamp(s.maxOutputChars, maxOutputChars, WORKFLOW_LIMITS.maxOutputChars),
    maxRetryCount: clamp(s.maxRetryCount, maxRetryCount, WORKFLOW_LIMITS.maxRetryCount),
    maxParallelNodes: clamp(s.maxParallelNodes, maxParallelNodes, WORKFLOW_LIMITS.maxParallelNodes),
    maxNodeRuns: clamp(s.maxNodeRuns, maxNodeRuns, WORKFLOW_LIMITS.maxNodeRuns),
    multiTurn: s.multiTurn === true,
  }
}

/** 解析节点级重试设置（封顶于运行级 maxRetryCount / WORKFLOW_LIMITS.retryDelayMs） */
export function resolveNodeRetrySettings(
  nodeSettings: WorkflowNodeSettings | undefined,
  runSettings: ResolvedExecutionSettings
): { retryCount: number; retryDelayMs: number } {
  const retryCount = Math.min(
    nodeSettings?.retryCount ?? 0,
    runSettings.maxRetryCount
  )
  const delay = nodeSettings?.retryDelayMs ?? 0
  const retryDelayMs = Math.min(Math.max(delay, 0), WORKFLOW_LIMITS.retryDelayMs)
  return { retryCount, retryDelayMs }
}
