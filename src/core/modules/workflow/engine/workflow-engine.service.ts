/**
 * 工作流执行引擎（核心调度器）
 * @module core/modules/workflow/engine/workflow-engine.service
 * @description 一次运行（Run）的完整调度：就绪判定 → 并发受限启动 → 节点执行 →
 *              边激活 → 再调度，直到运行终态。
 *
 *              调度语义（片3 范围；循环/审核挂起/续跑见片4）：
 *              1. 事件驱动 pump()：节点终态触发重算就绪集；重入用 pumping 守卫 +
 *                 requeue 标记（微任务级收敛，防递归风暴）
 *              2. 就绪判定：普通节点任一入边激活即就绪（条件分支汇合处不死锁）；
 *                 parallel-merge(waitPolicy=all) 等齐全部入边，运行静默时
 *                 已有≥1 路到达的 merge 强制收敛执行，零到达的视为未执行
 *              3. 边激活：succeeded 按 route（条件/审核）或全部 normal 出边；
 *                 failed_recovered 走 fail 出边；failed 终止运行
 *              4. 失败语义（严格）：重试耗尽且有 fail 边 → failed_recovered 继续；
 *                 无 fail 边 → 中止同运行其余节点 → run failed
 *              5. 输出截断：节点 settle 后统一截断（防失控），加 __truncated 标记
 *              6. 终态：任何未恢复失败 ⇒ failed；静默且无失败 ⇒ succeeded（宽容收敛）
 *              7. 防失控看门狗：maxDurationMs 到点强制 abort + finalize('timed_out')，
 *                 并放行 execute() 返回（不等待永不返回的悬挂任务）
 *
 *              健壮性纪律（review 修复）：
 *              - execute 全程 try/catch：任何写库异常 → 兜底 finalize('failed')，
 *                运行记录绝不悬死 running（否则同工作流互斥被永久占用）
 *              - 所有 settle 路径（成功/失败/重试醒转/启动后）都复查
 *                finished/aborted，杜绝"运行终态后仍执行节点/发事件/写库"
 *              - execute 返回值 = finalize 落库的终态（不按 states 插入序推导，
 *                消除返回值与持久化状态不一致）
 *
 *              ALS 纪律：调用方（服务层）必须以 runWithUserAsync(run.userId) 包裹
 *              execute()；引擎对每个任务执行链再包一层（防御性，幂等）。
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
import { buildNodeMap } from './graph-topology'

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
  /** 工作流级设置（未解析的原样传入；引擎内部走默认值→上限解析） */
  settings?: import('@shared/types/workflow.types').WorkflowExecutionSettings | null
}

/** 节点内存态 */
interface NodeExecutionState {
  nodeKey: string
  nodeId: string
  iterationIndex: number
  status: WorkflowNodeRunStatus
  retryCount: number
  error?: string
  output?: Record<string, unknown>
  routeTaken?: string | null
  startedAtMs: number
}

/** 一次运行的完整内存态 */
class RunExecution {
  readonly nodeById: Map<string, WorkflowNode>
  /** 入边/出边邻接表（构建一次，pump 每轮 O(度) 查询） */
  readonly incomingByNode: Map<string, WorkflowEdge[]>
  readonly outgoingByNode: Map<string, WorkflowEdge[]>
  readonly resolver: VariableResolver
  readonly variables = new Map<string, Record<string, unknown>>()
  readonly states = new Map<string, NodeExecutionState>()
  readonly activatedEdges = new Set<string>()
  /** merge 节点到达记录：mergeNodeId → (来源nodeId → 来源输出) */
  readonly mergeArrivals = new Map<string, Map<string, Record<string, unknown>>>()
  /** 静默时被强制收敛的 merge（已按部分到达执行） */
  readonly forcedMergeNodeIds = new Set<string>()
  readonly abortController = new AbortController()
  readonly settings: ResolvedExecutionSettings

  runningTasks = 0
  pumping = false
  requeue = false
  finished = false
  /** finalize 实际落库的终态（execute 返回值的唯一来源） */
  finalStatus?: WorkflowRunStatus
  /** 看门狗触发后置位：不再等待在飞任务排空，放行 execute 返回 */
  forceRelease = false
  startedAtMs = Date.now()
  /** execute 主流程等待的完成信号（deferred；finalize / 任务排空时 resolve） */
  readonly settled: { promise: Promise<void>; resolve: () => void; done: boolean }

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
    let resolveSettled!: () => void
    const promise = new Promise<void>(resolve => {
      resolveSettled = resolve
    })
    this.settled = { promise, resolve: resolveSettled, done: false }
  }

  incomingOf(nodeId: string): WorkflowEdge[] {
    return this.incomingByNode.get(nodeId) ?? []
  }

  outgoingOf(nodeId: string, kind?: WorkflowEdge['kind']): WorkflowEdge[] {
    const all = this.outgoingByNode.get(nodeId) ?? []
    return kind === undefined ? all : all.filter(e => e.kind === kind)
  }

  /** 节点执行键：循环体内节点恒带迭代后缀（含第 0 轮）；其余节点无后缀 */
  nodeKey(nodeId: string, iterationIndex: number, isBodyNode = false): string {
    return isBodyNode ? `${nodeId}:${iterationIndex}` : nodeId
  }

  /** 终态且（任务排空 或 看门狗放行）→ resolve settled */
  maybeSettled(): void {
    if (this.settled.done) return
    if (this.finished && (this.runningTasks === 0 || this.forceRelease)) {
      this.settled.done = true
      this.settled.resolve()
    }
  }
}

export class WorkflowEngineService {
  /** 活动运行（片4 的取消/审核恢复按 runId 定位） */
  private activeExecutions = new Map<string, RunExecution>()

  constructor(
    private readonly deps: WorkflowEngineDeps,
    private readonly registry: WorkflowNodeRegistry
  ) {}

  /** 当前活动运行数（服务层全局并发控制用） */
  get activeCount(): number {
    return this.activeExecutions.size
  }

  /**
   * 执行一次运行直至终态（succeeded / failed / timed_out）。
   * 返回值恒等于 finalize 落库的终态。挂起（waiting_review）与取消在片4 扩展。
   *
   * ⚠️ 必须在 runWithUserAsync(run.userId) 上下文内调用。
   */
  async execute(input: ExecuteRunInput): Promise<WorkflowRunStatus> {
    const exec = new RunExecution(input)
    this.activeExecutions.set(input.runId, exec)

    // 防失控看门狗：最长时长到点强制终态（不清除的 setTimeout 会阻止进程退出）
    const watchdog = setTimeout(() => {
      void this.fireWatchdog(exec)
    }, exec.settings.maxDurationMs)
    watchdog.unref?.()

    try {
      // 启动前置检查：图中节点类型必须全部已注册（未注册=引擎无法执行）
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

      try {
        await this.pump(exec)
      } catch (e) {
        // pump 链路异常（多为写库失败）：兜底终态，绝不悬死 running
        console.error('[WorkflowEngine] pump 异常，兜底失败终态', e)
        await this.finalize(exec, 'failed', `引擎调度异常: ${errorMessage(e)}`)
      }

      await exec.settled.promise
      return this.statusOf(exec)
    } catch (e) {
      // patchRun/finalize 等自身异常：尽力落终态后原样上抛（服务层兜底）
      console.error('[WorkflowEngine] execute 异常', e)
      try {
        await this.finalize(exec, 'failed', `引擎执行异常: ${errorMessage(e)}`)
      } catch (finalizeError) {
        console.error('[WorkflowEngine] 兜底 finalize 也失败', finalizeError)
      }
      return this.statusOf(exec)
    } finally {
      clearTimeout(watchdog)
      exec.maybeSettled()
      this.activeExecutions.delete(input.runId)
    }
  }

  /** execute 返回值唯一来源：finalize 落库的终态 */
  private statusOf(exec: RunExecution): WorkflowRunStatus {
    return exec.finalStatus ?? 'failed'
  }

  /** 看门狗：超时长死线 → abort 在飞 + timed_out 终态 + 放行返回 */
  private async fireWatchdog(exec: RunExecution): Promise<void> {
    if (exec.finished) return
    console.warn(
      `[WorkflowEngine] 运行 ${exec.input.runId} 超过最长时长(${exec.settings.maxDurationMs}ms)，强制超时`
    )
    exec.forceRelease = true
    exec.abortController.abort()
    try {
      await this.finalize(exec, 'timed_out', '运行超过最长时长限制')
    } catch (e) {
      console.error('[WorkflowEngine] 看门狗 finalize 失败', e)
    }
  }

  // ==================== 调度循环 ====================

  /**
   * 就绪计算 + 受限启动。重入收敛：pumping 期间再次调用只置 requeue。
   */
  private async pump(exec: RunExecution): Promise<void> {
    if (exec.finished) return
    if (exec.pumping) {
      exec.requeue = true
      return
    }
    exec.pumping = true
    try {
      while (!exec.finished) {
        if (exec.abortController.signal.aborted) {
          await this.finalize(exec, 'cancelled')
          return
        }
        const ready = this.computeReady(exec)
        if (ready.length === 0) {
          if (exec.runningTasks === 0) {
            // 静默：部分到达的 merge 强制收敛（等齐语义的防死锁分支）。
            // forcedMergeNodeIds 幂等累积——已执行的 merge 会被 states.has 跳过，
            // 不需要清理（清理反而会造成"加进去又被清掉"的无限循环）
            const forced = this.collectForcedMerges(exec)
            if (forced.length > 0) continue
            await this.finalize(exec, this.quiesceStatus(exec))
            return
          }
          return // 有任务在飞，settle 后会再次 pump
        }
        const slots = exec.settings.maxParallelNodes - exec.runningTasks
        if (slots <= 0) return // 并发已满，任务完成时再 pump
        const batch = ready.slice(0, slots)
        for (const node of batch) {
          await this.launchNode(exec, node)
          if (exec.finished) return // 内联节点可能已把运行推向终态
        }
      }
    } finally {
      exec.pumping = false
      if (exec.requeue && !exec.finished) {
        exec.requeue = false
        void this.pump(exec).catch(e =>
          console.error('[WorkflowEngine] requeue pump 异常', e)
        )
      }
    }
  }

  /** 静默终态：failed 优先于 cancelled（与失败中止语义一致），否则宽容 succeeded */
  private quiesceStatus(exec: RunExecution): WorkflowRunStatus {
    let cancelled = false
    for (const s of exec.states.values()) {
      if (s.status === 'failed') return 'failed'
      if (s.status === 'cancelled') cancelled = true
    }
    return cancelled ? 'cancelled' : 'succeeded'
  }

  /** computeReady 里识别可强制收敛的 merge 并登记（下一轮 pump 视为就绪） */
  private collectForcedMerges(exec: RunExecution): string[] {
    const forced: string[] = []
    for (const node of exec.input.graph.nodes) {
      if (node.type !== 'parallel-merge') continue
      const key = exec.nodeKey(node.id, 0)
      if (exec.states.has(key)) continue // 已执行/执行中
      const arrivals = exec.mergeArrivals.get(node.id)
      if (arrivals && arrivals.size > 0) {
        exec.forcedMergeNodeIds.add(node.id)
        forced.push(node.id)
      }
    }
    return forced
  }

  /**
   * 就绪集计算：
   * - start：未执行即就绪
   * - parallel-merge：waitPolicy=any 任一到达；all 等齐（或被强制收敛）
   * - 其余节点：任一入边激活即就绪（防条件分支未走分支侧死锁）
   */
  private computeReady(exec: RunExecution): WorkflowNode[] {
    const ready: WorkflowNode[] = []
    for (const node of exec.input.graph.nodes) {
      const key = exec.nodeKey(node.id, 0)
      const state = exec.states.get(key)
      if (state && state.status !== 'pending') continue // 已启动过
      if (node.type === 'start') {
        ready.push(node)
        continue
      }
      const incoming = exec.incomingOf(node.id)
      if (incoming.length === 0) continue // 不可达（校验器已警告；引擎跳过）
      const activated = incoming.filter(e => exec.activatedEdges.has(e.id))
      if (activated.length === 0) continue

      if (node.type === 'parallel-merge' && !exec.forcedMergeNodeIds.has(node.id)) {
        const waitAll = (node.config as { waitPolicy?: string }).waitPolicy !== 'any'
        if (waitAll && activated.length < incoming.length) continue // 等齐
      }
      ready.push(node)
    }
    return ready
  }

  // ==================== 节点启动与执行 ====================

  /** 启动一个节点：control 内联执行；task 进并发池（信号量由 runningTasks 计数） */
  private async launchNode(exec: RunExecution, node: WorkflowNode): Promise<void> {
    const handler = this.registry.getOrThrow(node.type)
    const nodeKey = exec.nodeKey(node.id, 0)
    const resolvedConfig = resolveConfigDeep(node.config, t => exec.resolver.resolve(t))

    const state: NodeExecutionState = {
      nodeKey,
      nodeId: node.id,
      iterationIndex: 0,
      status: 'running',
      retryCount: 0,
      startedAtMs: Date.now(),
    }
    exec.states.set(nodeKey, state)

    await this.deps.nodeRuns.startNode({
      runId: exec.input.runId,
      nodeId: node.id,
      nodeType: node.type,
      nodeName: node.name,
      iterationIndex: 0,
      input: resolvedConfig as Record<string, unknown>,
    })
    // 写库挂起期间运行可能已被中止（失败/超时）：不再发射该节点
    if (exec.finished || exec.abortController.signal.aborted) {
      await this.markCancelled(exec, node, state)
      return
    }
    this.emitNodeStatus(exec, state)

    if (handler.controlKind === 'control') {
      await this.runNode(exec, node, resolvedConfig, state)
    } else {
      exec.runningTasks++
      void runWithUserAsync(exec.input.userId, () =>
        this.runNode(exec, node, resolvedConfig, state)
      )
        .catch(async e => {
          // runNode 内部已兜底 handler 异常；这里防的是兜底代码自身的异常
          console.error(`[WorkflowEngine] 节点 ${node.id} 执行链异常`, e)
          await this.handleNodeFailure(exec, node, state, `节点执行链异常: ${errorMessage(e)}`).catch(
            fe => console.error('[WorkflowEngine] 异常兜底失败', fe)
          )
        })
        .finally(() => {
          exec.runningTasks--
          exec.maybeSettled()
          void this.pump(exec).catch(e =>
            console.error('[WorkflowEngine] settle 后 pump 异常', e)
          )
        })
    }
  }

  /** 单次执行一个节点（含 settle） */
  private async runNode(
    exec: RunExecution,
    node: WorkflowNode,
    resolvedConfig: unknown,
    state: NodeExecutionState
  ): Promise<void> {
    const handler = this.registry.getOrThrow(node.type)
    const ctx = this.buildContext(exec, node, state, resolvedConfig)
    let result: WorkflowNodeExecutionResult
    try {
      result = await handler.execute(ctx)
    } catch (e) {
      result = { status: 'failed', error: errorMessage(e) }
    }
    await this.settle(exec, node, state, result)
  }

  /** settle 入口：运行已终态/中止 → 统一取消标记（所有异常窗口的最后防线） */
  private async settle(
    exec: RunExecution,
    node: WorkflowNode,
    state: NodeExecutionState,
    result: WorkflowNodeExecutionResult
  ): Promise<void> {
    if (exec.finished || exec.abortController.signal.aborted) {
      await this.markCancelled(exec, node, state)
      return
    }
    switch (result.status) {
      case 'succeeded':
        await this.handleNodeSuccess(exec, node, state, result)
        break
      case 'waiting_review':
        // 片4 实现挂起；当前版本的注册表不会产出该结果，防御性处理
        await this.handleNodeFailure(
          exec,
          node,
          state,
          '引擎当前版本不支持挂起（waiting_review）'
        )
        break
      case 'failed':
        await this.handleNodeFailure(exec, node, state, result.error, result.retryable)
        break
    }
  }

  /** 节点取消标记（settle 各异常窗口共用） */
  private async markCancelled(
    exec: RunExecution,
    node: WorkflowNode,
    state: NodeExecutionState
  ): Promise<void> {
    state.status = 'cancelled'
    try {
      await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
        status: 'cancelled',
        finishedAt: new Date(),
        durationMs: Date.now() - state.startedAtMs,
      })
      this.emitNodeStatus(exec, state)
    } catch (e) {
      console.error(`[WorkflowEngine] 节点 ${node.id} 取消标记失败`, e)
    }
  }

  /** 成功 settle：截断输出 → checkpoint → 激活出边 */
  private async handleNodeSuccess(
    exec: RunExecution,
    node: WorkflowNode,
    state: NodeExecutionState,
    result: Extract<WorkflowNodeExecutionResult, { status: 'succeeded' }>
  ): Promise<void> {
    if (exec.finished || exec.abortController.signal.aborted) {
      await this.markCancelled(exec, node, state)
      return
    }
    // merge 节点输出由引擎按到达记录构造（handler 输出为空壳）
    let output = result.output
    if (node.type === 'parallel-merge') {
      output = this.buildMergeOutput(exec, node)
    }
    output = truncateOutput(output, exec.settings.maxOutputChars)

    state.status = 'succeeded'
    state.output = output
    state.routeTaken = result.route ?? null
    exec.variables.set(state.nodeKey, output)

    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: 'succeeded',
      output,
      routeTaken: state.routeTaken,
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)

    this.activateOutgoing(exec, node, result.route)
  }

  /** 失败 settle：重试 → fail 边恢复 → 否则中止运行 */
  private async handleNodeFailure(
    exec: RunExecution,
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
      // 重试等待期间运行可能已被中止：补取消标记（否则 node_run 悬死 running）
      if (exec.finished || exec.abortController.signal.aborted) {
        await this.markCancelled(exec, node, state)
        return
      }
      const resolvedConfig = resolveConfigDeep(node.config, t => exec.resolver.resolve(t))
      await this.runNode(exec, node, resolvedConfig, state)
      return
    }

    // 重试耗尽：有 fail 出边 → 恢复；无 → 运行失败
    const failEdges = exec.outgoingOf(node.id, 'fail')
    if (failEdges.length > 0) {
      state.status = 'failed_recovered'
      state.error = error
      state.output = { error, recovered: true }
      exec.variables.set(state.nodeKey, state.output)
      await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
        status: 'failed_recovered',
        error,
        output: state.output,
        finishedAt: new Date(),
        durationMs: Date.now() - state.startedAtMs,
      })
      this.emitNodeStatus(exec, state)
      for (const edge of failEdges) {
        this.activateEdge(exec, edge)
      }
      return
    }

    // 未恢复失败：取消其余节点 → 终止运行
    state.status = 'failed'
    state.error = error
    await this.deps.nodeRuns.patchNode(exec.input.runId, node.id, state.iterationIndex, {
      status: 'failed',
      error,
      finishedAt: new Date(),
      durationMs: Date.now() - state.startedAtMs,
    })
    this.emitNodeStatus(exec, state)
    exec.abortController.abort() // 在飞任务的 settle 会走取消分支
    await this.finalize(exec, 'failed', error)
  }

  // ==================== 边激活 ====================

  /** 成功后的出边激活：route 优先（条件/审核），否则全部 normal 出边 */
  private activateOutgoing(exec: RunExecution, node: WorkflowNode, route?: string): void {
    for (const edge of exec.outgoingOf(node.id)) {
      if (edge.kind === 'loop-back' || edge.kind === 'fail') continue
      if (route) {
        const matches =
          edge.kind === 'branch'
            ? route === encodeWorkflowHandleId('branch', edge.branchId)
            : route === encodeWorkflowHandleId(edge.kind)
        if (matches) this.activateEdge(exec, edge)
      } else if (edge.kind === 'normal') {
        this.activateEdge(exec, edge)
      }
    }
  }

  /** 激活一条边（记录 + merge 到达登记） */
  private activateEdge(exec: RunExecution, edge: WorkflowEdge): void {
    if (exec.activatedEdges.has(edge.id)) return
    exec.activatedEdges.add(edge.id)

    const target = exec.nodeById.get(edge.targetNodeId)
    if (target?.type === 'parallel-merge') {
      const sourceState = exec.states.get(exec.nodeKey(edge.sourceNodeId, 0))
      if (sourceState) {
        let arrivals = exec.mergeArrivals.get(target.id)
        if (!arrivals) {
          arrivals = new Map()
          exec.mergeArrivals.set(target.id, arrivals)
        }
        arrivals.set(edge.sourceNodeId, sourceState.output ?? {})
      }
    }
  }

  /** merge 输出构造：merge=按来源展开；first=首达（到达序） */
  private buildMergeOutput(exec: RunExecution, node: WorkflowNode): Record<string, unknown> {
    const arrivals = exec.mergeArrivals.get(node.id) ?? new Map()
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

  // ==================== 终态 ====================

  private buildStats(exec: RunExecution): RunExecutionStats {
    let done = 0
    let failed = 0
    let recovered = 0
    for (const s of exec.states.values()) {
      if (s.status === 'succeeded') done++
      else if (s.status === 'failed') failed++
      else if (s.status === 'failed_recovered') recovered++
    }
    return {
      totalNodes: exec.input.graph.nodes.length,
      doneNodes: done,
      failedNodes: failed,
      recoveredNodes: recovered,
    }
  }

  private async finalize(
    exec: RunExecution,
    status: WorkflowRunStatus,
    error?: string
  ): Promise<void> {
    if (exec.finished) return
    exec.finished = true
    exec.finalStatus = status
    const stats = this.buildStats(exec)
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

  // ==================== 上下文与工具 ====================

  private buildContext(
    exec: RunExecution,
    node: WorkflowNode,
    state: NodeExecutionState,
    resolvedConfig: unknown
  ): WorkflowNodeContext {
    return {
      runId: exec.input.runId,
      runKey: state.nodeKey,
      nodeId: node.id,
      nodeType: node.type,
      iterationIndex: state.iterationIndex,
      config: resolvedConfig as Record<string, unknown>,
      startInputs: exec.input.startInputs,
      signal: exec.abortController.signal,
      logger: {
        debug: (msg, extra) => console.debug(`[wf:${node.id}] ${msg}`, extra ?? ''),
        info: (msg, extra) => console.info(`[wf:${node.id}] ${msg}`, extra ?? ''),
        warn: (msg, extra) => console.warn(`[wf:${node.id}] ${msg}`, extra ?? ''),
        error: (msg, extra) => console.error(`[wf:${node.id}] ${msg}`, extra ?? ''),
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
      resolveTemplate: <T>(template: string) => exec.resolver.resolve(template) as T,
      getVariable: (path: string) => exec.resolver.resolve(`{{${path}}}`),
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

  /** 可中断 sleep（取消后立即醒） */
  private sleep(ms: number, exec: RunExecution): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        exec.abortController.signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      const onAbort = () => {
        clearTimeout(timer)
        resolve()
      }
      if (exec.abortController.signal.aborted) onAbort()
      else exec.abortController.signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}

/**
 * 节点输出统一截断（防失控）：保留全部字段键，各字段均分预算、超长截断。
 * 均分而非顺序贪吃——避免先处理的大字段把预算耗尽、后面的小字段被饿死。
 * 键数量过多导致均分下限失效时，整体降级为"只留键名预览"的有界对象。
 */
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
    // 键太多：任何均分都超限 → 只保留键名列表（有界）
    return {
      __truncated: true,
      keyCount: keys.length,
      keysPreview: keys.slice(0, 50),
    }
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

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
