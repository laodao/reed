/**
 * 工作流引擎端口（依赖倒置）
 * @module core/platform/workflow/engine/ports
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
/** 引擎恢复所需的最小 run 行形态（rehydrate 装配 ExecuteRunInput 用） */
export interface EngineRunRow {
  runId: string
  userId: string
  definitionId: string
  graphSnapshot: import('@shared/types/workflow.types').WorkflowGraph
  startInputs: Record<string, unknown> | null
  settings: Record<string, unknown> | null
  triggerInfo: Record<string, unknown> | null
  status: string
}

export interface WorkflowRunPort {
  /**
   * 读取 run 行（rehydrate 用；可选——引擎单测可不实现）。
   * 返回引擎所需最小形态（graph 快照/启动输入/设置/触发上下文）。
   */
  getById?(runId: string): Promise<EngineRunRow | null>
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

/** 引擎恢复所需的节点行最小形态（state 预载 + 投影对齐） */
export interface EngineNodeRunRow {
  nodeId: string
  iterationIndex: number
  status: string
  stateJson: string | null
}

/** 引擎对"节点执行记录"的最小写需求 */
export interface WorkflowNodeRunPort {
  /**
   * 按 run 读节点行（rehydrate 用：state_json 预载 + journal 为准的投影对齐；
   * 可选——引擎单测可不实现）。
   */
  listByRun?(runId: string): Promise<EngineNodeRunRow[]>
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

/** 引擎事件 emit 的可选透传位（10-event-system §9 producer 适配器契约） */
export interface WorkflowEventEmitOptions {
  /** 引发本事件的 journal 事件 id（回填平台事件 causationId；11-run-journal 落地后由引擎传入） */
  causationId?: string
}

import type { WorkflowJournalPort } from './journal'

/** 引擎对"事件推送"的最小需求 */
export interface WorkflowEventPort {
  emit(event: WorkflowRunEvent, opts?: WorkflowEventEmitOptions): void
}

/** 引擎依赖集合（构造注入） */
export interface WorkflowEngineDeps {
  runs: WorkflowRunPort
  nodeRuns: WorkflowNodeRunPort
  events: WorkflowEventPort
  /**
   * Run Journal（11 号 §5.1 E1）：引擎私有运行事件日志。
   * 缺省 null = 不落日志（引擎单测/极简装配）；生产必须注入——先日志后内存
   * 不变量仅在有 journal 时生效，恢复能力随之为空。
   */
  journal?: WorkflowJournalPort | null
}
