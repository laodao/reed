/**
 * 工作流执行作用域（片4：循环/审核/取消/续跑）
 * @module core/platform/workflow/engine/workflow-engine.service
 * @description 作用域架构：
 *              - 根作用域跑图主体；每个循环迭代是独立作用域（自己的
 *                states/activationSeqs/merge 语义——C1 起边激活带序号支持自由环），循环体节点只在迭代作用域内执行
 *              - 作用域静默（无 running/无 ready）或挂起（waiting_review）时收敛
 *              - 挂起时 execute() 返回 waiting_review（不占住调用方），
 *                RunExecution 留在 activeExecutions 占互斥；resumeReview 续驱
 *              - 续跑：根作用域按 succeeded checkpoint 装配变量与已激活边；
 *                未完成循环整体重跑（body 检查点作废，已完成循环经 loop 输出复用）
 *
 *              ALS 纪律不变：execute/续驱均须 runWithUserAsync(run.userId)。
 */

import type { FormFieldDef } from '../nodes/interaction-nodes'
import { runWithUserAsync } from '@core/context/user-context'
import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeRunStatus,
  WorkflowRunStatus,
} from '@shared/types/workflow.types'
import {
  encodeWorkflowHandleId,
  WORKFLOW_NODE_TYPES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_NODE_RUN_STATUSES,
  WORKFLOW_EDGE_KINDS,
  WORKFLOW_REVIEW_DECISIONS,
  WORKFLOW_REVIEW_TIMEOUT_POLICIES,
  WORKFLOW_RUN_EVENT_TYPES,
} from '@shared/types/workflow.types'
import { semOf } from './control-semantics'
import type { WorkflowNodeContext, WorkflowNodeExecutionResult } from './node-handler'
import type { WorkflowEngineDeps } from './ports'
import { WORKFLOW_JOURNAL_EVENT_TYPES, WORKFLOW_JOURNAL_DEFAULTS } from '@shared/types/workflow.types'
import type { WorkflowJournalPort, JournalEventInput } from './journal'
import { replayJournal } from './journal-replay'
import { WorkflowNodeRegistry } from './node-registry'
import { VariableResolver, resolveConfigDeep, stringifyValue } from './variable-resolver'
import {
  resolveExecutionSettings,
  resolveNodeRetrySettings,
  type ResolvedExecutionSettings,
} from './execution-settings'
import { buildNodeMap, computeLoopBody, type LoopBodyInfo } from './graph-topology'
import { errorMessage, sleepAbortable } from './async-utils'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('WorkflowEngine')

/**
 * data-table 节点外部模式：sql 字段**不参与** {{}} 模板解析（保留原样），
 * 必须用 $1,$2 参数化占位（见字段帮助）。否则上游变量（webhook/LLM 输出等）
 * 会被字符串直接拼进 SQL 文本造成注入——这正是该字段参数化的原因。
 * 其余节点/字段仍走统一深解析。
 */
const DATA_TABLE_TEMPLATE_SKIP_KEYS: ReadonlySet<string> = new Set(['sql'])
function templateSkipKeysFor(nodeType: string): ReadonlySet<string> | undefined {
  return nodeType === 'data-table' ? DATA_TABLE_TEMPLATE_SKIP_KEYS : undefined
}

/** 运行统计（落库 stats 列的形状） */
export interface RunExecutionStats {
  totalNodes: number
  doneNodes: number
  failedNodes: number
  recoveredNodes: number
}

/** 引擎执行入参（运行记录已由服务层建好） */
export interface ExecuteRunInput {
  runId: string
  userId: string
  definitionId: string
  graph: WorkflowGraph
  startInputs: Record<string, unknown>
  settings?: import('@shared/types/workflow.types').WorkflowExecutionSettings | null
  /**
   * C3 一次性配置覆盖：{ [nodeId]: { [configKey]: value } }。
   * 在 launchNode 解析模板前按顶层 key 浅合并——override 值本身支持模板引用。
   * 仅影响本次运行，不修改定义图（REST invoke 实验参数；对齐 Bisheng override）。
   */
  configOverrides?: Record<string, Record<string, unknown>>
  /** 触发来源信息快照（startRun 透传；C4 dialogId / C2 会话上下文消费） */
  triggerInfo?: Record<string, unknown>
  /**
   * 续跑装配数据（resumeRun 用）：源运行中 succeeded 且有输出的节点行。
   * 引擎按 (nodeId, iterationIndex=0) 重建根作用域变量与已激活边。
   */
  resumedCheckpoints?: Array<{
    nodeId: string
    nodeType: string
    nodeName: string
    output: Record<string, unknown>
    routeTaken?: string | null
  }>
}

/** 审核决策输入 */
export interface ReviewDecisionInput {
  decision: 'approve' | 'approve_with_changes' | 'reject'
  comment?: string
  /** approve_with_changes 时的修改值（浅覆盖 payload 顶层字段） */
  editedValues?: Record<string, unknown>
  /** choose 交互模式：用户选择的选项 key（route=branch:{choice}） */
  choice?: string
}

/** 节点内存态（作用域内以 nodeId 为键） */
export interface NodeExecutionState {
  nodeId: string
  iterationIndex: number
  status: WorkflowNodeRunStatus
  retryCount: number
  error?: string
  output?: Record<string, unknown>
  routeTaken?: string | null
  /** 挂起审核的载荷与超时策略 */
  reviewPayload?: Record<string, unknown>
  reviewTimeoutMs?: number | null
  reviewTimeoutPolicy?: 'approve' | 'reject' | 'fail'
  waitExpiresAt?: Date | null
  /** 节点进入终态时的激活序号（C1 环：seq 更大的入边激活触发重执行） */
  completedSeq?: number
  startedAtMs: number
}

/** 根作用域键（作用域键编解码唯一实现） */
const ROOT_SCOPE_KEY = 'root'
function makeScopeKey(loopNodeId: string, iterationIndex: number): string {
  return `${loopNodeId}:${iterationIndex}`
}
function parseScopeLoopNodeId(scopeKey: string): string {
  return scopeKey.split(':')[0]
}

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  done: boolean
}

function makeDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>(r => {
    resolve = r
  })
  return { promise, resolve, done: false }
}

/** 执行作用域：根作用域或某循环迭代 */
export class ScopeState {
  readonly states = new Map<string, NodeExecutionState>()
  /** 边激活序号（C1 环支持：完成后的新激活触发重执行） */
  readonly activationSeqs = new Map<string, number>()
  /** 激活计数器（单调递增） */
  activationCounter = 0
  readonly mergeArrivals = new Map<string, Map<string, Record<string, unknown>>>()
  readonly forcedMergeNodeIds = new Set<string>()
  /** 本作用域循环节点的迭代伪输出：loopNodeId → { item, index, list } */
  readonly loopPseudoVars = new Map<string, Record<string, unknown>>()
  runningTasks = 0
  pumping = false
  requeue = false
  /** 静默或挂起收敛标记 */
  settledAt: Deferred | null = null
  failed = false
  /**
   * 所属循环节点 id（仅循环迭代作用域有值）：用于迭代级错误策略判定——
   * 循环配置 errorPolicy=skip 时，迭代内节点失败不传播到运行级（不 abort），
   * 由循环驱动器跳过该迭代继续。
   */
  loopOwnerId: string | null = null
  /**
   * 该迭代已按循环 errorPolicy=skip 跳过（体内节点失败但循环继续）。
   * 置位后本 scope 不再视为"未恢复失败"（anyUnrecoveredFailure / anyScopeFailure 跳过）。
   */
  iterationSkippedByPolicy = false

  constructor(
    /** 作用域键：'root' 或 `${loopNodeId}:${iterationIndex}` */
    readonly key: string,
    readonly iterationIndex: number,
    /** 循环作用域的 body 节点集合；根作用域为 null */
    readonly bodyNodeIds: Set<string> | null
  ) {}

  get isRoot(): boolean {
    return this.key === ROOT_SCOPE_KEY
  }

  /** 作用域静默（无在飞任务且未在 pumping 中被调度）由 pump 判定并 resolve settledAt */
}

/** 循环驱动进度（挂起后续驱用） */
export interface LoopDriver {
  node: WorkflowNode
  state: NodeExecutionState
  list: unknown[]
  results: unknown[]
  parentScope: ScopeState
}

/** 一次运行的完整内存态 */
export class RunExecution {
  readonly nodeById: Map<string, WorkflowNode>
  readonly incomingByNode: Map<string, WorkflowEdge[]>
  readonly outgoingByNode: Map<string, WorkflowEdge[]>
  readonly resolver: VariableResolver
  readonly variables = new Map<string, Record<string, unknown>>()
  readonly rootScope = new ScopeState(ROOT_SCOPE_KEY, 0, null)
  /** 循环迭代作用域：scopeKey → scope */
  readonly loopScopes = new Map<string, ScopeState>()
  /** 循环驱动进度：loopNodeId → driver（挂起/续驱用） */
  readonly loopDrivers = new Map<string, LoopDriver>()
  /** 循环节点的 body 信息（启动时一次计算） */
  readonly loopBodies = new Map<string, LoopBodyInfo>()
  readonly abortController = new AbortController()
  readonly settings: ResolvedExecutionSettings
  /** 多轮对话累积器：按执行完成顺序记录 LLM 轮次（workflow settings.multiTurn 开启时生效） */
  readonly llmHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []

  suspended = false
  finished = false
  finalStatus?: WorkflowRunStatus
  /** Run Journal：下一个事件序号（run 内严格单调；0 起分配） */
  nextEventSeq = 0
  /** 距上次快照的事件数（阈值触发投影快照——挂起时强制另计） */
  eventsSinceSnapshot = 0
  /** 看门狗触发后置位：不等待在飞任务排空，放行 execute 返回 */
  forceRelease = false
  /** 节点执行实例计数（护栏依据；P5：唯一计数点在 launchNode——重试/审核恢复不计） */
  readonly runCounts = new Map<string, number>()
  /** C1 重执行节点集（本作用域内）：launchNode 对这些节点复用 node_run 行重置而非新建（唯一索引约束） */
  readonly reexecNodeIds = new Set<string>()
  /** 未恢复失败进行中：同步置位（先于任何 await），防漂浮 pump 把失败中止误判为用户取消 */
  pendingFailureError?: string
  /** 看门狗句柄（挂起时清除、续驱时重建——防失控时长对恢复后的运行仍生效） */
  watchdogHandle: ReturnType<typeof setTimeout> | null = null
  startedAtMs = Date.now()
  settled = makeDeferred()

  constructor(readonly input: ExecuteRunInput) {
    this.nodeById = buildNodeMap(input.graph)
    this.incomingByNode = new Map()
    this.outgoingByNode = new Map()
    for (const edge of input.graph.edges) {
      const out = this.outgoingByNode.get(edge.sourceNodeId) ?? []
      out.push(edge)
      this.outgoingByNode.set(edge.sourceNodeId, out)
      const inc = this.incomingByNode.get(edge.targetNodeId) ?? []
      inc.push(edge)
      this.incomingByNode.set(edge.targetNodeId, inc)
    }
    this.settings = resolveExecutionSettings(input.settings)
    this.resolver = new VariableResolver({
      variables: this.variables,
      startInputs: input.startInputs,
    })
    // 预计算全部循环节点的 body 信息（与校验器同一实现）
    for (const node of input.graph.nodes) {
      if (node.type !== 'loop') continue
      const bodyEdge = (this.outgoingByNode.get(node.id) ?? []).find(e => e.kind === WORKFLOW_EDGE_KINDS['loop-body'])
      if (bodyEdge) {
        this.loopBodies.set(
          node.id,
          computeLoopBody(input.graph, this.nodeById, node.id, bodyEdge)
        )
      }
    }
  }

  /** 作用域归属：节点在给定作用域可见（根作用域=非任何 body 的节点；循环作用域=body 节点） */
  nodeBelongsToScope(nodeId: string, scope: ScopeState): boolean {
    if (scope.isRoot) {
      for (const body of this.loopBodies.values()) {
        if (body.bodySet.has(nodeId)) return false
      }
      return true
    }
    return (scope.bodyNodeIds as Set<string>).has(nodeId)
  }

  incomingOf(nodeId: string): WorkflowEdge[] {
    return this.incomingByNode.get(nodeId) ?? []
  }

  outgoingOf(nodeId: string, kind?: WorkflowEdge['kind']): WorkflowEdge[] {
    const all = this.outgoingByNode.get(nodeId) ?? []
    return kind === undefined ? all : all.filter(e => e.kind === kind)
  }

  /** 汇总各作用域统计 */
  stats(): RunExecutionStats {
    let done = 0
    let failed = 0
    let recovered = 0
    const count = (scope: ScopeState) => {
      for (const s of scope.states.values()) {
        if (s.status === WORKFLOW_NODE_RUN_STATUSES.succeeded) done++
        else if (s.status === WORKFLOW_NODE_RUN_STATUSES.failed) failed++
        else if (s.status === WORKFLOW_NODE_RUN_STATUSES.failed_recovered) recovered++
      }
    }
    count(this.rootScope)
    for (const scope of this.loopScopes.values()) count(scope)
    return {
      // 口径：totalNodes/doneNodes 均按"执行实例"计（循环体每迭代各 1），二者可比
      totalNodes: this.totalInstanceCount(),
      doneNodes: done,
      failedNodes: failed,
      recoveredNodes: recovered,
    }
  }

  /** 执行实例总数（根 + 各迭代作用域的 states 之和） */
  totalInstanceCount(): number {
    let n = this.rootScope.states.size
    for (const scope of this.loopScopes.values()) n += scope.states.size
    return n
  }

  anyUnrecoveredFailure(): boolean {
    const check = (scope: ScopeState) => {
      for (const s of scope.states.values()) if (s.status === WORKFLOW_NODE_RUN_STATUSES.failed) return true
      return false
    }
    if (check(this.rootScope)) return true
    for (const scope of this.loopScopes.values()) {
      if (scope.iterationSkippedByPolicy) continue // 已按 errorPolicy=skip 跳过，不算未恢复失败
      if (check(scope)) return true
    }
    return false
  }

  /** 全部作用域的在飞任务数 */
  totalRunningTasks(): number {
    let n = this.rootScope.runningTasks
    for (const scope of this.loopScopes.values()) n += scope.runningTasks
    return n
  }

  /** 终态且（任务排空或看门狗放行）→ resolve settled */
  maybeSettled(): void {
    if (this.settled.done) return
    if (this.finished && (this.totalRunningTasks() === 0 || this.forceRelease)) {
      this.settled.done = true
      this.settled.resolve()
    }
  }
}

export class WorkflowEngineService {
  private activeExecutions = new Map<string, RunExecution>()

  /** 日志写失败：run 立即失败终态（不变量 2——不可继续执行没有持久化日志的调度） */
  private static readonly JOURNAL_WRITE_FAILURE = '运行日志写入失败'

  constructor(
    private readonly deps: WorkflowEngineDeps,
    private readonly registry: WorkflowNodeRegistry
  ) {}

  get activeCount(): number {
    return this.activeExecutions.size
  }

  // ==================== Run Journal 写入（11 号 E1：先日志后内存） ====================

  /**
   * 追加事件：同步分配 seq 后 await 落库，**任何内存状态变更之前调用**（不变量 2）。
   * 写失败 = run 立即失败终态并中止调度。无 journal 装配（单测/极简）时直通。
   */
  private async appendEvent(
    exec: RunExecution,
    type: keyof typeof WORKFLOW_JOURNAL_EVENT_TYPES,
    opts: { nodeId?: string | null; scope?: ScopeState | null; payload?: Record<string, unknown> | null } = {}
  ): Promise<void> {
    const journal: WorkflowJournalPort | null = this.deps.journal ?? null
    if (!journal) return
    const event: JournalEventInput = {
      runId: exec.input.runId,
      seq: exec.nextEventSeq++,
      type: WORKFLOW_JOURNAL_EVENT_TYPES[type],
      nodeId: opts.nodeId ?? null,
      scopeKey: opts.scope?.key ?? null,
      payload: opts.payload ?? null,
    }
    exec.eventsSinceSnapshot++
    try {
      await journal.append(event)
      if (exec.eventsSinceSnapshot >= WORKFLOW_JOURNAL_DEFAULTS.snapshotEveryEvents) {
        if (this.deps.journal) await this.appendSnapshot(exec, 'threshold')
      }
    } catch (e) {
      logger.error(`[WorkflowEngine] ${WorkflowEngineService.JOURNAL_WRITE_FAILURE}`, e)
      await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, `${WorkflowEngineService.JOURNAL_WRITE_FAILURE}: ${errorMessage(e)}`).catch(fe =>
        logger.error('[WorkflowEngine] 日志失败终态化异常', fe)
      )
      throw new Error(WorkflowEngineService.JOURNAL_WRITE_FAILURE)
    }
  }

  /**
   * 投影快照（11 号 §4.4）：当前调度态整体序列化落为一条 snapshot 事件。
   * 快照是优化不是事实源——写失败仅 warn 降级为纯增量重放（与日志写失败的
   * run 失败语义刻意不同）。触发：每 snapshotEveryEvents 条 / 每次挂起强制。
   */
  private async appendSnapshot(exec: RunExecution, reason: 'threshold' | 'on-suspend'): Promise<void> {
    const journal: WorkflowJournalPort | null = this.deps.journal ?? null
    if (!journal) return
    const payload = this.serializeExecution(exec)
    const seq = exec.nextEventSeq++
    try {
      await journal.append({
        runId: exec.input.runId,
        seq,
        type: WORKFLOW_JOURNAL_EVENT_TYPES.snapshot,
        payload: { ...payload, reason },
      })
      exec.eventsSinceSnapshot = 0
    } catch (e) {
      logger.warn(`[WorkflowEngine] 快照写入失败（降级为增量重放；reason=${reason}）`, e)
    }
  }

  /** RunExecution → 可 JSON 投影（快照 payload；11 号 §4.4 结构） */
  private serializeExecution(exec: RunExecution): Record<string, unknown> {
    const serializeScope = (scope: ScopeState) => ({
      key: scope.key,
      iterationIndex: scope.iterationIndex,
      activationCounter: scope.activationCounter,
      activationSeqs: Object.fromEntries(scope.activationSeqs),
      states: [...scope.states.values()].map(st => ({
        nodeId: st.nodeId,
        iterationIndex: st.iterationIndex,
        status: st.status,
        retryCount: st.retryCount,
        error: st.error ?? null,
        output: st.output ?? null,
        routeTaken: st.routeTaken ?? null,
        reviewPayload: st.reviewPayload ?? null,
        reviewTimeoutMs: st.reviewTimeoutMs ?? null,
        reviewTimeoutPolicy: st.reviewTimeoutPolicy ?? null,
        waitExpiresAt: st.waitExpiresAt ? st.waitExpiresAt.getTime() : null,
        completedSeq: st.completedSeq ?? null,
        startedAtMs: st.startedAtMs,
      })),
      mergeArrivals: Object.fromEntries(
        [...scope.mergeArrivals.entries()].map(([k, v]) => [k, Object.fromEntries(v)])
      ),
      forcedMergeNodeIds: [...scope.forcedMergeNodeIds],
      loopOwnerId: scope.loopOwnerId,
      iterationSkippedByPolicy: scope.iterationSkippedByPolicy,
      loopPseudoVars: Object.fromEntries(scope.loopPseudoVars),
    })
    return {
      v: 1,
      suspended: exec.suspended,
      variables: Object.fromEntries(exec.variables),
      llmHistory: exec.llmHistory,
      runCounts: Object.fromEntries(exec.runCounts),
      scopes: [serializeScope(exec.rootScope), ...[...exec.loopScopes.values()].map(serializeScope)],
      loopDrivers: [...exec.loopDrivers.values()].map(d => ({
        loopNodeId: d.node.id,
        results: d.results,
        listSize: d.list.length,
        list: d.list,
        parentScopeKey: d.parentScope.key,
      })),
      reexecNodeIds: [...exec.reexecNodeIds],
    }
  }

  /** 批量追加（每批出边激活合并写，控制写放大；语义同逐条——失败整体抛错） */
  private async appendEventBatch(
    exec: RunExecution,
    type: keyof typeof WORKFLOW_JOURNAL_EVENT_TYPES,
    events: Array<{ nodeId?: string | null; scope?: ScopeState | null; payload?: Record<string, unknown> | null }>
  ): Promise<void> {
    const journal: WorkflowJournalPort | null = this.deps.journal ?? null
    if (!journal || events.length === 0) return
    const inputs = events.map(e => ({
      runId: exec.input.runId,
      seq: exec.nextEventSeq++,
      type: WORKFLOW_JOURNAL_EVENT_TYPES[type],
      nodeId: e.nodeId ?? null,
      scopeKey: e.scope?.key ?? null,
      payload: e.payload ?? null,
    }))
    exec.eventsSinceSnapshot += inputs.length
    try {
      await journal.appendBatch(inputs)
      if (exec.eventsSinceSnapshot >= WORKFLOW_JOURNAL_DEFAULTS.snapshotEveryEvents) {
        if (this.deps.journal) await this.appendSnapshot(exec, 'threshold')
      }
    } catch (e) {
      logger.error(`[WorkflowEngine] ${WorkflowEngineService.JOURNAL_WRITE_FAILURE}`, e)
      await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, `${WorkflowEngineService.JOURNAL_WRITE_FAILURE}: ${errorMessage(e)}`).catch(fe =>
        logger.error('[WorkflowEngine] 日志失败终态化异常', fe)
      )
      throw new Error(WorkflowEngineService.JOURNAL_WRITE_FAILURE)
    }
  }

  /**
   * 正在执行（非挂起）的运行数——全局并发上限的判定依据。
   * 挂起等待审核的运行不占并发槽（否则数个挂起即堵死全子系统）；
   * 其互斥由 MUTEX_RUN_STATUSES 的库级查询保证。
   */
  get activeRunningCount(): number {
    let n = 0
    for (const exec of this.activeExecutions.values()) {
      if (!exec.suspended) n++
    }
    return n
  }

  isWaitingReview(runId: string): boolean {
    const exec = this.activeExecutions.get(runId)
    return !!exec && exec.suspended
  }

  /**
   * 执行一次运行直至终态或挂起。
   * 返回值恒等于落库终态；waiting_review 表示挂起（互斥仍占用，resumeReview 续驱）。
   * ⚠️ 必须在 runWithUserAsync(run.userId) 上下文内调用。
   */
  async execute(input: ExecuteRunInput): Promise<WorkflowRunStatus> {
    const exec = new RunExecution(input)
    this.activeExecutions.set(input.runId, exec)

    // 防失控看门狗：最长时长到点强制终态
    this.armWatchdog(exec)

    try {
      const unregistered = input.graph.nodes.filter(n => !this.registry.get(n.type))
      if (unregistered.length > 0) {
        const error = `图中存在未注册的节点类型：${[
          ...new Set(unregistered.map(n => n.type)),
        ].join(', ')}`
        await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, error)
        return this.statusOf(exec)
      }

      await this.deps.runs.patchRun(input.runId, {
        status: WORKFLOW_NODE_RUN_STATUSES.running,
        startedAt: new Date(),
      })
      this.emitRunStatus(exec, 'running')
      // 首条事件：锚定配置链与新旧格式判据（11 号 §4.3 run_started）
      if (this.deps.journal) await this.appendEvent(exec, 'runStarted', {
        payload: { triggerType: exec.input.triggerInfo?.triggerType ?? 'manual', settings: exec.settings },
      })

      // 续跑装配：恢复已成功节点的变量与已激活边（已成功节点不再执行）
      if (input.resumedCheckpoints?.length) {
        this.hydrateCheckpoints(exec, input.resumedCheckpoints)
      }

      try {
        await this.pump(exec, exec.rootScope)
      } catch (e) {
        logger.error('[WorkflowEngine] pump 异常，兜底失败终态', e)
        await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, `引擎调度异常: ${errorMessage(e)}`)
      }

      // 挂起：execute 返回，exec 留在 activeExecutions 占互斥
      if (exec.suspended && !exec.finished) {
        exec.settled.done = true
        exec.settled.resolve()
        return 'waiting_review'
      }

      await exec.settled.promise
      // 挂起唤醒路径（handleReviewSuspend 显式 resolve）：settled 等待被唤醒时
      // 挂起可能发生在检查之后——复查（statusOf 对未终态挂起会误报 failed）
      if (exec.suspended && !exec.finished) return 'waiting_review'
      return this.statusOf(exec)
    } catch (e) {
      logger.error('[WorkflowEngine] execute 异常', e)
      try {
        await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, `引擎执行异常: ${errorMessage(e)}`)
      } catch (finalizeError) {
        logger.error('[WorkflowEngine] 兜底 finalize 失败', finalizeError)
      }
      return this.statusOf(exec)
    } finally {
      if (!exec.suspended) {
        this.clearWatchdog(exec)
        exec.maybeSettled()
        this.activeExecutions.delete(input.runId)
      }
    }
  }

  private statusOf(exec: RunExecution): WorkflowRunStatus {
    return exec.finalStatus ?? 'failed'
  }

  // ==================== 重放恢复（11 号 §5.3 E1） ====================

  /** rehydrate 单飞（per-runId Promise 去重——并发 reviewDecide/ticker 只触发一次） */
  private rehydrating = new Map<string, Promise<boolean>>()

  /**
   * 运行是否活跃；不活跃且库中为可恢复态（pending/running/waiting_review）且有
   * journal 事件 → rehydrate 重建。旧格式 run（无日志）返回 false（调用方走
   * 兼容降级——中断标记/手动续跑）。
   */
  async ensureActive(runId: string): Promise<boolean> {
    if (this.activeExecutions.has(runId)) return true
    const inflight = this.rehydrating.get(runId)
    if (inflight) return inflight
    const p = this.rehydrate(runId).finally(() => this.rehydrating.delete(runId))
    this.rehydrating.set(runId, p)
    return p
  }

  /**
   * 重建式恢复：读 run 行 + journal → replayJournal → 注册 activeExecutions →
   * 修复 node_run 投影 → 挂起等待 / 在途节点重执行。返回是否成功重建。
   */
  async rehydrate(runId: string): Promise<boolean> {
    const journal = this.deps.journal
    if (!journal || !this.deps.runs?.getById) return false
    try {
      if (!(await journal.hasEvents(runId))) return false
      const row = await this.deps.runs.getById(runId)
      if (!row) return false
      if (!['pending', 'running', 'waiting_review'].includes(row.status)) return false
      const events = await journal.listByRun(runId)
      if (events.length === 0) return false
      const snapshot = [...events].reverse().find(
        (e) => e.type === WORKFLOW_JOURNAL_EVENT_TYPES.snapshot,
      )
      const input: ExecuteRunInput = {
        runId,
        userId: row.userId,
        definitionId: row.definitionId,
        graph: row.graphSnapshot,
        startInputs: row.startInputs ?? {},
        settings: row.settings as never,
        triggerInfo: { ...(row.triggerInfo ?? {}), resumedByRehydrate: true },
      }
      const re = replayJournal(input, events, snapshot)
      const exec = re.exec
      if (exec.finished) {
        // 日志已含终态锚点但 run 行未终（崩溃在 run_finished 与 patchRun 之间）——
        // 修复投影：按锚点终态化 run 行，不重执行
        await this.deps.runs.patchRun(runId, {
          status: exec.finalStatus ?? 'failed',
          finishedAt: new Date(),
        })
        logger.info(`[WorkflowEngine] rehydrate ${runId}: 日志含终态锚点，修复 run 行终态`)
        return false
      }
      this.activeExecutions.set(runId, exec)
      logger.info(
        `[WorkflowEngine] rehydrate ${runId}: 事件 ${events.length} 条（快照=${snapshot ? 'yes' : 'no'}），` +
          `挂起=${re.suspended}，在途 ${re.inflightNodes.length} 节点`
      )

      if (re.suspended) {
        // 挂起等待：不重执行（reviewDecide/ticker 续驱）；重挂看门狗与超时扫描上下文
        this.armWatchdog(exec)
        return true
      }

      // 在途节点重执行（不变量 3：副作用只在真实执行时发生）——
      // 清运行态后重入 pump（computeReady 将其视为可启动）
      for (const item of re.inflightNodes) {
        const scope = exec.rootScope.key === item.scopeKey
          ? exec.rootScope
          : exec.loopScopes.get(item.scopeKey)
        if (!scope) continue
        const st = scope.states.get(item.nodeId)
        if (st && st.status === 'running') {
          scope.states.delete(item.nodeId)
          exec.reexecNodeIds.add(item.nodeId) // 复用 node_run 行（唯一索引约束）
        }
      }
      // 循环驱动器在途：迭代间崩溃 → 由 resumeSuspended 语义续驱（决策已无需）。
      // 直接重驱 root pump + 各 driver 继续（driveLoop 从 results.length 续）
      this.armWatchdog(exec)
      exec.suspended = true // 借用 resumeSuspended 的续驱编排（其内部会复位 suspended）
      void this.resumeSuspended(exec).catch(e =>
        logger.error(`[WorkflowEngine] rehydrate 续驱异常 ${runId}`, e)
      )
      return true
    } catch (e) {
      logger.error(`[WorkflowEngine] rehydrate ${runId} 失败`, e)
      return false
    }
  }

  // ==================== 审核：挂起 / 恢复 / 超时 ====================

  /**
   * 审核决策（挂起中的运行）。应用决策后后台续驱（不阻塞调用方）。
   * 返回是否成功应用（运行不活跃/节点非挂起态 → false，由服务层兜底 DB 直改）。
   */
  async resumeReview(
    runId: string,
    nodeId: string,
    decision: ReviewDecisionInput
  ): Promise<boolean> {
    const exec = this.activeExecutions.get(runId)
    if (!exec || !exec.suspended) return false

    const scope = this.findScopeOfNode(exec, nodeId)
    const state = scope?.states.get(nodeId)
    if (!scope || !state || state.status !== WORKFLOW_NODE_RUN_STATUSES.waiting_review) return false

    // choose 模式无效 choice → 拒绝并保持挂起（不炸调用方）
    try {
      await this.applyReviewDecision(exec, scope, state, {
        decision: decision.decision,
        comment: decision.comment,
        editedValues: decision.editedValues,
        choice: decision.choice,
        decidedAt: new Date().toISOString(),
      })
    } catch (e) {
      logger.warn(`审核决策被拒绝（运行保持挂起）: ${e instanceof Error ? e.message : String(e)}`)
      return false
    }
    // 决策已应用 → 后台续驱到终态（驳回无承接边时 applyReviewDecision 内已 finalize，
    // 不再续驱）；不阻塞调用方
    if (!exec.finished) {
      void this.resumeSuspended(exec).catch(e =>
        logger.error('[WorkflowEngine] 审核续驱异常', e)
      )
    }
    return true
  }

  /** 应用审核结果：节点 succeeded + route 激活 + 恢复运行 */
  private async applyReviewDecision(
    exec: RunExecution,
    scope: ScopeState,
    state: NodeExecutionState,
    review: {
      decision: 'approve' | 'approve_with_changes' | 'reject' | 'timeout_approve' | 'timeout_reject'
      comment?: string
      editedValues?: Record<string, unknown>
      choice?: string
      decidedAt: string
    }
  ): Promise<void> {
    const node = exec.nodeById.get(state.nodeId)
    if (!node) return
    const payload = state.reviewPayload ?? {}
    const isReject = review.decision === WORKFLOW_REVIEW_DECISIONS.reject || review.decision === WORKFLOW_REVIEW_DECISIONS.timeoutReject
    // editableFields 白名单：未声明的字段不允许修改（缺省=完全不允许修改）
    const editableKeys = new Set(
      ((node.config as { editableFields?: Array<{ key: string }> }).editableFields ?? []).map(
        f => f.key
      )
    )
    // P2：input 交互模式的输出字段天然可编辑（用户提交的文本就是产物）
    const interaction = (node.config as { interaction?: string }).interaction
    if (interaction === 'input') editableKeys.add('output_result')
    // E1 form-collect：声明字段全部可编辑（用户提交的表单值就是产物），输出统一组装 { values }
    const isFormCollect = node.type === WORKFLOW_NODE_TYPES['form-collect']
    if (isFormCollect) {
      for (const f of (node.config as { fields?: Array<{ key: string }> }).fields ?? []) {
        editableKeys.add(f.key)
      }
    }
    const filteredEdits = review.editedValues
      ? Object.fromEntries(Object.entries(review.editedValues).filter(([k]) => editableKeys.has(k)))
      : undefined
    // 评审 #101：form-collect 服务端约束校验——必填非空 + 下拉值必须在 options 内。
    // 此前只靠渲染端校验，直接调 wf:review-decide 可提交空必填/任意选项值。
    if (isFormCollect && !isReject) {
      const fields = ((node.config as { fields?: Array<FormFieldDef> }).fields ?? [])
      const problems: string[] = []
      for (const f of fields) {
        const v = filteredEdits?.[f.key]
        const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
        if (f.required && empty) {
          problems.push(`「${f.label || f.key}」为必填项`)
          continue
        }
        if (f.type === 'select' && !empty) {
          const optionValues = (f.options ?? []).map(o => o.value)
          const values = Array.isArray(v) ? v : [v]
          if (values.some(x => !optionValues.includes(x as never))) {
            problems.push(`「${f.label || f.key}」的值不在可选项内`)
          }
        }
      }
      if (problems.length > 0) {
        throw new Error(`表单校验失败：${problems.join('；')}`)
      }
    }
    let output: Record<string, unknown>
    if (isFormCollect) {
      output = { values: { ...filteredEdits }, cancelled: isReject }
    } else if (isReject) {
      output = { rejected: true, payload }
    } else if (filteredEdits && Object.keys(filteredEdits).length > 0) {
      output = { ...payload, ...filteredEdits }
    } else {
      output = payload
    }
    output = truncateOutput({ ...output, decision: review.decision }, exec.settings.maxOutputChars)
    // choose 交互：用户所选选项决定路由（复用 branch 边机制，key=branchId）。
    // reject 决策优先处理（choose 模式驳回走 reject 边，无 reject 边则运行失败——
    // 避免不带 choice 的 reject 进入选项校验而永久卡死挂起）
    let route: string
    const interaction2 = (node.config as { interaction?: string }).interaction
    if (interaction2 === 'choose' && !isReject) {
      const options = (node.config as { options?: Array<{ key: string }> }).options ?? []
      const choice = (review as { choice?: string }).choice
      if (!choice || !options.some(o => o.key === choice)) {
        throw new Error(`无效的选项：${choice ?? '(空)'}`)
      }
      output = { ...output, choice }
      route = encodeWorkflowHandleId(WORKFLOW_EDGE_KINDS.branch, choice)
    } else {
      route = isReject ? encodeWorkflowHandleId(WORKFLOW_EDGE_KINDS.reject) : encodeWorkflowHandleId(WORKFLOW_EDGE_KINDS.approve)
    }

    if (this.deps.journal) await this.appendEvent(exec, 'reviewDecided', {
      nodeId: state.nodeId,
      scope,
      payload: {
        iterationIndex: state.iterationIndex,
        decision: review.decision,
        comment: review.comment ?? null,
        editedValues: filteredEdits ?? null,
        choice: (review as { choice?: string }).choice ?? null,
        decidedAt: review.decidedAt,
        route,
      },
    })
    if (this.deps.journal) await this.appendEvent(exec, 'nodeCompleted', {
      nodeId: state.nodeId,
      scope,
      payload: { iterationIndex: state.iterationIndex, output, routeTaken: route, completedSeq: scope.activationCounter + 1 },
    })
    state.status = 'succeeded'
    state.output = output
    state.routeTaken = route
    state.waitExpiresAt = null
    state.completedSeq = ++scope.activationCounter // C1：审核决策路径同样记完成序号（防重执行误判）
    this.setScopeVariable(exec, scope, state.nodeId, output)

    await this.deps.nodeRuns.patchNode(exec.input.runId, state.nodeId, state.iterationIndex, {
      status: WORKFLOW_NODE_RUN_STATUSES.succeeded,
      output,
      routeTaken: route,
      waitExpiresAt: null,
      review: { decision: review.decision, comment: review.comment, editedValues: filteredEdits, decidedAt: review.decidedAt },
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)
    await this.activateOutgoing(exec, scope, node, route)
    // 驳回但无 reject 出边：运行终止（功能定稿：驳回无承接边 ⇒ failed）
    if (isReject) {
      const hasRejectEdge = exec.outgoingOf(node.id, WORKFLOW_EDGE_KINDS.reject).length > 0
      if (!hasRejectEdge && !exec.finished) {
        await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, `人工审核驳回（节点 ${node.name ?? node.id}，无驳回承接边）`)
      }
    }
  }

  /**
   * 恢复挂起运行：节点决策已应用（resumeReview/超时路径调用），后台续驱到终态。
   */
  private async resumeSuspended(exec: RunExecution): Promise<void> {
    if (exec.finished) return // 决策路径已终结运行（如驳回无承接边）
    exec.suspended = false
    // 重建看门狗：审核等待不计时长，但恢复后的执行重新受防失控上限约束
    this.armWatchdog(exec)
    await this.deps.runs.patchRun(exec.input.runId, { status: WORKFLOW_NODE_RUN_STATUSES.running })
    this.emitRunStatus(exec, 'running')
    exec.settled = makeDeferred()

    try {
      // 找到挂起时所在作用域：循环作用域先续驱完迭代，再回到根作用域
      for (const [scopeKey, scope] of [...exec.loopScopes]) {
        if (scope.settledAt?.done) continue
        await this.pump(exec, scope)
        if (exec.suspended) return // 又挂起了
        if (scope.failed || exec.finished) return
        // 迭代收敛：继续驱动所属循环
        const loopNodeId = parseScopeLoopNodeId(scopeKey)
        const driver = exec.loopDrivers.get(loopNodeId)
        if (driver) {
          await this.continueLoop(exec, driver, scope)
          if (exec.suspended || exec.finished) return
          exec.loopScopes.delete(scopeKey)
        }
      }
      await this.pump(exec, exec.rootScope)
    } catch (e) {
      logger.error('[WorkflowEngine] 续驱异常', e)
      await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, `续驱异常: ${errorMessage(e)}`)
    } finally {
      // ⚠️ 不能在任务在飞时立即 finalize（会把后续任务误标 cancelled）——
      // pump 返回≠运行结束：任务 settle 的泵链会推进并在静默时 finalize。
      if (!exec.suspended && !exec.finished) {
        await exec.settled.promise
      }
      // 兜底：settled 未 resolve 且非挂起（泵链异常死亡）→ 直接收敛
      if (!exec.suspended && !exec.finished) {
        await this.finalize(exec, exec.anyUnrecoveredFailure() ? WORKFLOW_RUN_STATUSES.failed : WORKFLOW_RUN_STATUSES.succeeded)
      }
      if (exec.finished) {
        exec.maybeSettled()
        this.activeExecutions.delete(exec.input.runId)
      }
    }
  }

  /**
   * ticker 周期调用：扫描内存中挂起审核的超时（按 timeoutPolicy 处理）。
   * 返回处理的数量（服务层可记日志）。
   */
  async tickReviewTimeouts(now = new Date()): Promise<number> {
    let handled = 0
    for (const exec of [...this.activeExecutions.values()]) {
      if (!exec.suspended) continue
      // ALS 纪律：ticker 无请求上下文，按运行归属用户重建（Web 端写库/事件路由依赖）
      await runWithUserAsync(exec.input.userId, async () => {
        const scope = this.findWaitingScope(exec)
        if (!scope) return
        for (const state of [...scope.states.values()]) {
          if (state.status !== WORKFLOW_NODE_RUN_STATUSES.waiting_review) continue
          if (!state.waitExpiresAt || state.waitExpiresAt > now) continue
          const policy = state.reviewTimeoutPolicy ?? 'fail'
          if (policy === WORKFLOW_REVIEW_TIMEOUT_POLICIES.approve) {
            try {
              await this.applyReviewDecision(exec, scope, state, {
                decision: WORKFLOW_REVIEW_DECISIONS.timeoutApprove,
                decidedAt: now.toISOString(),
              })
            } catch (e) {
              // choose 交互 + timeoutPolicy=approve：applyReviewDecision 对非 reject 决策
              // 强制 choice ∈ options，超时路径无 choice 必抛——若不拦，异常逃出 tick，
              // 运行永久 suspended + waitExpiresAt 过期每 tick 重复抛错刷日志，且中断
              // 同 tick 其余运行的超时扫描。转 fail 收敛（校验器另禁止该组合，见 graph-validator）。
              console.warn('[engine] 审核超时批准失败（choose 无默认选项），转失败:', e instanceof Error ? e.message : String(e))
              await this.handleNodeFailure(exec, scope, exec.nodeById.get(state.nodeId)!, state, '审核超时批准失败（choose 节点无默认选项）', false)
            }
          } else if (policy === WORKFLOW_REVIEW_TIMEOUT_POLICIES.reject) {
            await this.applyReviewDecision(exec, scope, state, {
              decision: WORKFLOW_REVIEW_DECISIONS.timeoutReject,
              decidedAt: now.toISOString(),
            })
          } else {
            await this.handleNodeFailure(exec, scope, exec.nodeById.get(state.nodeId)!, state, '审核超时（timeoutPolicy=fail）', false)
          }
          handled++
          if (exec.suspended) {
            // 挂起解除，续驱
            void this.resumeSuspended(exec)
          }
          break
        }
      })
    }
    return handled
  }

  // ==================== 取消 ====================

  /**
   * 取消运行（活动/挂起均可）。在飞任务取消标记后收敛；返回是否命中活动运行。
   * 非活动运行（排队/已终态）由服务层直接改库。
   */
  async cancelRun(runId: string, reason = '用户取消'): Promise<boolean> {
    const exec = this.activeExecutions.get(runId)
    if (!exec) return false
    exec.forceRelease = true
    exec.abortController.abort()
    if (exec.suspended) {
      exec.suspended = false
      // 挂起节点标 cancelled
      const scope = this.findWaitingScope(exec)
      if (scope) {
        for (const state of scope.states.values()) {
          if (state.status === WORKFLOW_NODE_RUN_STATUSES.waiting_review) {
            await this.markCancelled(exec, state)
          }
        }
      }
    }
    await this.finalize(exec, 'cancelled', reason)
    if (exec.finished) {
      exec.maybeSettled()
      this.activeExecutions.delete(runId)
    }
    return true
  }

  // ==================== 看门狗 ====================

  /** 装备看门狗（幂等：先清旧句柄） */
  private armWatchdog(exec: RunExecution): void {
    this.clearWatchdog(exec)
    const handle = setTimeout(() => void this.fireWatchdog(exec), exec.settings.maxDurationMs)
    handle.unref?.()
    exec.watchdogHandle = handle
  }

  private clearWatchdog(exec: RunExecution): void {
    if (exec.watchdogHandle !== null) {
      clearTimeout(exec.watchdogHandle)
      exec.watchdogHandle = null
    }
  }

  private async fireWatchdog(exec: RunExecution): Promise<void> {
    if (exec.finished) return
    // ⚠️ 挂起检查必须在 abort() 之前——否则挂起运行的取消信号被永久污染，
    // 审核批准后续驱会被 pump 的 aborted 检查误转为 cancelled
    if (exec.suspended) {
      // 挂起中不强制超时（审核等待不计入执行时长；run 的 timeout_at 死线由服务层管控）
      return
    }
    logger.warn(
      `[WorkflowEngine] 运行 ${exec.input.runId} 超过最长时长(${exec.settings.maxDurationMs}ms)，强制超时`
    )
    exec.forceRelease = true
    exec.abortController.abort()
    try {
      await this.finalize(exec, WORKFLOW_RUN_STATUSES.timed_out, '运行超过最长时长限制')
    } catch (e) {
      logger.error('[WorkflowEngine] 看门狗 finalize 失败', e)
    }
  }

  // ==================== 调度循环（作用域内） ====================

  private async pump(exec: RunExecution, scope: ScopeState): Promise<void> {
    if (exec.finished || scope.failed) return
    if (scope.pumping) {
      scope.requeue = true
      return
    }
    scope.pumping = true
    try {
      while (!exec.finished && !scope.failed && !exec.suspended) {
        if (exec.abortController.signal.aborted && !exec.suspended) {
          // 失败中止（pendingFailureError 已同步置位）→ failed；否则为用户取消
          await this.finalize(
            exec,
            exec.pendingFailureError ? WORKFLOW_RUN_STATUSES.failed : WORKFLOW_RUN_STATUSES.cancelled,
            exec.pendingFailureError
          )
          return
        }
        const ready = this.computeReady(exec, scope)
        if (ready.length === 0) {
          if (scope.runningTasks === 0) {
            const forced = this.collectForcedMerges(exec, scope)
            if (forced.length > 0) continue
            this.settleScope(exec, scope)
            return
          }
          return // 有任务在飞，settle 后会再次 pump
        }
        const slots = exec.settings.maxParallelNodes - scope.runningTasks
        if (slots <= 0) return
        const batch = ready.slice(0, slots)
        for (const node of batch) {
          await this.launchNode(exec, scope, node)
          if (exec.finished || scope.failed || exec.suspended) return
        }
      }
    } finally {
      scope.pumping = false
      if (scope.requeue && !exec.finished && !scope.failed && !exec.suspended) {
        scope.requeue = false
        void this.pump(exec, scope).catch(async e => {
          logger.error('[WorkflowEngine] requeue pump 异常，兜底失败终态', e)
          await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, `引擎调度异常: ${errorMessage(e)}`).catch(fe =>
            logger.error('[WorkflowEngine] requeue 兜底 finalize 失败', fe)
          )
        })
      }
    }
  }

  /** 作用域静默收敛：resolve settledAt（循环驱动据此推进下一迭代） */
  private settleScope(exec: RunExecution, scope: ScopeState): void {
    if (exec.anyUnrecoveredFailure()) scope.failed = true
    if (!scope.settledAt || scope.settledAt.done) {
      scope.settledAt = makeDeferred()
    }
    scope.settledAt.done = true
    scope.settledAt.resolve()
    // 根作用域静默 → 运行终态
    if (scope.isRoot && !exec.suspended && !exec.finished) {
      void this.finalize(exec, exec.anyUnrecoveredFailure() ? WORKFLOW_RUN_STATUSES.failed : WORKFLOW_RUN_STATUSES.succeeded).catch(fe =>
        logger.error('[WorkflowEngine] 静默收敛 finalize 失败', fe)
      )
    }
  }

  private collectForcedMerges(exec: RunExecution, scope: ScopeState): string[] {
    const forced: string[] = []
    for (const node of exec.input.graph.nodes) {
      if (!semOf(node.type).mergeOutput) continue
      if (!exec.nodeBelongsToScope(node.id, scope)) continue
      if (scope.states.has(node.id)) continue
      const arrivals = scope.mergeArrivals.get(node.id)
      if (arrivals && arrivals.size > 0) {
        scope.forcedMergeNodeIds.add(node.id)
        forced.push(node.id)
      }
    }
    return forced
  }

  private computeReady(exec: RunExecution, scope: ScopeState): WorkflowNode[] {
    const ready: WorkflowNode[] = []
    for (const node of exec.input.graph.nodes) {
      if (!exec.nodeBelongsToScope(node.id, scope)) continue
      const state = scope.states.get(node.id)
      if (state) {
        // 引擎驱动的节点（loop）与 start 永不重执行——loop 重执行由驱动器管理
        if (semOf(node.type).engineDriven) continue
        // C1 环重执行：终态节点 + 完成后有新激活的入边 → 清 state 重新入队
        const isTerminal = [
          WORKFLOW_NODE_RUN_STATUSES.succeeded,
          WORKFLOW_NODE_RUN_STATUSES.failed,
          WORKFLOW_NODE_RUN_STATUSES.failed_recovered,
          WORKFLOW_NODE_RUN_STATUSES.cancelled,
          WORKFLOW_NODE_RUN_STATUSES.timed_out,
        ].includes(state.status as never)
        if (!isTerminal) continue // running / waiting
        const hasNewActivation = exec
          .incomingOf(node.id)
          .some(e => (scope.activationSeqs.get(e.id) ?? 0) > (state.completedSeq ?? 0))
        if (hasNewActivation) {
          // 重执行：清 state（variables 保留旧输出直至新执行覆盖——多轮迭代语义）
          scope.states.delete(node.id)
          scope.mergeArrivals.delete(node.id)
          scope.forcedMergeNodeIds.delete(node.id)
          exec.reexecNodeIds.add(node.id) // launchNode 据此走"行重置"而非新建行（防唯一索引冲突）
          // 清除该节点全部出边激活记录：其下游（含环回连边）在新一轮 settle 后重新激活
          for (const out of exec.outgoingOf(node.id)) scope.activationSeqs.delete(out.id)
        } else {
          continue
        }
      }
      const sem = semOf(node.type)
      if (sem.rootOnly) {
        if (scope.isRoot) ready.push(node)
        continue
      }
      if (sem.engineDriven && !scope.isRoot) continue // 校验器已禁止嵌套；防御
      const incoming = exec
        .incomingOf(node.id)
        .filter(e => e.kind !== WORKFLOW_EDGE_KINDS[WORKFLOW_EDGE_KINDS['loop-back']])
      if (incoming.length === 0) continue
      const activated = incoming.filter(e => (scope.activationSeqs.get(e.id) ?? 0) > 0)
      if (activated.length === 0) continue

      if (semOf(node.type).mergeOutput && !scope.forcedMergeNodeIds.has(node.id)) {
        const waitAll = (node.config as { waitPolicy?: string }).waitPolicy !== 'any'
        if (waitAll && activated.length < incoming.length) continue
      }
      ready.push(node)
    }
    return ready
  }

  // ==================== 节点启动与执行 ====================

  private async launchNode(exec: RunExecution, scope: ScopeState, node: WorkflowNode): Promise<void> {
    // C3 override：模板解析前浅合并一次性覆盖（不修改定义图；值可含模板）
    const overrides = exec.input.configOverrides?.[node.id]
    const rawConfig = overrides && Object.keys(overrides).length > 0 ? { ...node.config, ...overrides } : node.config
    const resolvedConfig = resolveConfigDeep(
      rawConfig,
      t =>
        exec.resolver.resolve(t, this.localContextFor(exec, scope)),
      templateSkipKeysFor(node.type),
    )

    const state: NodeExecutionState = {
      nodeId: node.id,
      iterationIndex: scope.iterationIndex,
      status: WORKFLOW_NODE_RUN_STATUSES.running,
      retryCount: 0,
      startedAtMs: Date.now(),
    }
    scope.states.set(node.id, state)

    const reexec = exec.reexecNodeIds.has(node.id)
    if (reexec) {
      // C1 重执行：复用同一 node_run 行（唯一索引约束），重置状态与输出
      exec.reexecNodeIds.delete(node.id)
      await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, scope.iterationIndex, {
        status: WORKFLOW_NODE_RUN_STATUSES.running,
        input: resolvedConfig as Record<string, unknown>,
        output: null,
        error: null,
        routeTaken: null,
        review: null,
        finishedAt: null,
        durationMs: null,
      })
    } else {
      await this.deps.nodeRuns.startNode({
        runId: exec.input.runId,
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        iterationIndex: scope.iterationIndex,
        input: resolvedConfig as Record<string, unknown>,
      })
    }
    if (this.deps.journal) await this.appendEvent(exec, 'nodeLaunched', {
      nodeId: node.id,
      scope,
      payload: { nodeType: node.type, iterationIndex: scope.iterationIndex },
    })
    if (exec.finished || exec.abortController.signal.aborted) {
      await this.markCancelled(exec, state)
      return
    }
    // maxNodeRuns 护栏（P5：唯一计数点——重试/审核恢复不经过 launchNode，天然单实例单计数）
    const runsSoFar = (exec.runCounts.get(node.id) ?? 0) + 1
    exec.runCounts.set(node.id, runsSoFar)
    if (runsSoFar > exec.settings.maxNodeRuns) {
      // 护栏失败不可恢复（不走 fail 边——否则 fail 边回环会让护栏自身死循环）
      const guardError = `节点「${node.name}」超出最大运行次数 ${exec.settings.maxNodeRuns}（疑似死循环）`
      state.status = WORKFLOW_NODE_RUN_STATUSES.failed
      state.error = guardError
      state.completedSeq = ++scope.activationCounter
      await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, scope.iterationIndex, {
        status: WORKFLOW_NODE_RUN_STATUSES.failed,
        error: guardError,
        finishedAt: new Date(),
        durationMs: Date.now() - state.startedAtMs,
      })
      this.emitNodeStatus(exec, state)
      scope.failed = true
      exec.pendingFailureError = guardError
      exec.abortController.abort()
      if (scope.isRoot) {
        await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, guardError)
      }
      return
    }
    this.emitNodeStatus(exec, state)

    if (semOf(node.type).engineDriven) {
      await this.executeLoopNode(exec, scope, node, state, resolvedConfig)
      return
    }

    const handler = this.registry.getOrThrow(node.type)
    if (handler.controlKind === 'control') {
      await this.runNode(exec, scope, node, state, resolvedConfig)
    } else {
      scope.runningTasks++
      void runWithUserAsync(exec.input.userId, () =>
        this.runNode(exec, scope, node, state, resolvedConfig)
      )
        .catch(async e => {
          logger.error(`[WorkflowEngine] 节点 ${node.id} 执行链异常`, e)
          await this.handleNodeFailure(exec, scope, node, state, `节点执行链异常: ${errorMessage(e)}`).catch(
            fe => logger.error('[WorkflowEngine] 异常兜底失败', fe)
          )
        })
        .finally(() => {
          scope.runningTasks--
          exec.maybeSettled()
          void this.pump(exec, scope).catch(e =>
            logger.error(`[WorkflowEngine] settle 后 pump 异常: ${e instanceof Error ? e.stack : String(e)}`)
          )
        })
    }
  }

  private async runNode(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    state: NodeExecutionState,
    resolvedConfig: unknown
  ): Promise<void> {
    const handler = this.registry.getOrThrow(node.type)
    const ctx = this.buildContext(exec, scope, node, state, resolvedConfig)
    let result: WorkflowNodeExecutionResult
    try {
      result = await handler.execute(ctx)
    } catch (e) {
      result = { status: WORKFLOW_NODE_RUN_STATUSES.failed, error: errorMessage(e) }
    }
    await this.settle(exec, scope, node, state, result)
  }

  private async settle(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    state: NodeExecutionState,
    result: WorkflowNodeExecutionResult
  ): Promise<void> {
    if (exec.finished || exec.abortController.signal.aborted) {
      await this.markCancelled(exec, state)
      return
    }
    switch (result.status) {
      case 'succeeded':
        await this.handleNodeSuccess(exec, scope, node, state, result)
        break
      case 'waiting_review':
        await this.handleReviewSuspend(exec, scope, node, state, result)
        break
      case 'failed':
        await this.handleNodeFailure(exec, scope, node, state, result.error, result.retryable)
        break
    }
  }

  private async markCancelled(exec: RunExecution, state: NodeExecutionState): Promise<void> {
    state.status = 'cancelled'
    try {
      await this.deps.nodeRuns.patchNode(exec.input.runId, state.nodeId, state.iterationIndex, {
        status: WORKFLOW_NODE_RUN_STATUSES.cancelled,
        finishedAt: new Date(),
        durationMs: Date.now() - state.startedAtMs,
      })
      this.emitNodeStatus(exec, state)
    } catch (e) {
      logger.error(`[WorkflowEngine] 节点 ${state.nodeId} 取消标记失败`, e)
    }
  }

  private async handleNodeSuccess(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    state: NodeExecutionState,
    result: Extract<WorkflowNodeExecutionResult, { status: WORKFLOW_NODE_RUN_STATUSES.succeeded }>
  ): Promise<void> {
    if (exec.finished || exec.abortController.signal.aborted) {
      await this.markCancelled(exec, state)
      return
    }
    let output = result.output
    if (semOf(node.type).mergeOutput) {
      output = this.buildMergeOutput(exec, scope, node)
    }
    output = truncateOutput(output, exec.settings.maxOutputChars)

    const completedRoute = (result as { route?: string }).route ?? null
    if (this.deps.journal) await this.appendEvent(exec, 'nodeCompleted', {
      nodeId: node.id,
      scope,
      payload: {
        iterationIndex: state.iterationIndex,
        output,
        routeTaken: completedRoute,
        completedSeq: scope.activationCounter + 1,
      },
    })
    state.status = 'succeeded'
    state.output = output
    state.routeTaken = result.route ?? null
    state.completedSeq = ++scope.activationCounter // C1：记录完成序号（后续新激活触发重执行）
    this.setScopeVariable(exec, scope, node.id, output)

    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: WORKFLOW_NODE_RUN_STATUSES.succeeded,
      output,
      routeTaken: state.routeTaken,
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)
    await this.activateOutgoing(exec, scope, node, result.route)
  }

  /** 审核挂起：节点等待 + 运行挂起（互斥保持）+ 事件通知 */
  private async handleReviewSuspend(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    state: NodeExecutionState,
    result: Extract<WorkflowNodeExecutionResult, { status: WORKFLOW_NODE_RUN_STATUSES.waiting_review }>
  ): Promise<void> {
    const cfg = node.config as {
      timeoutPolicy?: 'approve' | 'reject' | 'fail'
    }
    const suspResult = result as { payload?: Record<string, unknown>; timeoutMs?: number | null }
    const suspendPayload = {
      iterationIndex: state.iterationIndex,
      reviewPayload: suspResult.payload ?? null,
      timeoutMs: suspResult.timeoutMs != null && Number(suspResult.timeoutMs) > 0 ? Number(suspResult.timeoutMs) : null,
      timeoutPolicy: (cfg.timeoutPolicy ?? 'fail') as 'approve' | 'reject' | 'fail',
    }
    if (this.deps.journal) await this.appendEvent(exec, 'nodeSuspended', {
      nodeId: node.id,
      scope,
      payload: suspendPayload,
    })
    state.status = 'waiting_review'
    state.reviewPayload = result.payload
    // 超时时长用 handler 返回的 result.timeoutMs（已含模板解析与 >0 规范化）——
    // 直接读原始 node.config 会拿到未解析的模板字符串 → Invalid Date → 永不超时
    state.reviewTimeoutMs =
      result.timeoutMs != null && Number(result.timeoutMs) > 0 ? Number(result.timeoutMs) : null
    state.reviewTimeoutPolicy = cfg.timeoutPolicy ?? 'fail'
    state.waitExpiresAt =
      state.reviewTimeoutMs != null
        ? new Date(Date.now() + state.reviewTimeoutMs)
        : null

    exec.suspended = true
    // 唤醒 execute 的 settled 等待：挂起不经 maybeSettled（那是 finished 专用），
    // journal 时序下 execute 可能已错过 suspended 检查落入 settled.promise——
    // 显式 resolve 防挂起死锁（resume 侧重建 deferred，见 resumeSuspended）
    if (!exec.settled.done) {
      exec.settled.done = true
      exec.settled.resolve()
    }
    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: WORKFLOW_NODE_RUN_STATUSES.waiting_review,
      output: result.payload,
      waitExpiresAt: state.waitExpiresAt,
    })
    await this.deps.runs.patchRun(exec.input.runId, { status: WORKFLOW_NODE_RUN_STATUSES.waiting_review })
    this.emitNodeStatus(exec, state)
    this.deps.events.emit({
      type: WORKFLOW_RUN_EVENT_TYPES.runStatus,
      runId: exec.input.runId,
      definitionId: exec.input.definitionId,
      status: WORKFLOW_NODE_RUN_STATUSES.waiting_review,
    })
    this.deps.events.emit({
      type: WORKFLOW_RUN_EVENT_TYPES.reviewRequested,
      runId: exec.input.runId,
      definitionId: exec.input.definitionId,
      nodeId: node.id,
      nodeName: node.name,
      payload: result.payload,
      waitExpiresAt: state.waitExpiresAt?.getTime(),
    })
    // 挂起强制快照（11 号 §4.4：挂起 run 可能等人数天，快照令 rehydrate O(1)）
    if (this.deps.journal) await this.appendSnapshot(exec, 'on-suspend')
  }

  private async handleNodeFailure(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    state: NodeExecutionState,
    error: string,
    retryable = true
  ): Promise<void> {
    if (exec.finished) return

    const retry = resolveNodeRetrySettings(node.settings, exec.settings)
    const canRetry = retryable && state.retryCount < retry.retryCount
    if (canRetry) {
      if (this.deps.journal) await this.appendEvent(exec, 'nodeFailed', {
        nodeId: node.id,
        scope,
        payload: { iterationIndex: state.iterationIndex, error, retryCount: state.retryCount + 1, disposition: 'retry_scheduled' },
      })
      state.retryCount += 1
      state.status = 'running'
      await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
        status: WORKFLOW_NODE_RUN_STATUSES.running,
        retryCount: state.retryCount,
        error,
      })
      this.emitNodeStatus(exec, state)
      if (retry.retryDelayMs > 0) {
        await this.sleep(retry.retryDelayMs, exec)
      }
      if (exec.finished || exec.abortController.signal.aborted) {
        await this.markCancelled(exec, state)
        return
      }
      const resolvedConfig = resolveConfigDeep(
        node.config,
        t =>
          exec.resolver.resolve(t, this.localContextFor(exec, scope)),
        templateSkipKeysFor(node.type),
      )
      await this.runNode(exec, scope, node, state, resolvedConfig)
      return
    }

    const failEdges = exec.outgoingOf(node.id, WORKFLOW_EDGE_KINDS.fail)
    if (failEdges.length > 0) {
      if (this.deps.journal) await this.appendEvent(exec, 'nodeFailed', {
        nodeId: node.id,
        scope,
        payload: { iterationIndex: state.iterationIndex, error, retryCount: state.retryCount, disposition: 'fail_edge' },
      })
      state.status = 'failed_recovered'
      state.error = error
      state.output = { error, recovered: true }
      state.completedSeq = ++scope.activationCounter // C1：失败恢复路径同样记完成序号
      this.setScopeVariable(exec, scope, node.id, state.output)
      await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
        status: WORKFLOW_NODE_RUN_STATUSES.failed_recovered,
        error,
        output: state.output,
        finishedAt: new Date(),
        durationMs: Date.now() - state.startedAtMs,
      })
      this.emitNodeStatus(exec, state)
      for (const edge of failEdges) {
        this.activateEdge(exec, scope, edge)
      }
      return
    }

    // 迭代级错误策略：循环配置 errorPolicy=skip 时，迭代内节点失败不传播到运行级。
    // 只标记本迭代失败（停止迭代内后续节点调度）+ 记录失败，不 abort 运行、
    // 不置 pendingFailureError——循环驱动器据此跳过该迭代继续跑其余迭代。
    if (scope.loopOwnerId && this.loopErrorPolicy(exec, scope.loopOwnerId) === 'skip') {
      if (this.deps.journal) await this.appendEvent(exec, 'nodeFailed', {
        nodeId: node.id,
        scope,
        payload: { iterationIndex: state.iterationIndex, error, retryCount: state.retryCount, disposition: 'iteration_skipped' },
      })
      state.status = 'failed'
      state.error = error
      state.completedSeq = ++scope.activationCounter
      scope.failed = true // 停止本迭代内后续节点（pump 检查 scope.failed）
      scope.iterationSkippedByPolicy = true // 循环驱动器/失败汇聚据此跳过本迭代
      await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
        status: WORKFLOW_NODE_RUN_STATUSES.failed,
        error,
        finishedAt: new Date(),
        durationMs: Date.now() - state.startedAtMs,
      })
      this.emitNodeStatus(exec, state)
      return
    }

    // ⚠️ 同步置位（先于下方首个 await）：abort 后漂浮的重入 pump 会立刻跑，
    // 必须让它们能区分"失败中止"与"用户取消"（见 pump 顶部 aborted 分支）
    if (this.deps.journal) await this.appendEvent(exec, 'nodeFailed', {
      nodeId: node.id,
      scope,
      payload: { iterationIndex: state.iterationIndex, error, retryCount: state.retryCount, disposition: 'fatal' },
    })
    state.status = 'failed'
    state.error = error
    state.completedSeq = ++scope.activationCounter // C1：失败终态同样记完成序号
    scope.failed = true
    exec.pendingFailureError = error
    exec.abortController.abort() // 在飞任务的 settle 会走取消分支
    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: WORKFLOW_NODE_RUN_STATUSES.failed,
      error,
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)
    if (scope.isRoot) {
      await this.finalize(exec, WORKFLOW_RUN_STATUSES.failed, error)
    }
    // 循环作用域失败：由循环驱动器感知（scope.failed）并处理 loop 节点失败
  }

  // ==================== 循环节点 ====================

  private async executeLoopNode(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    state: NodeExecutionState,
    resolvedConfig: unknown
  ): Promise<void> {
    const cfg = resolvedConfig as { listExpression: unknown; emptyPolicy?: 'skip' | 'fail' }
    const list = cfg.listExpression
    if (!Array.isArray(list)) {
      await this.handleNodeFailure(exec, scope, node, state, 'listExpression 必须解析为数组', false)
      return
    }
    if (list.length > exec.settings.maxLoopIterations) {
      await this.handleNodeFailure(
        exec,
        scope,
        node,
        state,
        `迭代数 ${list.length} 超过上限 ${exec.settings.maxLoopIterations}`,
        false
      )
      return
    }
    if (list.length === 0) {
      const policy = cfg.emptyPolicy ?? 'skip'
      if (policy === 'fail') {
        await this.handleNodeFailure(exec, scope, node, state, '遍历列表为空（emptyPolicy=fail）', false)
        return
      }
      await this.completeLoop(exec, scope, node, state, [], list)
      return
    }

    const driver: LoopDriver = { node, state, list, results: [], parentScope: scope }
    exec.loopDrivers.set(node.id, driver)
    if (this.deps.journal) await this.appendEvent(exec, 'loopStarted', {
      nodeId: node.id,
      scope,
      payload: { parentScopeKey: scope.key, listSize: list.length },
    })
    await this.driveLoop(exec, driver)
  }

  /** 从 results.length 迭代开始驱动（首次与续驱共用） */
  private async driveLoop(exec: RunExecution, driver: LoopDriver): Promise<void> {
    const { node, state, list, parentScope } = driver
    for (let i = driver.results.length; i < list.length; i++) {
      if (exec.finished || exec.abortController.signal.aborted || exec.suspended) return
      if (parentScope.failed) break

      const scopeKey = makeScopeKey(node.id, i)
      const bodyInfo = exec.loopBodies.get(node.id)
      if (!bodyInfo?.bodySet.size) {
        // 空 body（校验器要求 loop-body 边存在，防御）
        driver.results.push(undefined)
        continue
      }
      const loopScope = new ScopeState(scopeKey, i, bodyInfo.bodySet)
      loopScope.loopOwnerId = node.id
      loopScope.loopPseudoVars.set(node.id, { item: list[i], index: i, list })
      exec.loopScopes.set(scopeKey, loopScope)

      // 激活 loop-body 入口边（作用域内）：先批量落日志再内存激活
      const bodyEdges = exec.outgoingOf(node.id, WORKFLOW_EDGE_KINDS['loop-body'])
      if (bodyEdges.length > 0) {
        if (this.deps.journal) await this.appendEventBatch(
          exec,
          'edgeActivated',
          bodyEdges.map((edge, i) => ({
            scope: loopScope,
            payload: { edgeId: edge.id, seq: loopScope.activationCounter + 1 + i, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId },
          }))
        )
        for (const edge of bodyEdges) {
          void loopScope.activationSeqs.set(edge.id, ++loopScope.activationCounter)
        }
      }

      await this.pump(exec, loopScope)
      // 异步任务节点：pump 对任务 fire-and-forget（runningTasks>0 时直接返回），
      // 需等待作用域静默（settleScope resolve）——否则 collectIterationResult
      // 读到的是 running 状态（输出未落），results 汇聚为 null（C1 早报复现）。
      await this.waitScopeSettled(exec, loopScope)
      if (exec.suspended) return // 挂起：resumeSuspended 从本迭代续驱
      if (loopScope.failed) {
        // 迭代级失败：errorPolicy=skip → 跳过本迭代继续；否则中断循环（fail 策略）
        if (this.loopErrorPolicy(exec, node.id) === 'skip') {
          const skippedResult = { error: this.firstIterationError(loopScope), skipped: true }
          if (this.deps.journal) await this.appendEvent(exec, 'loopIterationSettled', {
            nodeId: node.id,
            scope: parentScope,
            payload: { iterationIndex: i, result: skippedResult, skipped: true },
          })
          driver.results.push(skippedResult)
          continue
        }
        break
      }
      if (exec.finished) return

      const iterationResult = this.collectIterationResult(exec, loopScope, node)
      if (this.deps.journal) await this.appendEvent(exec, 'loopIterationSettled', {
        nodeId: node.id,
        scope: parentScope,
        payload: { iterationIndex: i, result: iterationResult, skipped: false },
      })
      driver.results.push(iterationResult)
    }

    if (parentScope.failed || exec.finished) return
    if (this.anyScopeFailure(exec)) {
      // body 存在未恢复失败 → 循环节点失败（走 loop 的 fail 边或运行失败）。
      // 错误信息带上第一个失败节点与原因，便于运行详情直接定位（无需展开节点表）
      const detail = this.firstLoopFailureDetail(exec)
      await this.handleNodeFailure(
        exec,
        parentScope,
        node,
        state,
        detail ? `循环体内节点失败且未恢复（${detail}）` : '循环体内节点失败且未恢复',
        false
      )
      return
    }
    await this.completeLoop(exec, parentScope, node, state, driver.results, list)
  }

  /** 循环迭代作用域内第一个失败节点（未按策略跳过）的 "节点名: 错误" 摘要 */
  private firstLoopFailureDetail(exec: RunExecution): string | null {
    for (const scope of exec.loopScopes.values()) {
      if (scope.iterationSkippedByPolicy) continue
      for (const st of scope.states.values()) {
        if (st.status !== WORKFLOW_NODE_RUN_STATUSES.failed) continue
        const node = exec.nodeById.get(st.nodeId)
        const name = node?.name ?? st.nodeId
        const err = st.error ? String(st.error).slice(0, 120) : '未知错误'
        return `${name}: ${err}`
      }
    }
    return null
  }

  /** 迭代作用域内第一个失败节点的错误（skip 策略下 results 占位用） */
  private firstIterationError(scope: ScopeState): string {
    for (const st of scope.states.values()) {
      if (st.status === WORKFLOW_NODE_RUN_STATUSES.failed) return st.error ?? '迭代内节点失败'
    }
    return '迭代内节点失败'
  }

  /** 续驱已推进部分迭代的循环（resumeSuspended 调用） */
  private async continueLoop(exec: RunExecution, driver: LoopDriver, completedScope: ScopeState): Promise<void> {
    // 收集刚收敛迭代的产出
    if (driver.results.length < driver.list.length) {
      const idx = completedScope.iterationIndex
      if (driver.results.length === idx) {
        const iterationResult = this.collectIterationResult(exec, completedScope, driver.node)
        if (this.deps.journal) await this.appendEvent(exec, 'loopIterationSettled', {
          nodeId: driver.node.id,
          scope: driver.parentScope,
          payload: { iterationIndex: idx, result: iterationResult, skipped: false },
        })
        driver.results.push(iterationResult)
      }
    }
    await this.driveLoop(exec, driver)
  }

  /**
   * 等待作用域静默（所有在飞异步任务完成并 settle）。
   * pump 对任务 fire-and-forget：runningTasks>0 时 pump 直接返回，任务 .finally 后
   * 再 pump 直至 settleScope resolve settledAt。此处等待该收敛信号。
   */
  private async waitScopeSettled(exec: RunExecution, scope: ScopeState): Promise<void> {
    while (!exec.finished && !exec.suspended && !scope.failed && scope.runningTasks > 0) {
      // settledAt 可能尚未创建（任务在飞）；done=true 表示已收敛 → 退出
      if (scope.settledAt?.done) break
      await Promise.race([
        scope.settledAt ? scope.settledAt.promise : new Promise(resolve => setTimeout(resolve, 50)),
        new Promise(resolve => setTimeout(resolve, 50)),
      ])
    }
  }

  /** 迭代产出：body 中 loop-back 边源节点的输出（无回边则取 body 汇聚结果） */
  private collectIterationResult(
    exec: RunExecution,
    loopScope: ScopeState,
    _loopNode: WorkflowNode
  ): unknown {
    for (const edge of exec.input.graph.edges) {
      if (edge.kind !== WORKFLOW_EDGE_KINDS[WORKFLOW_EDGE_KINDS['loop-back']]) continue
      if (!loopScope.bodyNodeIds?.has(edge.sourceNodeId)) continue
      const st = loopScope.states.get(edge.sourceNodeId)
      if (st?.status === WORKFLOW_NODE_RUN_STATUSES.succeeded) return st.output
    }
    // 无回边：取 body 最后成功的节点输出（按状态表插入序）
    let last: Record<string, unknown> | undefined
    for (const st of loopScope.states.values()) {
      if (st.status === WORKFLOW_NODE_RUN_STATUSES.succeeded) last = st.output
    }
    return last
  }

  private async completeLoop(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    state: NodeExecutionState,
    results: unknown[],
    list: unknown[]
  ): Promise<void> {
    const output = truncateOutput(
      { results, count: list.length },
      exec.settings.maxOutputChars
    )
    if (this.deps.journal) await this.appendEvent(exec, 'loopCompleted', {
      nodeId: node.id,
      scope,
      payload: { output, routeTaken: WORKFLOW_EDGE_KINDS['loop-done'] },
    })
    state.status = 'succeeded'
    state.output = output
    state.routeTaken = WORKFLOW_EDGE_KINDS['loop-done']
    exec.variables.set(node.id, output)
    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: WORKFLOW_NODE_RUN_STATUSES.succeeded,
      output,
      routeTaken: WORKFLOW_EDGE_KINDS['loop-done'],
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)
    const doneEdges = exec.outgoingOf(node.id, WORKFLOW_EDGE_KINDS['loop-done'])
    if (doneEdges.length > 0) {
      if (this.deps.journal) await this.appendEventBatch(
        exec,
        'edgeActivated',
        doneEdges.map((edge, i) => ({
          scope,
          payload: { edgeId: edge.id, seq: scope.activationCounter + 1 + i, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId },
        }))
      )
    }
    for (const edge of doneEdges) this.activateEdge(exec, scope, edge)
  }

  // ==================== 边激活 ====================

  /** 出边批量激活：匹配边先批量落日志（每批一次 appendBatch 控制写放大）再内存激活 */
  private async activateOutgoing(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    route?: string
  ): Promise<void> {
    const matched: WorkflowEdge[] = []
    for (const edge of exec.outgoingOf(node.id)) {
      if (edge.kind === WORKFLOW_EDGE_KINDS[WORKFLOW_EDGE_KINDS['loop-back']] || edge.kind === WORKFLOW_EDGE_KINDS.fail) continue
      if (edge.kind === WORKFLOW_EDGE_KINDS[WORKFLOW_EDGE_KINDS['loop-body']] || edge.kind === WORKFLOW_EDGE_KINDS[WORKFLOW_EDGE_KINDS['loop-done']]) continue // 循环专有，由驱动器激活
      if (route) {
        const matches =
          edge.kind === 'branch'
            ? route === encodeWorkflowHandleId('branch', edge.branchId)
            : route === encodeWorkflowHandleId(edge.kind)
        if (matches) matched.push(edge)
      } else if (edge.kind === 'normal') {
        matched.push(edge)
      }
    }
    if (matched.length === 0) return
    if (this.deps.journal) await this.appendEventBatch(
      exec,
      'edgeActivated',
      matched.map(edge => ({
        scope,
        payload: {
          edgeId: edge.id,
          seq: scope.activationCounter + 1 + matched.indexOf(edge),
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
        },
      }))
    )
    for (const edge of matched) this.activateEdge(exec, scope, edge)
  }

  /**
   * 内存激活（同步；日志已在调用方批量落过——先日志后内存不变量）。
   * C1：首次激活记序号；重复激活跳过（防 pump 轮次间无限推进 counter 造成死循环）。
   * 环回连的"第二轮"激活由重执行清理（computeReady 删除 state 时同步清除该节点
   * 出边的激活记录——见 computeReady 重执行块）后自然产生
   */
  private activateEdge(exec: RunExecution, scope: ScopeState, edge: WorkflowEdge): void {
    if ((scope.activationSeqs.get(edge.id) ?? 0) > 0) return
    void scope.activationSeqs.set(edge.id, ++scope.activationCounter)
    const target = exec.nodeById.get(edge.targetNodeId)
    if (target && semOf(target.type).mergeOutput && exec.nodeBelongsToScope(target.id, scope)) {
      const sourceState = scope.states.get(edge.sourceNodeId)
      if (sourceState) {
        let arrivals = scope.mergeArrivals.get(target.id)
        if (!arrivals) {
          arrivals = new Map()
          scope.mergeArrivals.set(target.id, arrivals)
        }
        arrivals.set(edge.sourceNodeId, sourceState.output ?? {})
      }
    }
  }

  private buildMergeOutput(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode
  ): Record<string, unknown> {
    const arrivals = scope.mergeArrivals.get(node.id) ?? new Map()
    const outputMode = (node.config as { outputMode?: string }).outputMode ?? 'merge'
    if (outputMode === 'first') {
      const first = [...arrivals.values()][0]
      return { ...(first ?? {}) }
    }
    const merged: Record<string, unknown> = {}
    for (const [sourceId, output] of arrivals) {
      merged[sourceId] = output
    }
    return merged
  }

  // ==================== 续跑装配 ====================

  /** 恢复 checkpoint：根作用域变量 + 按 routeTaken 重放已激活边 */
  private hydrateCheckpoints(
    exec: RunExecution,
    checkpoints: ExecuteRunInput['resumedCheckpoints']
  ): void {
    if (!checkpoints) return
    for (const cp of checkpoints) {
      const state: NodeExecutionState = {
        nodeId: cp.nodeId,
        iterationIndex: 0,
        status: WORKFLOW_NODE_RUN_STATUSES.succeeded,
        retryCount: 0,
        output: cp.output,
        routeTaken: cp.routeTaken ?? null,
        startedAtMs: Date.now(),
      }
      exec.rootScope.states.set(cp.nodeId, state)
      exec.variables.set(cp.nodeId, cp.output)
      // 重放边激活（按留痕的 route）
      const node = exec.nodeById.get(cp.nodeId)
      if (!node) continue
      if (semOf(node.type).engineDriven) {
        for (const edge of exec.outgoingOf(node.id, WORKFLOW_EDGE_KINDS['loop-done'])) {
          void exec.rootScope.activationSeqs.set(edge.id, ++exec.rootScope.activationCounter)
        }
        continue
      }
      const route = cp.routeTaken ?? undefined
      for (const edge of exec.outgoingOf(cp.nodeId)) {
        if (edge.kind === WORKFLOW_EDGE_KINDS[WORKFLOW_EDGE_KINDS['loop-back']] || edge.kind === WORKFLOW_EDGE_KINDS[WORKFLOW_EDGE_KINDS['loop-body']] || edge.kind === WORKFLOW_EDGE_KINDS[WORKFLOW_EDGE_KINDS['loop-done']]) continue
        if (edge.kind === WORKFLOW_EDGE_KINDS.fail) continue // failed_recovered 的 fail 边：checkpoint 只含 succeeded
        const matches =
          route
            ? edge.kind === 'branch'
              ? route === encodeWorkflowHandleId('branch', edge.branchId)
              : route === encodeWorkflowHandleId(edge.kind)
            : edge.kind === 'normal'
        if (!matches) continue
        // 评审 #32：重放统一走 activateEdge——除记激活序号外，还向 parallel-merge
        // 目标补 mergeArrivals（此前手工只置 seq，续跑后 merge 输出恒为空）
        this.activateEdge(exec, exec.rootScope, edge)
      }
    }
    // 评审 #32 配套：装配完成后统一抬高 completedSeq 到当前激活计数，
    // 保证重放的入边激活不会被 C1 规则（seq > completedSeq）误判为「新激活」
    // 而重跑已成功节点——落实「已成功节点不再执行」的注释承诺。
    for (const cp of checkpoints) {
      const st = exec.rootScope.states.get(cp.nodeId)
      if (st) st.completedSeq = exec.rootScope.activationCounter
    }
  }

  // ==================== 工具 ====================

  private anyScopeFailure(exec: RunExecution): boolean {
    for (const scope of exec.loopScopes.values()) {
      if (scope.failed && !scope.iterationSkippedByPolicy) return true
    }
    return false
  }

  /** 循环节点的迭代错误策略（缺省 fail=失败即循环失败；skip=跳过失败迭代继续） */
  private loopErrorPolicy(exec: RunExecution, loopNodeId: string): 'fail' | 'skip' {
    const loopNode = exec.nodeById.get(loopNodeId)
    const policy = (loopNode?.config as { errorPolicy?: string } | undefined)?.errorPolicy
    return policy === 'skip' ? 'skip' : 'fail'
  }

  private findScopeOfNode(exec: RunExecution, nodeId: string): ScopeState | null {
    // 优先命中 waiting_review 状态的作用域（同名节点在多个迭代作用域都有 state，
    // 决策只能作用于挂起中的那个）
    for (const scope of [exec.rootScope, ...exec.loopScopes.values()]) {
      const st = scope.states.get(nodeId)
      if (st?.status === WORKFLOW_NODE_RUN_STATUSES.waiting_review) return scope
    }
    if (exec.rootScope.states.has(nodeId)) return exec.rootScope
    for (const scope of exec.loopScopes.values()) {
      if (scope.states.has(nodeId)) return scope
    }
    return null
  }

  private findWaitingScope(exec: RunExecution): ScopeState | null {
    for (const s of exec.rootScope.states.values()) {
      if (s.status === WORKFLOW_NODE_RUN_STATUSES.waiting_review) return exec.rootScope
    }
    for (const scope of exec.loopScopes.values()) {
      for (const s of scope.states.values()) {
        if (s.status === WORKFLOW_NODE_RUN_STATUSES.waiting_review) return scope
      }
    }
    return null
  }

  /** 作用域变量写入：body 节点写作用域局部表；其余写根命名空间 */
  private setScopeVariable(
    exec: RunExecution,
    scope: ScopeState,
    nodeId: string,
    output: Record<string, unknown>
  ): void {
    if (scope.isRoot) {
      exec.variables.set(nodeId, output)
    }
    // 局部变量经 localContextFor 动态读 scope.states，无需单独表
  }

  /** 变量解析的局部上下文：作用域内 body 节点输出 + 循环伪变量优先 */
  private localContextFor(
    exec: RunExecution,
    scope: ScopeState
  ): import('./variable-resolver').LocalLookup {
    return {
      lookup(rootId: string): { hit: boolean; value: unknown } {
        if (scope.loopPseudoVars.has(rootId)) {
          return { hit: true, value: scope.loopPseudoVars.get(rootId) }
        }
        if (!scope.isRoot) {
          const st = scope.states.get(rootId)
          if (st) return { hit: true, value: st.output ?? {} }
        }
        return { hit: false, value: undefined }
      },
    }
  }

  private buildContext(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    state: NodeExecutionState,
    resolvedConfig: unknown
  ): WorkflowNodeContext {
    return {
      runId: exec.input.runId,
      runKey: scope.isRoot ? node.id : `${node.id}:${scope.iterationIndex}`,
      nodeId: node.id,
      nodeType: node.type,
      iterationIndex: state.iterationIndex,
      config: resolvedConfig as Record<string, unknown>,
      startInputs: exec.input.startInputs,
      triggerInfo: exec.input.triggerInfo ?? {},
      signal: exec.abortController.signal,
      logger: {
        debug: (msg, extra) => console.debug(`[wf:${node.id}] ${msg}`, extra ?? ''),
        info: (msg, extra) => console.info(`[wf:${node.id}] ${msg}`, extra ?? ''),
        warn: (msg, extra) => logger.warn(`[wf:${node.id}] ${msg}`, extra ?? ''),
        error: (msg, extra) => logger.error(`[wf:${node.id}] ${msg}`, extra ?? ''),
      },
      emitProgress: (progress, message) => {
        this.deps.events.emit({
          type: WORKFLOW_RUN_EVENT_TYPES.nodeProgress,
          runId: exec.input.runId,
          nodeId: node.id,
          iterationIndex: state.iterationIndex,
          progress,
          message,
        })
      },
      resolveTemplate: <T>(template: string) =>
        exec.resolver.resolve(template, this.localContextFor(exec, scope)) as T,
      getVariable: (path: string) =>
        exec.resolver.resolve(`{{${path}}}`, this.localContextFor(exec, scope)),
      // 多轮对话：multiTurn 开启时，LLM 节点读历史/登记本轮；关闭时返回空（行为与无状态单轮一致）
      getLLMHistory: () => (exec.settings.multiTurn ? exec.llmHistory : []),
      recordLLMTurn: (role, content) => {
        if (exec.settings.multiTurn) exec.llmHistory.push({ role, content })
      },
    }
  }

  private emitNodeStatus(exec: RunExecution, state: NodeExecutionState): void {
    this.deps.events.emit({
      type: WORKFLOW_RUN_EVENT_TYPES.nodeStatus,
      runId: exec.input.runId,
      nodeId: state.nodeId,
      iterationIndex: state.iterationIndex,
      status: state.status,
      error: state.error,
      routeTaken: state.routeTaken ?? undefined,
    })
  }

  private emitRunStatus(
    exec: RunExecution,
    status: WorkflowRunStatus,
    stats?: RunExecutionStats,
    error?: string
  ): void {
    this.deps.events.emit({
      type: WORKFLOW_RUN_EVENT_TYPES.runStatus,
      runId: exec.input.runId,
      definitionId: exec.input.definitionId,
      status,
      stats,
      error,
    })
  }

  private async finalize(
    exec: RunExecution,
    status: WorkflowRunStatus,
    error?: string
  ): Promise<void> {
    if (exec.finished) return
    exec.finished = true
    this.clearWatchdog(exec)
    exec.finalStatus = status
    const stats = exec.stats()
    // run_finished 终态锚点（重放遇到即终止投影）。注意：journal 写失败在此路径内
    // 不再递归 finalize（exec.finished 已置位），写失败本身以 error 日志留痕
    if (this.deps.journal) {
      const seq = exec.nextEventSeq++
      await this.deps.journal
        .append({
          runId: exec.input.runId,
          seq,
          type: WORKFLOW_JOURNAL_EVENT_TYPES.runFinished,
          payload: { status, error: error ?? null, stats },
        })
        .catch(e => logger.error('[WorkflowEngine] run_finished 落日志失败（恢复投影将缺终态锚点）', e))
    }
    await this.deps.runs.patchRun(exec.input.runId, {
      status,
      error: error ?? null,
      finishedAt: new Date(),
      durationMs: Date.now() - exec.startedAtMs,
      stats,
    })
    this.emitRunStatus(exec, status, stats, error)
    exec.maybeSettled()
  }

  /** 可中断 sleep（resolve 语义——醒后由调用方自查 aborted） */
  private sleep(ms: number, exec: RunExecution): Promise<void> {
    return sleepAbortable(ms, exec.abortController.signal, 'resolve')
  }
}

/** 有界截断：保留全部字段键，均分预算；键过多时整体降级为键名预览 */
function truncateOutput(
  output: Record<string, unknown>,
  maxChars: number
): Record<string, unknown> {
  try {
    if (JSON.stringify(output).length <= maxChars) return output
  } catch {
    return { __truncated: true }
  }
  const keys = Object.keys(output)
  const perFieldCap = Math.floor((maxChars - 256) / Math.max(1, keys.length))
  if (perFieldCap < 64) {
    return { __truncated: true, keyCount: keys.length, keysPreview: keys.slice(0, 50) }
  }
  const truncated: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(output)) {
    if (typeof value === 'string') {
      truncated[key] =
        value.length > perFieldCap ? value.slice(0, perFieldCap) + '…[已截断]' : value
    } else {
      try {
        const json = stringifyValue(value)
        truncated[key] =
          json.length > perFieldCap
            ? { __truncated: true, preview: json.slice(0, perFieldCap) }
            : value
      } catch {
        truncated[key] = String(value)
      }
    }
  }
  truncated.__truncated = true
  return truncated
}
