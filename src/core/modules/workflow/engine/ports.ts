/**
 * 工作流引擎端口（依赖倒置）
 * @module core/modules/workflow/engine/ports
 * @description 引擎不直接依赖 Repository——通过最小端口接口访问存储与事件。
 *              好处：
 *              1. 引擎单测用内存假实现（不依赖 better-sqlite3 ABI / PG 环境）
 *              2. 存储层的写入形状集中在一处，未来换存储不动引擎
 *
 *              生产适配：WorkflowRunPort/NodeRunPort 由片5 的服务层用
 *              WorkflowRunRepository/WorkflowNodeRunRepository 薄封装实现；
 *              EventPort 由 getEventEmitter() 包装（Web 端依赖 ALS userId 路由——
 *              引擎的调用方必须保证在 runWithUserAsync(run.userId) 上下文内）。
 */

import type {
  WorkflowNodeRunStatus,
  WorkflowRunEvent,
  WorkflowRunStatus,
} from '@shared/types/workflow.types'
import type { WorkflowReviewRecord } from '../../../database/repositories/workflow-node-run.repository'

/** 引擎对"运行记录"的最小写需求 */
export interface WorkflowRunPort {
  /** 引擎推进运行状态（含终态） */
  patchRun(
    runId: string,
    patch: {
      status?: WorkflowRunStatus
      error?: string | null
      startedAt?: Date
      finishedAt?: Date
      durationMs?: number | null
      stats?: {
        totalNodes: number
        doneNodes: number
        failedNodes: number
        recoveredNodes: number
      } | null
    }
  ): Promise<void>
}

/** 引擎对"节点执行记录"的最小写需求 */
export interface WorkflowNodeRunPort {
  /** 节点开始执行：建 checkpoint 行 */
  startNode(input: {
    runId: string
    nodeId: string
    nodeType: string
    nodeName: string
    iterationIndex: number
    input: Record<string, unknown> | null
  }): Promise<void>
  /** 节点状态推进（引擎生命周期内同一 (runId,nodeId,iteration) 反复调用） */
  patchNode(
    runId: string,
    nodeId: string,
    iterationIndex: number,
    patch: {
      status?: WorkflowNodeRunStatus
      input?: Record<string, unknown> | null
      output?: Record<string, unknown> | null
      error?: string | null
      retryCount?: number
      routeTaken?: string | null
      waitExpiresAt?: Date | null
      review?: WorkflowReviewRecord | null
      finishedAt?: Date | null
      durationMs?: number | null
    }
  ): Promise<void>
}

/** 引擎对"事件推送"的最小需求 */
export interface WorkflowEventPort {
  emit(event: WorkflowRunEvent): void
}

/** 引擎依赖集合（构造注入） */
export interface WorkflowEngineDeps {
  runs: WorkflowRunPort
  nodeRuns: WorkflowNodeRunPort
  events: WorkflowEventPort
}
