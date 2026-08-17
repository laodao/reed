/**
 * 工作流执行作用域（片4：循环/审核/取消/续跑）
 * @module core/modules/workflow/engine/workflow-engine.service
 * @description 作用域架构：
 *              - 根作用域跑图主体；每个循环迭代是独立作用域（自己的
 *                states/activatedEdges/merge 语义），循环体节点只在迭代作用域内执行
 *              - 作用域静默（无 running/无 ready）或挂起（waiting_review）时收敛
 *              - 挂起时 execute() 返回 waiting_review（不占住调用方），
 *                RunExecution 留在 activeExecutions 占互斥；resumeReview 续驱
 *              - 续跑：根作用域按 succeeded checkpoint 装配变量与已激活边；
 *                未完成循环整体重跑（body 检查点作废，已完成循环经 loop 输出复用）
 *
 *              ALS 纪律不变：execute/续驱均须 runWithUserAsync(run.userId)。
 */

import { runWithUserAsync } from '@core/context/user-context'
import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeRunStatus,
  WorkflowRunStatus,
} from '@shared/types/workflow.types'
import { encodeWorkflowHandleId } from '@shared/types/workflow.types'
import type { WorkflowNodeContext, WorkflowNodeExecutionResult } from './node-handler'
import type { WorkflowEngineDeps } from './ports'
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
}

/** 节点内存态（作用域内以 nodeId 为键） */
interface NodeExecutionState {
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
  startedAtMs: number
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
class ScopeState {
  readonly states = new Map<string, NodeExecutionState>()
  readonly activatedEdges = new Set<string>()
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

  constructor(
    /** 作用域键：'root' 或 `${loopNodeId}:${iterationIndex}` */
    readonly key: string,
    readonly iterationIndex: number,
    /** 循环作用域的 body 节点集合；根作用域为 null */
    readonly bodyNodeIds: Set<string> | null
  ) {}

  get isRoot(): boolean {
    return this.key === 'root'
  }

  /** 作用域静默（无在飞任务且未在 pumping 中被调度）由 pump 判定并 resolve settledAt */
}

/** 循环驱动进度（挂起后续驱用） */
interface LoopDriver {
  node: WorkflowNode
  state: NodeExecutionState
  list: unknown[]
  results: unknown[]
  parentScope: ScopeState
}

/** 一次运行的完整内存态 */
class RunExecution {
  readonly nodeById: Map<string, WorkflowNode>
  readonly incomingByNode: Map<string, WorkflowEdge[]>
  readonly outgoingByNode: Map<string, WorkflowEdge[]>
  readonly resolver: VariableResolver
  readonly variables = new Map<string, Record<string, unknown>>()
  readonly rootScope = new ScopeState('root', 0, null)
  /** 循环迭代作用域：scopeKey → scope */
  readonly loopScopes = new Map<string, ScopeState>()
  /** 循环驱动进度：loopNodeId → driver（挂起/续驱用） */
  readonly loopDrivers = new Map<string, LoopDriver>()
  /** 循环节点的 body 信息（启动时一次计算） */
  readonly loopBodies = new Map<string, LoopBodyInfo>()
  readonly abortController = new AbortController()
  readonly settings: ResolvedExecutionSettings

  suspended = false
  finished = false
  finalStatus?: WorkflowRunStatus
  /** 看门狗触发后置位：不等待在飞任务排空，放行 execute 返回 */
  forceRelease = false
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
      const bodyEdge = (this.outgoingByNode.get(node.id) ?? []).find(e => e.kind === 'loop-body')
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
        if (s.status === 'succeeded') done++
        else if (s.status === 'failed') failed++
        else if (s.status === 'failed_recovered') recovered++
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
      for (const s of scope.states.values()) if (s.status === 'failed') return true
      return false
    }
    if (check(this.rootScope)) return true
    for (const scope of this.loopScopes.values()) if (check(scope)) return true
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

  constructor(
    private readonly deps: WorkflowEngineDeps,
    private readonly registry: WorkflowNodeRegistry
  ) {}

  get activeCount(): number {
    return this.activeExecutions.size
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
        await this.finalize(exec, 'failed', error)
        return this.statusOf(exec)
      }

      await this.deps.runs.patchRun(input.runId, {
        status: 'running',
        startedAt: new Date(),
      })
      this.emitRunStatus(exec, 'running')

      // 续跑装配：恢复已成功节点的变量与已激活边（已成功节点不再执行）
      if (input.resumedCheckpoints?.length) {
        this.hydrateCheckpoints(exec, input.resumedCheckpoints)
      }

      try {
        await this.pump(exec, exec.rootScope)
      } catch (e) {
        logger.error('[WorkflowEngine] pump 异常，兜底失败终态', e)
        await this.finalize(exec, 'failed', `引擎调度异常: ${errorMessage(e)}`)
      }

      // 挂起：execute 返回，exec 留在 activeExecutions 占互斥
      if (exec.suspended && !exec.finished) {
        exec.settled.done = true
        exec.settled.resolve()
        return 'waiting_review'
      }

      await exec.settled.promise
      return this.statusOf(exec)
    } catch (e) {
      logger.error('[WorkflowEngine] execute 异常', e)
      try {
        await this.finalize(exec, 'failed', `引擎执行异常: ${errorMessage(e)}`)
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
    if (!scope || !state || state.status !== 'waiting_review') return false

    await this.applyReviewDecision(exec, scope, state, {
      decision: decision.decision,
      comment: decision.comment,
      editedValues: decision.editedValues,
      decidedAt: new Date().toISOString(),
    })
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
      decidedAt: string
    }
  ): Promise<void> {
    const node = exec.nodeById.get(state.nodeId)
    if (!node) return
    const payload = state.reviewPayload ?? {}
    const isReject = review.decision === 'reject' || review.decision === 'timeout_reject'
    // editableFields 白名单：未声明的字段不允许修改（缺省=完全不允许修改）
    const editableKeys = new Set(
      ((node.config as { editableFields?: Array<{ key: string }> }).editableFields ?? []).map(
        f => f.key
      )
    )
    const filteredEdits = review.editedValues
      ? Object.fromEntries(Object.entries(review.editedValues).filter(([k]) => editableKeys.has(k)))
      : undefined
    let output: Record<string, unknown>
    if (isReject) {
      output = { rejected: true, payload }
    } else if (filteredEdits && Object.keys(filteredEdits).length > 0) {
      output = { ...payload, ...filteredEdits }
    } else {
      output = payload
    }
    output = truncateOutput({ ...output, decision: review.decision }, exec.settings.maxOutputChars)
    const route = isReject ? 'reject' : 'approve'

    state.status = 'succeeded'
    state.output = output
    state.routeTaken = route
    state.waitExpiresAt = null
    this.setScopeVariable(exec, scope, state.nodeId, output)

    await this.deps.nodeRuns.patchNode(exec.input.runId, state.nodeId, state.iterationIndex, {
      status: 'succeeded',
      output,
      routeTaken: route,
      waitExpiresAt: null,
      review: { decision: review.decision, comment: review.comment, editedValues: filteredEdits, decidedAt: review.decidedAt },
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)
    this.activateOutgoing(exec, scope, node, route)
    // 驳回但无 reject 出边：运行终止（功能定稿：驳回无承接边 ⇒ failed）
    if (isReject) {
      const hasRejectEdge = exec.outgoingOf(node.id, 'reject').length > 0
      if (!hasRejectEdge && !exec.finished) {
        await this.finalize(exec, 'failed', `人工审核驳回（节点 ${node.name ?? node.id}，无驳回承接边）`)
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
    await this.deps.runs.patchRun(exec.input.runId, { status: 'running' })
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
        const loopNodeId = scopeKey.split(':')[0]
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
      await this.finalize(exec, 'failed', `续驱异常: ${errorMessage(e)}`)
    } finally {
      if (!exec.suspended && !exec.finished) {
        // 作用域全部静默且无失败 → 终态
        await this.finalize(exec, exec.anyUnrecoveredFailure() ? 'failed' : 'succeeded')
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
          if (state.status !== 'waiting_review') continue
          if (!state.waitExpiresAt || state.waitExpiresAt > now) continue
          const policy = state.reviewTimeoutPolicy ?? 'fail'
          if (policy === 'approve') {
            await this.applyReviewDecision(exec, scope, state, {
              decision: 'timeout_approve',
              decidedAt: now.toISOString(),
            })
          } else if (policy === 'reject') {
            await this.applyReviewDecision(exec, scope, state, {
              decision: 'timeout_reject',
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
          if (state.status === 'waiting_review') {
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
      await this.finalize(exec, 'timed_out', '运行超过最长时长限制')
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
          await this.finalize(exec, 'cancelled')
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
          await this.finalize(exec, 'failed', `引擎调度异常: ${errorMessage(e)}`).catch(fe =>
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
      void this.finalize(exec, exec.anyUnrecoveredFailure() ? 'failed' : 'succeeded').catch(fe =>
        logger.error('[WorkflowEngine] 静默收敛 finalize 失败', fe)
      )
    }
  }

  private collectForcedMerges(exec: RunExecution, scope: ScopeState): string[] {
    const forced: string[] = []
    for (const node of exec.input.graph.nodes) {
      if (node.type !== 'parallel-merge') continue
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
      if (state && state.status !== 'pending') continue
      if (node.type === 'start') {
        if (scope.isRoot) ready.push(node)
        continue
      }
      if (node.type === 'loop' && !scope.isRoot) continue // 校验器已禁止嵌套；防御
      const incoming = exec
        .incomingOf(node.id)
        .filter(e => e.kind !== 'loop-back')
      if (incoming.length === 0) continue
      const activated = incoming.filter(e => scope.activatedEdges.has(e.id))
      if (activated.length === 0) continue

      if (node.type === 'parallel-merge' && !scope.forcedMergeNodeIds.has(node.id)) {
        const waitAll = (node.config as { waitPolicy?: string }).waitPolicy !== 'any'
        if (waitAll && activated.length < incoming.length) continue
      }
      ready.push(node)
    }
    return ready
  }

  // ==================== 节点启动与执行 ====================

  private async launchNode(exec: RunExecution, scope: ScopeState, node: WorkflowNode): Promise<void> {
    const resolvedConfig = resolveConfigDeep(node.config, t =>
      exec.resolver.resolve(t, this.localContextFor(exec, scope))
    )

    const state: NodeExecutionState = {
      nodeId: node.id,
      iterationIndex: scope.iterationIndex,
      status: 'running',
      retryCount: 0,
      startedAtMs: Date.now(),
    }
    scope.states.set(node.id, state)

    await this.deps.nodeRuns.startNode({
      runId: exec.input.runId,
      nodeId: node.id,
      nodeType: node.type,
      nodeName: node.name,
      iterationIndex: scope.iterationIndex,
      input: resolvedConfig as Record<string, unknown>,
    })
    if (exec.finished || exec.abortController.signal.aborted) {
      await this.markCancelled(exec, state)
      return
    }
    this.emitNodeStatus(exec, state)

    if (node.type === 'loop') {
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
            logger.error('[WorkflowEngine] settle 后 pump 异常', e)
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
      result = { status: 'failed', error: errorMessage(e) }
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
        status: 'cancelled',
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
    result: Extract<WorkflowNodeExecutionResult, { status: 'succeeded' }>
  ): Promise<void> {
    if (exec.finished || exec.abortController.signal.aborted) {
      await this.markCancelled(exec, state)
      return
    }
    let output = result.output
    if (node.type === 'parallel-merge') {
      output = this.buildMergeOutput(exec, scope, node)
    }
    output = truncateOutput(output, exec.settings.maxOutputChars)

    state.status = 'succeeded'
    state.output = output
    state.routeTaken = result.route ?? null
    this.setScopeVariable(exec, scope, node.id, output)

    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: 'succeeded',
      output,
      routeTaken: state.routeTaken,
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)
    this.activateOutgoing(exec, scope, node, result.route)
  }

  /** 审核挂起：节点等待 + 运行挂起（互斥保持）+ 事件通知 */
  private async handleReviewSuspend(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    state: NodeExecutionState,
    result: Extract<WorkflowNodeExecutionResult, { status: 'waiting_review' }>
  ): Promise<void> {
    const cfg = node.config as {
      timeoutPolicy?: 'approve' | 'reject' | 'fail'
    }
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
    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: 'waiting_review',
      output: result.payload,
      waitExpiresAt: state.waitExpiresAt,
    })
    await this.deps.runs.patchRun(exec.input.runId, { status: 'waiting_review' })
    this.emitNodeStatus(exec, state)
    this.deps.events.emit({
      type: 'run-status',
      runId: exec.input.runId,
      definitionId: exec.input.definitionId,
      status: 'waiting_review',
    })
    this.deps.events.emit({
      type: 'review-requested',
      runId: exec.input.runId,
      definitionId: exec.input.definitionId,
      nodeId: node.id,
      nodeName: node.name,
      payload: result.payload,
      waitExpiresAt: state.waitExpiresAt?.getTime(),
    })
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
      state.retryCount += 1
      state.status = 'running'
      await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
        status: 'running',
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
      const resolvedConfig = resolveConfigDeep(node.config, t =>
        exec.resolver.resolve(t, this.localContextFor(exec, scope))
      )
      await this.runNode(exec, scope, node, state, resolvedConfig)
      return
    }

    const failEdges = exec.outgoingOf(node.id, 'fail')
    if (failEdges.length > 0) {
      state.status = 'failed_recovered'
      state.error = error
      state.output = { error, recovered: true }
      this.setScopeVariable(exec, scope, node.id, state.output)
      await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
        status: 'failed_recovered',
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

    state.status = 'failed'
    state.error = error
    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: 'failed',
      error,
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)
    // 作用域失败：中止本作用域在飞任务；根作用域失败 → 终止运行
    scope.failed = true
    exec.abortController.abort()
    if (scope.isRoot) {
      await this.finalize(exec, 'failed', error)
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
    await this.driveLoop(exec, driver)
  }

  /** 从 results.length 迭代开始驱动（首次与续驱共用） */
  private async driveLoop(exec: RunExecution, driver: LoopDriver): Promise<void> {
    const { node, state, list, parentScope } = driver
    for (let i = driver.results.length; i < list.length; i++) {
      if (exec.finished || exec.abortController.signal.aborted || exec.suspended) return
      if (parentScope.failed) break

      const scopeKey = `${node.id}:${i}`
      const bodyInfo = exec.loopBodies.get(node.id)
      if (!bodyInfo?.bodySet.size) {
        // 空 body（校验器要求 loop-body 边存在，防御）
        driver.results.push(undefined)
        continue
      }
      const loopScope = new ScopeState(scopeKey, i, bodyInfo.bodySet)
      loopScope.loopPseudoVars.set(node.id, { item: list[i], index: i, list })
      exec.loopScopes.set(scopeKey, loopScope)

      // 激活 loop-body 入口边（作用域内）
      for (const edge of exec.outgoingOf(node.id, 'loop-body')) {
        loopScope.activatedEdges.add(edge.id)
      }

      await this.pump(exec, loopScope)
      if (exec.suspended) return // 挂起：resumeSuspended 从本迭代续驱
      if (loopScope.failed) break
      if (exec.finished) return

      driver.results.push(this.collectIterationResult(exec, loopScope, node))
    }

    if (parentScope.failed || exec.finished) return
    if (this.anyScopeFailure(exec)) {
      // body 存在未恢复失败 → 循环节点失败（走 loop 的 fail 边或运行失败）
      await this.handleNodeFailure(
        exec,
        parentScope,
        node,
        state,
        '循环体内节点失败且未恢复',
        false
      )
      return
    }
    await this.completeLoop(exec, parentScope, node, state, driver.results, list)
  }

  /** 续驱已推进部分迭代的循环（resumeSuspended 调用） */
  private async continueLoop(exec: RunExecution, driver: LoopDriver, completedScope: ScopeState): Promise<void> {
    // 收集刚收敛迭代的产出
    if (driver.results.length < driver.list.length) {
      const idx = completedScope.iterationIndex
      if (driver.results.length === idx) {
        driver.results.push(this.collectIterationResult(exec, completedScope, driver.node))
      }
    }
    await this.driveLoop(exec, driver)
  }

  /** 迭代产出：body 中 loop-back 边源节点的输出（无回边则取 body 汇聚结果） */
  private collectIterationResult(
    exec: RunExecution,
    loopScope: ScopeState,
    _loopNode: WorkflowNode
  ): unknown {
    for (const edge of exec.input.graph.edges) {
      if (edge.kind !== 'loop-back') continue
      if (!loopScope.bodyNodeIds?.has(edge.sourceNodeId)) continue
      const st = loopScope.states.get(edge.sourceNodeId)
      if (st?.status === 'succeeded') return st.output
    }
    // 无回边：取 body 最后成功的节点输出（按状态表插入序）
    let last: Record<string, unknown> | undefined
    for (const st of loopScope.states.values()) {
      if (st.status === 'succeeded') last = st.output
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
    state.status = 'succeeded'
    state.output = output
    state.routeTaken = 'loop-done'
    exec.variables.set(node.id, output)
    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: 'succeeded',
      output,
      routeTaken: 'loop-done',
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)
    for (const edge of exec.outgoingOf(node.id, 'loop-done')) {
      this.activateEdge(exec, scope, edge)
    }
  }

  // ==================== 边激活 ====================

  private activateOutgoing(
    exec: RunExecution,
    scope: ScopeState,
    node: WorkflowNode,
    route?: string
  ): void {
    for (const edge of exec.outgoingOf(node.id)) {
      if (edge.kind === 'loop-back' || edge.kind === 'fail') continue
      if (edge.kind === 'loop-body' || edge.kind === 'loop-done') continue // 循环专有，由驱动器激活
      if (route) {
        const matches =
          edge.kind === 'branch'
            ? route === encodeWorkflowHandleId('branch', edge.branchId)
            : route === encodeWorkflowHandleId(edge.kind)
        if (matches) this.activateEdge(exec, scope, edge)
      } else if (edge.kind === 'normal') {
        this.activateEdge(exec, scope, edge)
      }
    }
  }

  private activateEdge(exec: RunExecution, scope: ScopeState, edge: WorkflowEdge): void {
    if (scope.activatedEdges.has(edge.id)) return
    scope.activatedEdges.add(edge.id)
    const target = exec.nodeById.get(edge.targetNodeId)
    if (target?.type === 'parallel-merge' && exec.nodeBelongsToScope(target.id, scope)) {
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
        status: 'succeeded',
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
      if (node.type === 'loop') {
        for (const edge of exec.outgoingOf(node.id, 'loop-done')) {
          exec.rootScope.activatedEdges.add(edge.id)
        }
        continue
      }
      const route = cp.routeTaken ?? undefined
      for (const edge of exec.outgoingOf(cp.nodeId)) {
        if (edge.kind === 'loop-back' || edge.kind === 'loop-body' || edge.kind === 'loop-done') continue
        if (edge.kind === 'fail') continue // failed_recovered 的 fail 边：checkpoint 只含 succeeded
        if (route) {
          const matches =
            edge.kind === 'branch'
              ? route === encodeWorkflowHandleId('branch', edge.branchId)
              : route === encodeWorkflowHandleId(edge.kind)
          if (matches) exec.rootScope.activatedEdges.add(edge.id)
        } else if (edge.kind === 'normal') {
          exec.rootScope.activatedEdges.add(edge.id)
        }
      }
    }
  }

  // ==================== 工具 ====================

  private anyScopeFailure(exec: RunExecution): boolean {
    for (const scope of exec.loopScopes.values()) {
      if (scope.failed) return true
    }
    return false
  }

  private findScopeOfNode(exec: RunExecution, nodeId: string): ScopeState | null {
    // 优先命中 waiting_review 状态的作用域（同名节点在多个迭代作用域都有 state，
    // 决策只能作用于挂起中的那个）
    for (const scope of [exec.rootScope, ...exec.loopScopes.values()]) {
      const st = scope.states.get(nodeId)
      if (st?.status === 'waiting_review') return scope
    }
    if (exec.rootScope.states.has(nodeId)) return exec.rootScope
    for (const scope of exec.loopScopes.values()) {
      if (scope.states.has(nodeId)) return scope
    }
    return null
  }

  private findWaitingScope(exec: RunExecution): ScopeState | null {
    for (const s of exec.rootScope.states.values()) {
      if (s.status === 'waiting_review') return exec.rootScope
    }
    for (const scope of exec.loopScopes.values()) {
      for (const s of scope.states.values()) {
        if (s.status === 'waiting_review') return scope
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
      signal: exec.abortController.signal,
      logger: {
        debug: (msg, extra) => console.debug(`[wf:${node.id}] ${msg}`, extra ?? ''),
        info: (msg, extra) => console.info(`[wf:${node.id}] ${msg}`, extra ?? ''),
        warn: (msg, extra) => logger.warn(`[wf:${node.id}] ${msg}`, extra ?? ''),
        error: (msg, extra) => logger.error(`[wf:${node.id}] ${msg}`, extra ?? ''),
      },
      emitProgress: (progress, message) => {
        this.deps.events.emit({
          type: 'node-progress',
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
    }
  }

  private emitNodeStatus(exec: RunExecution, state: NodeExecutionState): void {
    this.deps.events.emit({
      type: 'node-status',
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
      type: 'run-status',
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
