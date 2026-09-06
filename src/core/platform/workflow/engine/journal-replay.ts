/**
 * Run Journal 重放投影（11 号 §5.3 E1：事件流 → RunExecution 调度态）
 * @module core/platform/workflow/engine/journal-replay
 *
 * 纯函数投影：boot 恢复、reviewDecide rehydrate、单测共用。
 * 语义（11 号 §3.2 不变量 3）：只重建调度状态，不重放副作用——
 * 在途节点（launched 未终态）由引擎在 rehydrate 后重新执行。
 *
 * 快照路径：最近 snapshot 作为基线（O(1)），其后事件增量重放；
 * 无快照：全量事件重放。投影结果必须与"边跑边写"的内存态同构
 * （journal-write.spec 的快照等价测试保证）。
 */

import type { JournalEventRecord } from './journal'
import type { ExecuteRunInput } from './workflow-engine.service'
import { RunExecution, ScopeState } from './workflow-engine.service'
import type { NodeExecutionState, LoopDriver } from './workflow-engine.service'
import { WORKFLOW_JOURNAL_EVENT_TYPES } from '@shared/types/workflow.types'

export interface RehydratedExecution {
  exec: RunExecution
  /** 重建后处于挂起（等 reviewDecide / ticker）——不重执行在途，等待决策续驱 */
  suspended: boolean
  /** 重放后的事件序号（引擎续写 journal 用） */
  nextEventSeq: number
  /** 在途节点（launched 未终态/未挂起）——rehydrate 后需重执行 */
  inflightNodes: Array<{ nodeId: string; scopeKey: string; iterationIndex: number }>
}

/** engineDriven 节点类型集（与 control-semantics 同源语义——重放模块不 import 引擎内部表防环） */
const ENGINE_DRIVEN_TYPES = new Set(['loop', 'start', 'end'])
function semEngineDriven(type: string): boolean {
  return ENGINE_DRIVEN_TYPES.has(type)
}

// ==================== 重放实现 ====================

class ReplayContext {
  readonly exec: RunExecution
  nextEventSeq = 0
  inflight: RehydratedExecution['inflightNodes'] = []
  /** loopNodeId → 列表长度（driver 装配用；列表本体从快照或伪变量恢复） */
  readonly loopListSize = new Map<string, number>()
  /** loopNodeId → 已收敛迭代结果（按事件序） */
  readonly loopResults = new Map<string, Array<{ result: unknown; skipped: boolean }>>()

  constructor(input: ExecuteRunInput) {
    // RunExecution 构造函数只做图装配与设置解析（无副作用）——重放直接复用
    this.exec = new RunExecution(input)
  }

  /** scopeKey → scope（按需建：root 预建，循环作用域首见时建——body 集合从 loopBodies） */
  scopeOf(scopeKey: string | null): ScopeState {
    if (!scopeKey || scopeKey === 'root') return this.exec.rootScope
    let scope = this.exec.loopScopes.get(scopeKey)
    if (!scope) {
      const loopNodeId = scopeKey.split(':')[0]
      const iterationIndex = Number(scopeKey.split(':')[1] ?? 0)
      const body = this.exec.loopBodies.get(loopNodeId)?.bodySet ?? new Set<string>()
      scope = new ScopeState(scopeKey, iterationIndex, body)
      scope.loopOwnerId = loopNodeId
      this.exec.loopScopes.set(scopeKey, scope)
    }
    return scope
  }

  stateOf(scope: ScopeState, nodeId: string): NodeExecutionState {
    let st = scope.states.get(nodeId)
    if (!st) {
      st = {
        nodeId,
        iterationIndex: scope.iterationIndex,
        status: 'running' as const,
        retryCount: 0,
        startedAtMs: Date.now(),
      }
      scope.states.set(nodeId, st)
    }
    return st
  }
}

/**
 * 重放主函数。events 须按 seq 升序；snapshot（若有）为其 seq 处的投影基线。
 */
export function replayJournal(
  input: ExecuteRunInput,
  events: JournalEventRecord[],
  snapshot?: JournalEventRecord | null,
): RehydratedExecution {
  const ctx = new ReplayContext(input)
  const exec = ctx.exec

  // ── 快照基线（其后同 seq 事件跳过——快照本身就是该 seq 的投影） ──
  let startSeq = 0
  if (snapshot && snapshot.type === WORKFLOW_JOURNAL_EVENT_TYPES.snapshot) {
    const payload = snapshot.payload as Record<string, unknown>
    applySnapshot(ctx, payload)
    // appliedThroughSeq：快照覆盖到的事件位（threshold 快照在触发事件落地前拍摄，
    // 显式携带 seq-2 语义；on-suspend 缺省 seq-1）。重放从其后再放，保证
    // 快照+增量 ≡ 全量（P0 修复——曾按 snapshot.seq+1 起放丢失触发事件效果）
    startSeq = typeof payload.appliedThroughSeq === 'number' ? payload.appliedThroughSeq + 1 : snapshot.seq + 1
    // 续写序号必须越过快照位（事件循环对 <startSeq 全部 continue，
    // 不更新 nextEventSeq——曾使续写从 0 起撞 (run_id, seq) 唯一约束）
    ctx.nextEventSeq = snapshot.seq + 1
  }

  for (const ev of events) {
    if (ev.seq < startSeq) continue
    if (ev.seq >= ctx.nextEventSeq) ctx.nextEventSeq = ev.seq + 1
    applyEvent(ctx, ev)
  }

  exec.nextEventSeq = ctx.nextEventSeq
  // 在途收集：非终态且非挂起的节点（重执行清单）
  const terminal = new Set(['succeeded', 'failed', 'failed_recovered', 'cancelled', 'timed_out'])
  const collect = (scope: ScopeState): void => {
    for (const st of scope.states.values()) {
      if (terminal.has(st.status)) continue
      if (st.status === 'waiting_review') continue // 挂起等待决策，不重执行
      // engineDriven（loop）节点不进在途清单：由重建 driver 在续驱中推进
      // （对抗 review P0：曾作为在途删除 → 恢复后循环被 root pump 整体重跑）
      const node = exec.nodeById.get(st.nodeId)
      if (node && semEngineDriven(node.type)) continue
      ctx.inflight.push({ nodeId: st.nodeId, scopeKey: scope.key, iterationIndex: st.iterationIndex })
    }
  }
  collect(exec.rootScope)
  for (const scope of exec.loopScopes.values()) collect(scope)

  // 挂起循环驱动器重建（loop_started 无 loop_completed：按收敛事件装配进度）
  for (const [loopNodeId, results] of ctx.loopResults) {
    if (exec.loopDrivers.has(loopNodeId)) continue // 快照已建
    const node = exec.nodeById.get(loopNodeId)
    if (!node) continue
    const parentScope = exec.rootScope // 循环节点必在根作用域（校验器禁嵌套）
    const state = ctx.stateOf(parentScope, loopNodeId)
    const listSize = ctx.loopListSize.get(loopNodeId) ?? results.length
    const recovered = pseudoVarList(ctx, loopNodeId)
    if (!recovered && !hasSnapshotDriver(ctx, loopNodeId)) {
      // 列表本体不可复原（无快照无伪变量）：fail-fast——undefined 项静默续跑会让
      // body 带垃圾输入执行副作用（对抗 review P0：曾静默 succeeded）
      throw new Error(
        `循环 ${loopNodeId} 的遍历列表不可复原（无快照且无迭代伪变量）——该 run 无法安全恢复，` +
          `已拒绝续驱。挂起场景有强制快照不受影响；请用 resumeRun 从 checkpoint 重建。`,
      )
    }
    const list = recovered ?? Array.from({ length: listSize })
    const driver: LoopDriver = {
      node,
      state,
      list,
      results: results.map((r) => r.result),
      parentScope,
    }
    exec.loopDrivers.set(loopNodeId, driver)
    state.status = 'running' as const // 循环节点在途（迭代间崩溃形态）
  }

  return {
    exec,
    suspended: exec.suspended,
    nextEventSeq: ctx.nextEventSeq,
    inflightNodes: ctx.inflight,
  }
}

// ==================== 事件应用 ====================

function applyEvent(ctx: ReplayContext, ev: JournalEventRecord): void {
  const exec = ctx.exec
  switch (ev.type) {
    case WORKFLOW_JOURNAL_EVENT_TYPES.edgeActivated: {
      const scope = ctx.scopeOf(ev.scopeKey ?? null)
      const p = ev.payload as { edgeId: string; seq: number; sourceNodeId: string; targetNodeId: string }
      // 最小 payload 校验（对抗 review P2：畸形 seq 字符串曾静默写入激活表 →
      // computeReady 恒 false → run 无声挂死到看门狗）。数字字段非数 = 日志损坏，
      // 显式抛错让 rehydrate 降级中断而非静默错
      if (typeof p?.seq !== 'number') {
        throw new Error(`journal 损坏：edge_activated seq 非数字（run ${ev.runId} seq=${ev.seq}）`)
      }
      // 与 activateEdge 同构：记序号 + merge 到达（源输出此刻已在前序 node_completed 中）
      scope.activationSeqs.set(p.edgeId, p.seq)
      if (p.seq > scope.activationCounter) scope.activationCounter = p.seq
      if (exec.nodeBelongsToScope(p.targetNodeId, scope)) {
        const sourceState = scope.states.get(p.sourceNodeId)
        if (sourceState) {
          let arrivals = scope.mergeArrivals.get(p.targetNodeId)
          if (!arrivals) {
            arrivals = new Map()
            scope.mergeArrivals.set(p.targetNodeId, arrivals)
          }
          arrivals.set(p.sourceNodeId, sourceState.output ?? {})
        }
      }
      return
    }
    case WORKFLOW_JOURNAL_EVENT_TYPES.nodeLaunched: {
      const scope = ctx.scopeOf(ev.scopeKey ?? null)
      const p = ev.payload as { iterationIndex: number }
      // 重置状态（重执行/重试的再 launch 覆盖旧态）
      scope.states.set(ev.nodeId!, {
        nodeId: ev.nodeId!,
        iterationIndex: p.iterationIndex,
        status: 'running' as const,
        retryCount: 0,
        startedAtMs: Date.now(),
      })
      exec.runCounts.set(ev.nodeId!, (exec.runCounts.get(ev.nodeId!) ?? 0) + 1)
      return
    }
    case WORKFLOW_JOURNAL_EVENT_TYPES.nodeSuspended: {
      const scope = ctx.scopeOf(ev.scopeKey ?? null)
      const st = ctx.stateOf(scope, ev.nodeId!)
      const p = ev.payload as {
        iterationIndex: number
        reviewPayload: Record<string, unknown> | null
        timeoutMs: number | null
        timeoutPolicy: 'approve' | 'reject' | 'fail'
      }
      st.status = 'waiting_review' as const
      st.reviewPayload = p.reviewPayload ?? undefined
      st.reviewTimeoutMs = p.timeoutMs
      st.reviewTimeoutPolicy = p.timeoutPolicy
      // 绝对死线优先（重放时刻重锚会推迟整个超时窗——P1 修复）；旧事件缺字段时回退推算
      const absolute = (p as { waitExpiresAt?: number | null }).waitExpiresAt
      st.waitExpiresAt = absolute != null
        ? new Date(absolute)
        : p.timeoutMs != null
          ? new Date(Date.now() + p.timeoutMs)
          : null
      exec.suspended = true
      return
    }
    case WORKFLOW_JOURNAL_EVENT_TYPES.reviewDecided:
      return // 决策载荷不改变调度态（紧随的 node_completed 承载状态推进）
    case WORKFLOW_JOURNAL_EVENT_TYPES.nodeCompleted: {
      const scope = ctx.scopeOf(ev.scopeKey ?? null)
      const st = ctx.stateOf(scope, ev.nodeId!)
      const p = ev.payload as {
        iterationIndex: number
        output: Record<string, unknown> | null
        routeTaken: string | null
        completedSeq: number
      }
      st.status = 'succeeded' as const
      st.output = p.output ?? undefined
      st.routeTaken = p.routeTaken ?? null
      st.completedSeq = p.completedSeq
      if (p.completedSeq > scope.activationCounter) scope.activationCounter = p.completedSeq
      exec.variables.set(ev.nodeId!, p.output ?? {})
      return
    }
    case WORKFLOW_JOURNAL_EVENT_TYPES.nodeFailed: {
      const scope = ctx.scopeOf(ev.scopeKey ?? null)
      const st = ctx.stateOf(scope, ev.nodeId!)
      const p = ev.payload as {
        iterationIndex: number
        error: string
        retryCount: number
        disposition: 'retry_scheduled' | 'fail_edge' | 'iteration_skipped' | 'fatal'
      }
      switch (p.disposition) {
        case 'retry_scheduled':
          st.retryCount = p.retryCount
          st.status = 'running' as const // 重试中（在途）——后续 launch/complete 事件覆盖
          break
        case 'fail_edge': {
          st.status = 'failed_recovered' as const
          st.error = p.error
          st.output = { error: p.error, recovered: true }
          st.completedSeq = scope.activationCounter + 1
          exec.variables.set(ev.nodeId!, st.output)
          break
        }
        case 'iteration_skipped':
          st.status = 'failed' as const
          st.error = p.error
          st.completedSeq = scope.activationCounter + 1
          scope.failed = true
          scope.iterationSkippedByPolicy = true
          break
        case 'fatal':
          st.status = 'failed' as const
          st.error = p.error
          st.completedSeq = scope.activationCounter + 1
          scope.failed = true
          break
      }
      return
    }
    case WORKFLOW_JOURNAL_EVENT_TYPES.loopStarted: {
      const p = ev.payload as { parentScopeKey: string; listSize: number }
      ctx.loopListSize.set(ev.nodeId!, p.listSize)
      return
    }
    case WORKFLOW_JOURNAL_EVENT_TYPES.loopIterationSettled: {
      const p = ev.payload as { iterationIndex: number; result: unknown; skipped: boolean }
      const arr = ctx.loopResults.get(ev.nodeId!) ?? []
      arr.push({ result: p.result, skipped: p.skipped })
      ctx.loopResults.set(ev.nodeId!, arr)
      return
    }
    case WORKFLOW_JOURNAL_EVENT_TYPES.loopCompleted: {
      const scope = ctx.scopeOf(ev.scopeKey ?? null)
      const st = ctx.stateOf(scope, ev.nodeId!)
      const p = ev.payload as { output: Record<string, unknown>; routeTaken: string }
      st.status = 'succeeded' as const
      st.output = p.output
      st.routeTaken = p.routeTaken
      st.completedSeq = scope.activationCounter + 1
      exec.variables.set(ev.nodeId!, p.output)
      exec.loopDrivers.delete(ev.nodeId!)
      return
    }
    case WORKFLOW_JOURNAL_EVENT_TYPES.runFinished: {
      // 终态锚点：重放终止（后续事件不应存在）
      exec.finished = true
      const p = ev.payload as { status: string }
      exec.finalStatus = p.status as never
      return
    }
    case WORKFLOW_JOURNAL_EVENT_TYPES.runStarted:
    case WORKFLOW_JOURNAL_EVENT_TYPES.snapshot:
      return
    default:
      return // 未知类型忽略（§0-3 演化纪律：新增事件不破坏旧重放器）
  }
}

// ==================== 快照应用 ====================

function applySnapshot(ctx: ReplayContext, payload: Record<string, unknown>): void {
  const exec = ctx.exec
  if (payload.v !== 1) return // 版本不识别：忽略快照走全量重放（宁慢勿错）
  exec.suspended = payload.suspended === true

  const variables = payload.variables as Record<string, Record<string, unknown>> | undefined
  if (variables) for (const [k, v] of Object.entries(variables)) exec.variables.set(k, v)

  const llm = payload.llmHistory as typeof exec.llmHistory | undefined
  if (Array.isArray(llm)) exec.llmHistory.push(...llm)

  const runCounts = payload.runCounts as Record<string, number> | undefined
  if (runCounts) for (const [k, v] of Object.entries(runCounts)) exec.runCounts.set(k, v)

  const scopes = payload.scopes as Array<Record<string, unknown>> | undefined
  if (scopes) {
    for (const raw of scopes) {
      const scope = ctx.scopeOf(String(raw.key))
      scope.activationCounter = Number(raw.activationCounter ?? 0)
      const seqs = raw.activationSeqs as Record<string, number> | undefined
      if (seqs) for (const [edgeId, seq] of Object.entries(seqs)) scope.activationSeqs.set(edgeId, seq)
      for (const st of (raw.states as Array<Record<string, unknown>>) ?? []) {
        scope.states.set(String(st.nodeId), {
          nodeId: String(st.nodeId),
          iterationIndex: Number(st.iterationIndex ?? 0),
          status: st.status as never,
          retryCount: Number(st.retryCount ?? 0),
          error: (st.error as string | undefined) ?? undefined,
          output: (st.output as Record<string, unknown> | undefined) ?? undefined,
          routeTaken: (st.routeTaken as string | null) ?? null,
          reviewPayload: (st.reviewPayload as Record<string, unknown> | undefined) ?? undefined,
          reviewTimeoutMs: (st.reviewTimeoutMs as number | null) ?? null,
          reviewTimeoutPolicy: (st.reviewTimeoutPolicy as 'approve' | 'reject' | 'fail' | undefined) ?? undefined,
          waitExpiresAt: st.waitExpiresAt ? new Date(Number(st.waitExpiresAt)) : null,
          completedSeq: (st.completedSeq as number | null) ?? undefined,
          startedAtMs: Number(st.startedAtMs ?? Date.now()),
        })
      }
      const merges = raw.mergeArrivals as Record<string, Record<string, Record<string, unknown>>> | undefined
      if (merges) {
        for (const [nodeId, bySource] of Object.entries(merges)) {
          const m = new Map<string, Record<string, unknown>>()
          for (const [src, out] of Object.entries(bySource)) m.set(src, out)
          scope.mergeArrivals.set(nodeId, m)
        }
      }
      for (const id of (raw.forcedMergeNodeIds as string[]) ?? []) scope.forcedMergeNodeIds.add(id)
      scope.loopOwnerId = (raw.loopOwnerId as string | null) ?? null
      scope.iterationSkippedByPolicy = raw.iterationSkippedByPolicy === true
      const pseudo = raw.loopPseudoVars as Record<string, Record<string, unknown>> | undefined
      if (pseudo) for (const [k, v] of Object.entries(pseudo)) scope.loopPseudoVars.set(k, v)
    }
  }

  const drivers = payload.loopDrivers as Array<Record<string, unknown>> | undefined
  if (drivers) {
    for (const raw of drivers) {
      const node = exec.nodeById.get(String(raw.loopNodeId))
      if (!node) continue
      const parentScope = ctx.scopeOf(String(raw.parentScopeKey))
      const state = ctx.stateOf(parentScope, node.id)
      const list = (raw.list as unknown[] | undefined) ?? Array.from({ length: Number(raw.listSize ?? 0) })
      exec.loopDrivers.set(node.id, {
        node,
        state,
        list,
        results: (raw.results as unknown[]) ?? [],
        parentScope,
      })
    }
  }

  for (const id of (payload.reexecNodeIds as string[]) ?? []) exec.reexecNodeIds.add(id)
}

/** 快照路径下该 loop 是否已有携带真实列表的 driver */
function hasSnapshotDriver(ctx: ReplayContext, loopNodeId: string): boolean {
  const d = ctx.exec.loopDrivers.get(loopNodeId)
  return !!d && d.list.length > 0 && d.list.some((x) => x !== undefined)
}

// ==================== 内部工具 ====================

/** 循环伪变量中恢复列表本体（快照带 list 时优先生效；此处兜底旧快照） */
function pseudoVarList(ctx: ReplayContext, loopNodeId: string): unknown[] | null {
  for (const scope of ctx.exec.loopScopes.values()) {
    const pv = scope.loopPseudoVars.get(loopNodeId)
    if (pv && Array.isArray(pv.list)) return pv.list
  }
  return null
}

// 到达记录无条件写入（与 activateEdge 的 mergeOutput 条件判定相比为超集：
// 仅丰富 buildMergeOutput 的可选输入，非 merge 节点的到达记录不被消费——
// 重放模块不 import 引擎内部语义表，保持投影与调度语义解耦）
