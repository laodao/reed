/**
 * 工作流节点处理契约
 * @module core/platform/workflow/engine/node-handler
 * @description 引擎与节点实现之间的唯一接口。所有节点（控制类 + 任务类）实现此契约
 *              并注册到 NodeRegistry 后即可被引擎调度与编辑器展示。
 *
 *              契约纪律（实现节点必须遵守）：
 *              1. execute 收到的 config 已由引擎完成 {{}} 模板解析——handler 不再自行解析
 *                 常规字段；仅动态拼接的二级模板（如循环节点内部的子模板）才用 resolveTemplate。
 *              2. execute 必须可重入：同一 handler 实例可能被多个运行并发调用，
 *                 禁止在 handler 内保存跨调用的可变状态。
 *              3. signal.aborted 后禁止产生副作用（写库/发事件/落盘）——
 *                 settle 前自查（引擎对不可取消节点有 orphan 兜底，但 handler 自律是第一道防线）。
 *              4. 返回 'failed' 时不要自行重试——重试由引擎统一管理（retryCount/retryDelayMs）。
 *              5. 输出对象必须是可 JSON 序列化的纯对象（将作为 checkpoint 与变量上下文存储）。
 */

import type { WorkflowNodeRunStatus, WorkflowNodeType } from '@shared/types/workflow.types'
import type { WorkflowOutputField } from '@shared/types/workflow-node-catalog'

/**
 * 节点执行上下文：引擎向 handler 提供的全部能力。
 * signal/logger/emitProgress 等均为运行作用域对象，禁止跨运行缓存。
 */
export interface WorkflowNodeContext<TConfig = Record<string, unknown>> {
  /** 所属运行 ID */
  runId: string
  /** 引擎内部节点执行键（循环体内含迭代后缀，如 "nodeA:2"） */
  runKey: string
  /** 图内节点 ID（变量命名空间） */
  nodeId: string
  nodeType: WorkflowNodeType
  /** 循环体迭代下标（非循环体内恒 0） */
  iterationIndex: number
  /** 已完成模板解析的节点配置（实参） */
  config: TConfig
  /** 开始节点输入实参（{{start.key}} 的数据源） */
  startInputs: Record<string, unknown>
  /**
   * 触发来源信息（运行只读快照）：{ source?, dialogId?, shareToken?, expression?, eventName? ... }。
   * C4 临时知识库（dialogId 定位对话附件）与 C2 会话上下文（historyTurns）消费。
   */
  triggerInfo: Readonly<Record<string, unknown>>
  /** 取消信号（不可取消节点也应接收，由 handler 决定如何降级） */
  signal: AbortSignal
  /** 结构化日志（写 node_run 留痕） */
  logger: WorkflowNodeLogger
  /** 节点级进度推送（0-100；经引擎转发 wf:run-event 的 node-progress） */
  emitProgress(progress: number, message?: string): void
  /**
   * 按需解析二级模板（同步；config 之外动态生成的模板字符串）。
   * ⚠️ config 字段已由引擎统一解析——handler 不得对 config 字段再调此方法，
   * 否则上游输出中的字面 {{...}} 会被二次展开（注入）。
   */
  resolveTemplate<T = string>(template: string): T
  /** 变量上下文只读视图（按路径取值；优先 resolveTemplate） */
  getVariable(path: string): unknown
  /**
   * 多轮对话：获取已执行 LLM 轮次历史（工作流 settings.multiTurn 开启时非空；否则返回空数组）。
   * llm-chat / skill-call 节点用它把前序对话作为历史 messages 传给模型。
   */
  getLLMHistory?(): Array<{ role: 'user' | 'assistant'; content: string }>
  /** 多轮对话：登记本轮 LLM 调用（user=发送给模型的 prompt；assistant=模型输出）。仅 multiTurn 开启时生效 */
  recordLLMTurn?(role: 'user' | 'assistant', content: string): void
}

/** 节点日志接口（引擎实现：写 node_run.error/logs + console） */
export interface WorkflowNodeLogger {
  debug(message: string, extra?: unknown): void
  info(message: string, extra?: unknown): void
  warn(message: string, extra?: unknown): void
  error(message: string, extra?: unknown): void
}

/** 节点执行结果 */
export type WorkflowNodeExecutionResult =
  /** 成功：output 进入变量上下文；route 为实际出边 handleId（条件分支/审核节点用） */
  | { status: 'succeeded'; output: Record<string, unknown>; route?: string }
  /** 挂起等待人工审核：payload 展示给审核人，timeoutMs=null 无限等待 */
  | { status: 'waiting_review'; payload: Record<string, unknown>; timeoutMs: number | null }
  /**
   * 失败：error 为用户可读信息。
   * retryable=false 跳过剩余重试直接进入失败处理（如配置错误，重试无意义）。
   */
  | { status: 'failed'; error: string; retryable?: boolean }

/** 节点处理契约（新节点 = 实现此接口 + 注册到 NodeRegistry） */
export interface WorkflowNodeHandler<
  TConfig = Record<string, unknown>,
  TType extends WorkflowNodeType = WorkflowNodeType,
> {
  /** 节点类型（与 NODE_TYPE_CATALOG 一一对应） */
  readonly type: TType
  /**
   * 执行类别：
   * - control：引擎内同步求值（start/end/condition/parallel/merge/assign 等），不进并发池
   * - task：异步执行（LLM/HTTP/审核等），受 maxParallelNodes 并发约束
   */
  readonly controlKind: 'control' | 'task'
  /** 底层是否真支持 AbortSignal 取消（与目录 cancellable 一致；引擎降级依据） */
  readonly cancellable: boolean
  /** 输出字段描述（与目录 outputSchema 一致；供注册表一致性测试校验） */
  readonly outputSchema: readonly WorkflowOutputField[]
  /**
   * 配置深度校验（编辑器保存时 + 引擎启动前调用；返回错误信息数组，空=通过）。
   * 校验模板语法、枚举值、数值范围等 config 语义；图结构校验由 graph-validator 负责。
   */
  validateConfig(config: TConfig): string[]
  /** 执行节点逻辑 */
  execute(ctx: WorkflowNodeContext<TConfig>): Promise<WorkflowNodeExecutionResult>
}

/** 节点运行终态集合（引擎调度用；type-only 导出避免运行时依赖） */
export type NodeTerminalStatus = Extract<
  WorkflowNodeRunStatus,
  'succeeded' | 'failed' | 'failed_recovered' | 'cancelled' | 'interrupted' | 'skipped' | 'timed_out'
>
