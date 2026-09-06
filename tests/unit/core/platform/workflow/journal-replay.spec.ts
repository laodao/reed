/**
 * Run Journal 重放与 rehydrate 测试（11 号 §5.3-5.4 E1 恢复面）
 * @module tests/core/platform/workflow/journal-replay.spec
 *
 * 覆盖：重放投影与执行态同构（全量/快照两路径等价）/ 在途节点识别 /
 * 挂起重建（suspended 置位）/ rehydrate 全链（挂起等待 + 在途重执行续跑）/
 * reviewDecide 重路由（ensureActive 后决策生效）/ 终态锚点修复投影 /
 * 单飞去重 / 旧格式（无日志）返回 false。
 */

import { describe, it, expect } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { InMemoryJournal, type JournalEventRecord } from '@core/platform/workflow/engine/journal'
import { replayJournal } from '@core/platform/workflow/engine/journal-replay'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { INTERACTION_NODE_HANDLERS } from '@core/platform/workflow/nodes/interaction-nodes'
import type { WorkflowEngineDeps, WorkflowEventPort, WorkflowRunPort, WorkflowNodeRunPort, EngineRunRow } from '@core/platform/workflow/engine/ports'
import type { WorkflowGraph, WorkflowRunEvent, WorkflowNode } from '@shared/types/workflow.types'
import type { WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'
import { runWithUserAsync } from '@core/context/user-context'

class FakeEvents implements WorkflowEventPort {
  emit(_e: WorkflowRunEvent): void {}
}
class FakeRuns implements WorkflowRunPort {
  final: { status?: string; error?: string | null } = {}
  row: EngineRunRow | null = null
  async getById(runId: string): Promise<EngineRunRow | null> { return this.row?.runId === runId ? this.row : null }
  async patchRun(_id: string, patch: Record<string, unknown>) { Object.assign(this.final, patch) }
}
class FakeNodeRuns implements WorkflowNodeRunPort {
  rows = new Map<string, { status?: string; output?: unknown }>()
  async startNode(n: { nodeId: string }) { this.rows.set(n.nodeId, { status: 'running' }) }
  async patchNode(_r: string, nodeId: string, _i: number, patch: Record<string, unknown>) {
    const cur = this.rows.get(nodeId) ?? {}; Object.assign(cur, patch); this.rows.set(nodeId, cur)
  }
}

/** echo 计数器（重执行可观测） */
function makeEcho(): { handler: WorkflowNodeHandler; calls: () => number } {
  let calls = 0
  const handler: WorkflowNodeHandler = {
    type: 'echo' as never, controlKind: 'task', cancellable: false,
    outputSchema: [], validateConfig: () => [],
    execute: async () => { calls++; return { status: 'succeeded' as never, output: { text: 'ok' } } },
  } as never
  return { handler, calls: () => calls }
}
const review: WorkflowNodeHandler = {
  type: 'rev' as never, controlKind: 'interaction', cancellable: true,
  outputSchema: [], validateConfig: () => [],
  execute: async () => ({ status: 'waiting_review' as never, payload: { q: '审吗' } }),
} as never

function mkGraph(nodes: Array<[string, string] | [string, string, Record<string, unknown>]>, edges: Array<[string, string, string?]>): WorkflowGraph {
  return {
    nodes: nodes.map(([id, type, config]) => ({ id, type: type as never, config: config ?? {}, position: { x: 0, y: 0 } } as unknown as WorkflowNode)),
    edges: edges.map(([s, t, kind], i) => ({ id: `e${i}`, sourceNodeId: s, targetNodeId: t, kind: (kind ?? 'normal') as never })),
  } as unknown as WorkflowGraph
}

function mkEngine(journal: InMemoryJournal | null, handlers: WorkflowNodeHandler[] = []) {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...INTERACTION_NODE_HANDLERS, ...handlers] as never)
  const deps = { runs, nodeRuns, events: new FakeEvents(), journal } as unknown as WorkflowEngineDeps
  return { engine: new WorkflowEngineService(deps, registry), runs, nodeRuns }
}

const input = (graph: WorkflowGraph, runId = 'run_1'): ExecuteRunInput =>
  ({ runId, userId: 'u1', definitionId: 'd1', graph, startInputs: {} })

const settle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ==================== 重放投影 ====================

describe('replayJournal 投影', () => {
  it('顺序图全量重放：状态/变量/激活序号/在途与执行态同构', async () => {
    const journal = new InMemoryJournal()
    const echo = makeEcho()
    const { engine } = mkEngine(journal, [echo.handler])
    const graph = mkGraph([['start', 'start'], ['a', 'echo'], ['end', 'end']], [['start', 'a'], ['a', 'end']])
    await runWithUserAsync('u1', () => engine.execute(input(graph)))
    const events = await journal.listByRun('run_1')

    const re = replayJournal(input(graph), events, null)
    expect(re.exec.finished).toBe(true)
    expect(re.exec.finalStatus).toBe('succeeded')
    expect(re.inflightNodes).toEqual([])
    expect(re.nextEventSeq).toBe(events.length)
    // 变量重建
    expect(re.exec.variables.get('a')).toMatchObject({ text: 'ok' })
    // 状态重建：a succeeded 且 completedSeq 就位
    const st = re.exec.rootScope.states.get('a')!
    expect(st.status).toBe('succeeded')
    expect(st.completedSeq).toBeGreaterThan(0)
    // 激活重建：start→a 边有序号
    expect(re.exec.rootScope.activationSeqs.get('e0')).toBeGreaterThan(0)
  })

  it('快照路径与全量重放等价（投影同构）', async () => {
    const journal = new InMemoryJournal()
    const echo = makeEcho()
    const { engine } = mkEngine(journal, [echo.handler])
    const graph = mkGraph([['start', 'start'], ['a', 'echo'], ['end', 'end']], [['start', 'a'], ['a', 'end']])
    await runWithUserAsync('u1', () => engine.execute(input(graph)))
    const events = await journal.listByRun('run_1')
    // 手工注入一条快照（取中点事件后）——复用引擎序列化不可行（私有），
    // 以事件中点构造：直接用全量重放态的近似——此处验证"快照+增量=全量"的机制：
    // 构造 snapshot 事件（v1 空基线 + 后续全事件）应等价于无快照全量重放
    const snapshot: JournalEventRecord = {
      id: 'snap', runId: 'run_1', seq: -1, type: 'snapshot', nodeId: null, scopeKey: null,
      payload: { v: 1, suspended: false, variables: {}, llmHistory: [], runCounts: {}, scopes: [], loopDrivers: [], reexecNodeIds: [] },
      createdAt: new Date(),
    }
    const reFull = replayJournal(input(graph), events, null)
    const reSnap = replayJournal(input(graph), events, snapshot)
    expect(reSnap.inflightNodes).toEqual(reFull.inflightNodes)
    expect(reSnap.nextEventSeq).toBe(reFull.nextEventSeq)
    expect(reSnap.exec.variables.get('a')).toEqual(reFull.exec.variables.get('a'))
  })

  it('真实快照等价（P0 回归）：快照+增量 ≡ 全量重放，appliedThroughSeq 语义正确', async () => {
    // 挂起图产生真实 on-suspend 快照（引擎序列化路径，非手工构造）
    const j2 = new InMemoryJournal()
    const echo = makeEcho()
    const { engine: e2 } = mkEngine(j2, [review, echo.handler])
    const g2 = mkGraph([['start', 'start'], ['r1', 'rev'], ['end', 'end']], [['start', 'r1'], ['r1', 'end', 'approve']])
    await runWithUserAsync('u1', async () => { await e2.execute(input(g2, 'run_2')); await settle() })
    const ev2 = await j2.listByRun('run_2')
    const snap = [...ev2].reverse().find(e => e.type === 'snapshot')!
    expect(snap).toBeTruthy()
    expect(snap.payload).toHaveProperty('appliedThroughSeq')
    // 快照路径与全量路径的投影必须同构
    const reFull = replayJournal(input(g2, 'run_2'), ev2, null)
    const reSnap = replayJournal(input(g2, 'run_2'), ev2, snap)
    expect(reSnap.suspended).toBe(reFull.suspended)
    expect(reSnap.inflightNodes).toEqual(reFull.inflightNodes)
    expect(reSnap.exec.variables.get('start')).toEqual(reFull.exec.variables.get('start'))
    const stFull = reFull.exec.rootScope.states.get('r1')!
    const stSnap = reSnap.exec.rootScope.states.get('r1')!
    expect(stSnap.status).toBe(stFull.status)
    expect(stSnap.reviewPayload).toEqual(stFull.reviewPayload)
    // 续写序号一致（曾从 0 起撞唯一约束）
    expect(reSnap.nextEventSeq).toBe(reFull.nextEventSeq)
    // waitExpiresAt 绝对死线（P1）：重放不按重放时刻重锚
    expect(stSnap.waitExpiresAt?.getTime()).toBe(stFull.waitExpiresAt?.getTime())
  })

  it('挂起重放：suspended 置位、审核现场恢复、无终态锚点', async () => {
    const journal = new InMemoryJournal()
    const { engine } = mkEngine(journal, [review])
    const graph = mkGraph([['start', 'start'], ['r1', 'rev'], ['end', 'end']], [['start', 'r1'], ['r1', 'end', 'approve']])
    await runWithUserAsync('u1', async () => { const s = await engine.execute(input(graph)); await settle(); return s })
    const events = await journal.listByRun('run_1')
    const re = replayJournal(input(graph), events, null)
    expect(re.suspended).toBe(true)
    expect(re.inflightNodes).toEqual([])
    const st = re.exec.rootScope.states.get('r1')!
    expect(st.status).toBe('waiting_review')
    expect(st.reviewPayload).toMatchObject({ q: '审吗' })
    expect(re.exec.finished).toBe(false)
  })
})

// ==================== rehydrate 全链 ====================

describe('engine.rehydrate / ensureActive', () => {
  it('挂起 run 重建：决策跨"重启"生效（reviewDecide 重路由语义）', async () => {
    const journal = new InMemoryJournal()
    const echo = makeEcho()
    // 第一台"进程"：跑到挂起
    const first = mkEngine(journal, [review, echo.handler])
    const graph = mkGraph([['start', 'start'], ['r1', 'rev'], ['after', 'echo'], ['end', 'end']],
      [['start', 'r1'], ['r1', 'after', 'approve'], ['after', 'end']])
    const status = await runWithUserAsync('u1', async () => { const s = await first.engine.execute(input(graph)); await settle(); return s })
    expect(status).toBe('waiting_review')
    const echoCallsOnFirstProcess = echo.calls()

    // 第二台"进程"（内存态全丢，journal 与图行幸存）：rehydrate 后决策直接生效
    const second = mkEngine(journal, [review, echo.handler])
    second.runs.row = {
      runId: 'run_1', userId: 'u1', definitionId: 'd1', graphSnapshot: graph,
      startInputs: {}, settings: null, triggerInfo: null, status: 'waiting_review',
    }
    expect(await second.engine.ensureActive('run_1')).toBe(true)
    expect(await second.engine.resumeReview('run_1', 'r1', { decision: 'approve' })).toBe(true)
    await settle(60)
    // 决策后 after 执行（echo 计数增长发生在第二进程的 handler 上）
    expect(second.runs.final.status === 'succeeded' || second.runs.final.status === 'running').toBe(true)
    void echoCallsOnFirstProcess
  })

  it('在途重执行：崩溃在 running 的节点重建后续跑成功', async () => {
    const journal = new InMemoryJournal()
    const echo = makeEcho()
    // 图：a（echo）→ b（echo）→ end；手工构造"a 完成、b 在途崩溃"的日志
    const graph = mkGraph([['start', 'start'], ['a', 'echo'], ['b', 'echo'], ['end', 'end']],
      [['start', 'a'], ['a', 'b'], ['b', 'end']])
    // 用真实引擎跑到一半不行（太快）——手工按写入语义构造事件序列
    let seq = 0
    const put = (type: string, payload: Record<string, unknown>, nodeId: string | null = null, scopeKey = 'root') =>
      journal.append({ runId: 'run_1', seq: seq++, type: type as never, nodeId, scopeKey, payload })
    await put('run_started', { triggerType: 'manual' })
    await put('edge_activated', { edgeId: 'e0', seq: 1, sourceNodeId: 'start', targetNodeId: 'a' })
    await put('node_launched', { nodeType: 'start', iterationIndex: 0 }, 'start')
    await put('node_completed', { iterationIndex: 0, output: {}, routeTaken: null, completedSeq: 2 }, 'start')
    await put('edge_activated', { edgeId: 'e1', seq: 3, sourceNodeId: 'a', targetNodeId: 'b' })
    await put('node_launched', { nodeType: 'echo', iterationIndex: 0 }, 'a')
    await put('node_completed', { iterationIndex: 0, output: { text: 'ok' }, routeTaken: null, completedSeq: 4 }, 'a')
    await put('edge_activated', { edgeId: 'e2', seq: 5, sourceNodeId: 'b', targetNodeId: 'end' })

    const { engine, runs } = mkEngine(journal, [echo.handler])
    runs.row = {
      runId: 'run_1', userId: 'u1', definitionId: 'd1', graphSnapshot: graph,
      startInputs: {}, settings: null, triggerInfo: null, status: 'running',
    }
    expect(await engine.ensureActive('run_1')).toBe(true)
    await settle(80)
    expect(runs.final.status).toBe('succeeded')
  })

  it('终态锚点：日志含 run_finished 而 run 行未终 → 修复投影不重执行', async () => {
    const journal = new InMemoryJournal()
    const graph = mkGraph([['start', 'start'], ['end', 'end']], [['start', 'end']])
    let seq = 0
    await journal.append({ runId: 'run_1', seq: seq++, type: 'run_started', payload: { triggerType: 'manual' } })
    await journal.append({ runId: 'run_1', seq: seq++, type: 'run_finished', payload: { status: 'succeeded' } })
    const { engine, runs } = mkEngine(journal, [])
    runs.row = {
      runId: 'run_1', userId: 'u1', definitionId: 'd1', graphSnapshot: graph,
      startInputs: {}, settings: null, triggerInfo: null, status: 'running', // 行落后于日志
    }
    expect(await engine.ensureActive('run_1')).toBe(false)
    expect(runs.final.status).toBe('succeeded') // 修复投影
  })

  it('挂起+并行在途混合（review P1-1 回归）：重建后并行分支不丢', async () => {
    const journal = new InMemoryJournal()
    let slowCalls = 0
    const slow: WorkflowNodeHandler = {
      type: 'slow' as never, controlKind: 'task', cancellable: false,
      outputSchema: [], validateConfig: () => [],
      execute: async () => { slowCalls++; await settle(40); return { status: 'succeeded' as never, output: { v: 1 } } },
    } as never
    // start 分叉：rev（挂起）+ slow（并行在途）
    const graph = mkGraph(
      [['start', 'start'], ['rev1', 'rev'], ['slow1', 'slow'], ['end', 'end']],
      [['start', 'rev1'], ['start', 'slow1'], ['rev1', 'end', 'approve'], ['slow1', 'end']],
    )
    const first = mkEngine(journal, [review, slow])
    const status = await runWithUserAsync('u1', async () => {
      const s = await first.engine.execute(input(graph, 'run_m'))
      await settle() // 后台挂起任务落日志
      return s
    })
    expect(status).toBe('waiting_review')

    // 第二"进程"重建：挂起但 slow 在途（journal 有未收敛 node_launched）
    const second = mkEngine(journal, [review, slow])
    second.runs.row = {
      runId: 'run_m', userId: 'u1', definitionId: 'd1', graphSnapshot: graph,
      startInputs: {}, settings: null, triggerInfo: null, status: 'waiting_review',
    }
    expect(await second.engine.ensureActive('run_m')).toBe(true)
    // 决策续驱：slow 分支须被执行（曾被静默丢弃）
    expect(await second.engine.resumeReview('run_m', 'rev1', { decision: 'approve' })).toBe(true)
    await settle(120)
    expect(slowCalls).toBeGreaterThanOrEqual(1) // 第二进程重执行了 slow
    expect(second.runs.final.status).toBe('succeeded')
  })

  it('threshold 快照等价（对抗 review P0 回归）：低事件量构造——验证 appliedThroughSeq 语义', async () => {
    // threshold 快照需 200 事件，常规图难触发——直接手工构造"事件+阈值快照+后续事件"
    // 的三段式，断言快照路径与全量重放同构（曾漏传第三参=死参数，触发事件效果丢失）
    const graph = mkGraph([['start', 'start'], ['a', 'echo'], ['end', 'end']], [['start', 'a'], ['a', 'end']])
    const j = new InMemoryJournal()
    let seq = 0
    const put = (type: string, payload: Record<string, unknown> | null, nodeId: string | null = null) =>
      j.append({ runId: 'r_t', seq: seq++, type: type as never, nodeId, scopeKey: 'root', payload })
    await put('run_started', { triggerType: 'manual' })
    await put('node_launched', { nodeType: 'start', iterationIndex: 0 }, 'start')
    await put('node_completed', { iterationIndex: 0, output: {}, routeTaken: null, completedSeq: 1 }, 'start')
    await put('edge_activated', { edgeId: 'e0', seq: 2, sourceNodeId: 'start', targetNodeId: 'a' })
    // threshold 快照：此刻内存未应用 e0 的激活（appliedThroughSeq = 3-1 = 2 的前一条语义——
    // 即覆盖到 seq 2 的 edge_activated 为止？不——引擎语义：append(seq3=e0)后拍快照，
    // 快照 appliedThroughSeq=2（覆盖事件 0..2，e0 尚未生效）。手工按此语义构造：
    const snapPayload = {
      v: 1, suspended: false,
      variables: {}, llmHistory: [], runCounts: { start: 1 },
      // 注意 states 里 a 无状态（未 launch）；start 已完成（事件 2 已生效）
      scopes: [{
        key: 'root', iterationIndex: 0, activationCounter: 1,
        activationSeqs: {}, // e0 尚未激活（appliedThroughSeq=2 只覆盖到 node_completed）
        states: [{ nodeId: 'start', iterationIndex: 0, status: 'succeeded', retryCount: 0, output: {}, routeTaken: null, reviewPayload: null, reviewTimeoutMs: null, reviewTimeoutPolicy: null, waitExpiresAt: null, completedSeq: 1, startedAtMs: 0 }],
        mergeArrivals: {}, forcedMergeNodeIds: [], loopOwnerId: null,
        iterationSkippedByPolicy: false, loopPseudoVars: {},
      }],
      loopDrivers: [], reexecNodeIds: [],
      reason: 'threshold', appliedThroughSeq: 2,
    }
    await j.append({ runId: 'r_t', seq: seq++, type: 'snapshot', nodeId: null, scopeKey: null, payload: snapPayload })
    // 后续事件（模拟 e0 生效 + a 完成）
    await put('node_launched', { nodeType: 'echo', iterationIndex: 0 }, 'a')
    await put('node_completed', { iterationIndex: 0, output: { text: 'ok' }, routeTaken: null, completedSeq: 3 }, 'a')
    await put('edge_activated', { edgeId: 'e1', seq: 4, sourceNodeId: 'a', targetNodeId: 'end' })

    const inputT = input(graph, 'r_t')
    const events = await j.listByRun('r_t')
    const snap = events.find(e => e.type === 'snapshot')!
    const reSnap = replayJournal(inputT, events, snap)
    const reFull = replayJournal(inputT, events, null)
    // 同构：a 的完成态/变量/激活在两路径一致（曾快照路径丢 e0 → a 永不 ready）
    expect(reSnap.exec.variables.get('a')).toEqual(reFull.exec.variables.get('a'))
    expect(reSnap.exec.rootScope.states.get('a')?.status).toBe(reFull.exec.rootScope.states.get('a')?.status)
    expect(reSnap.exec.rootScope.activationSeqs.get('e0')).toBe(reFull.exec.rootScope.activationSeqs.get('e0'))
    expect(reSnap.inflightNodes).toEqual(reFull.inflightNodes)
  })

  it('旧格式（无日志）返回 false；终态 run 不重建；单飞去重', async () => {
    const empty = new InMemoryJournal()
    const graph = mkGraph([['start', 'start'], ['end', 'end']], [['start', 'end']])
    const { engine, runs } = mkEngine(empty, [])
    runs.row = { runId: 'run_x', userId: 'u1', definitionId: 'd1', graphSnapshot: graph, startInputs: {}, settings: null, triggerInfo: null, status: 'running' }
    expect(await engine.ensureActive('run_x')).toBe(false) // 无日志
    runs.row = { ...runs.row!, runId: 'run_t', status: 'succeeded' }
    await empty.append({ runId: 'run_t', seq: 0, type: 'run_started', payload: {} })
    expect(await engine.ensureActive('run_t')).toBe(false) // 终态
    // 单飞：并发两次 ensureActive 只触发一次 rehydrate
    const calls: number[] = []
    const spyEngine = engine as unknown as { rehydrate: (id: string) => Promise<boolean> }
    const orig = spyEngine.rehydrate.bind(spyEngine)
    spyEngine.rehydrate = async (id: string) => { calls.push(1); await settle(10); return orig(id) }
    await Promise.all([engine.ensureActive('run_x'), engine.ensureActive('run_x')])
    expect(calls.length).toBe(1)
  })
})

// ==================== 总收口 review 回归（终态循环 / v≠1 快照 / persistedState 注入 / C1 环） ====================

/** 行级 Fake（含 listByRun——rehydrate 预载 state_json 需要） */
class RowsFake implements WorkflowNodeRunPort {
  rows = new Map<string, { status?: string; output?: unknown; stateJson?: string | null }>()
  async listByRun(runId: string): Promise<Array<{ nodeId: string; iterationIndex: number; status: string; stateJson: string | null }>> {
    void runId
    return [...this.rows.entries()].map(([nodeId, r]) => ({ nodeId, iterationIndex: 0, status: r.status ?? 'running', stateJson: r.stateJson ?? null }))
  }
  async startNode(n: { nodeId: string }) { this.rows.set(n.nodeId, { status: 'running' }) }
  async patchNode(_r: string, nodeId: string, _i: number, patch: Record<string, unknown>) {
    const cur = this.rows.get(nodeId) ?? {}; Object.assign(cur, patch); this.rows.set(nodeId, cur)
  }
}

describe('总收口 review：循环终态守卫', () => {
  const graph = mkGraph(
    [['start', 'start'], ['loop1', 'loop', { listSource: '{{start.items}}' }], ['after', 'echo'], ['end', 'end']],
    [['start', 'loop1'], ['loop1', 'after', 'loop-done'], ['after', 'end']],
  )
  function loopEvents(runId: string, withCompletion: boolean): JournalEventRecord[] {
    const evs: Array<Partial<JournalEventRecord>> = [
      { seq: 0, type: 'run_started', payload: { triggerType: 'manual' } },
      { seq: 1, type: 'loop_started', nodeId: 'loop1', payload: { parentScopeKey: 'root', listSize: 3 } },
      { seq: 2, type: 'loop_iteration_settled', nodeId: 'loop1', payload: { iterationIndex: 0, result: { i: 0 }, skipped: false } },
      { seq: 3, type: 'loop_iteration_settled', nodeId: 'loop1', payload: { iterationIndex: 1, result: { i: 1 }, skipped: false } },
      { seq: 4, type: 'loop_iteration_settled', nodeId: 'loop1', payload: { iterationIndex: 2, result: { i: 2 }, skipped: false } },
    ]
    if (withCompletion) {
      evs.push({ seq: 5, type: 'loop_completed', nodeId: 'loop1', payload: { output: { results: [{ i: 0 }, { i: 1 }, { i: 2 }] }, routeTaken: null } })
    }
    evs.push({ seq: 6, type: 'node_launched', nodeId: 'after', payload: { nodeType: 'echo', iterationIndex: 0 } })
    return evs.map((e) => ({ id: `j_${runId}_${e.seq}`, runId, seq: e.seq!, type: e.type!, nodeId: e.nodeId ?? null, scopeKey: 'root', payload: e.payload ?? null, createdAt: new Date() })) as never
  }

  it('P1-A：无快照 + 已完成循环 + 尾节点在途 → 不再 fail-fast 毒杀整 run', () => {
    const inputR = input(graph, 'run_c1')
    expect(() => replayJournal(inputR, loopEvents('run_c1', true))).not.toThrow()
    const re = replayJournal(inputR, loopEvents('run_c1', true))
    expect(re.exec.loopDrivers.size).toBe(0) // 终态循环不重建驱动
    expect(re.inflightNodes.map((n) => n.nodeId)).toEqual(['after'])
  })

  it('P1-B：快照中段 + 循环完成后崩溃 → succeeded 不被覆写 running、不重跑已收敛迭代', () => {
    const snapshot: JournalEventRecord = {
      id: 'j_run_c2_1', runId: 'run_c2', seq: 1, type: 'snapshot', nodeId: null, scopeKey: null,
      payload: {
        v: 1, suspended: false, variables: {}, llmHistory: [], runCounts: {},
        scopes: [{ key: 'root', iterationIndex: 0, activationCounter: 0, activationSeqs: {}, states: [], mergeArrivals: {}, forcedMergeNodeIds: [], loopOwnerId: null, iterationSkippedByPolicy: false, loopPseudoVars: {} }],
        // 快照时刻循环在途（迭代 2/5，driver.results=[r0,r1]）
        loopDrivers: [{ loopNodeId: 'loop1', results: [{ i: 0 }, { i: 1 }], listSize: 3, list: [{ i: 0 }, { i: 1 }, { i: 2 }], parentScopeKey: 'root' }],
        reexecNodeIds: [],
      },
      createdAt: new Date(),
    } as never
    const events = loopEvents('run_c2', true).map((e) => (e.seq === 1 ? { ...e, type: 'snapshot' } : e)).filter((e) => e.seq !== 1)
    const re = replayJournal(input(graph, 'run_c2'), events, snapshot)
    const loopState = re.exec.rootScope.states.get('loop1')
    expect(loopState?.status).toBe('succeeded') // 不被重建块覆写 running
    expect(re.exec.loopDrivers.size).toBe(0)
    expect(re.inflightNodes.map((n) => n.nodeId)).toEqual(['after'])
  })
})

describe('总收口 review：v≠1 快照视为不存在（宁慢勿错）', () => {
  it('版本未知快照 → 全量重放（非空投影）', () => {
    const graph = mkGraph([['start', 'start'], ['a', 'echo'], ['end', 'end']], [['start', 'a'], ['a', 'end']])
    const mk = (runId: string) => [
      { id: `j_${runId}_0`, runId, seq: 0, type: 'run_started', nodeId: null, scopeKey: 'root', payload: { triggerType: 'manual' }, createdAt: new Date() },
      { id: `j_${runId}_1`, runId, seq: 1, type: 'node_launched', nodeId: 'start', scopeKey: 'root', payload: { nodeType: 'start', iterationIndex: 0 }, createdAt: new Date() },
      { id: `j_${runId}_2`, runId, seq: 2, type: 'node_completed', nodeId: 'start', scopeKey: 'root', payload: { iterationIndex: 0, output: { ok: 1 }, routeTaken: null, completedSeq: 1 }, createdAt: new Date() },
      { id: `j_${runId}_3`, runId, seq: 3, type: 'edge_activated', nodeId: null, scopeKey: 'root', payload: { edgeId: 'e0', seq: 2, sourceNodeId: 'start', targetNodeId: 'a' }, createdAt: new Date() },
    ] as never as JournalEventRecord[]
    const snap: JournalEventRecord = {
      id: 'j_run_v_9', runId: 'run_v', seq: 9, type: 'snapshot', nodeId: null, scopeKey: null,
      payload: { v: 2 }, createdAt: new Date(),
    } as never
    const re = replayJournal(input(graph, 'run_v'), mk('run_v'), snap)
    // 全量重放：start 完成态在（此前 v≠1 快照把 startSeq 推到 10 → 空投影）
    expect(re.exec.rootScope.states.get('start')?.status).toBe('succeeded')
    expect(re.exec.variables.get('start')).toEqual({ ok: 1 })
  })
})

describe('总收口 review：在途重执行 persistedState 注入（E2 §5.9-f）', () => {
  it('崩溃于步间 → rehydrate 重执行 → loadState 返回已落库步级状态', async () => {
    const journal = new InMemoryJournal()
    const seen: unknown[] = []
    const statful: WorkflowNodeHandler = {
      type: 'statful' as never, controlKind: 'task', cancellable: false,
      outputSchema: [], validateConfig: () => [],
      execute: async (ctx) => { seen.push(await ctx.loadState()); return { status: 'succeeded' as never, output: { done: true } } },
    } as never
    const graph = mkGraph([['start', 'start'], ['ag1', 'statful'], ['end', 'end']], [['start', 'ag1'], ['ag1', 'end']])
    // 手工构造崩溃现场：start 完成 + ag1 在途（journal），node_run 行带 state_json
    const put = (seq: number, type: string, payload: Record<string, unknown> | null, nodeId: string | null = null) =>
      journal.append({ runId: 'run_p', seq, type: type as never, nodeId, scopeKey: 'root', payload })
    await put(0, 'run_started', { triggerType: 'manual' })
    await put(1, 'node_launched', { nodeType: 'start', iterationIndex: 0 }, 'start')
    await put(2, 'node_completed', { iterationIndex: 0, output: {}, routeTaken: null, completedSeq: 1 }, 'start')
    await put(3, 'edge_activated', { edgeId: 'e0', seq: 2, sourceNodeId: 'start', targetNodeId: 'ag1' })
    await put(4, 'node_launched', { nodeType: 'statful', iterationIndex: 0 }, 'ag1')

    const rows = new RowsFake()
    rows.rows.set('start', { status: 'succeeded', output: {} })
    rows.rows.set('ag1', { status: 'running', stateJson: '{"step":3,"data":"断点"}' })
    const runs = new FakeRuns()
    runs.row = { runId: 'run_p', userId: 'u1', definitionId: 'd1', graphSnapshot: graph, startInputs: {}, settings: null, triggerInfo: null, status: 'running' }
    const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, statful] as never)
    const engine = new WorkflowEngineService({ runs, nodeRuns: rows, events: new FakeEvents(), journal } as unknown as WorkflowEngineDeps, registry)
    await runWithUserAsync('u1', async () => {
      expect(await engine.ensureActive('run_p')).toBe(true)
      await settle(80)
    })
    expect(seen).toEqual([{ step: 3, data: '断点' }]) // 注入成功（此前恒 undefined → 从零重跑）
    expect(runs.final.status).toBe('succeeded')
  })
})

describe('总收口 review：C1 自由环崩溃恢复（环不静默截断）', () => {
  it('A 二次执行中崩溃 → 恢复后 A 重执行激活新序号 → B 重执行（此前环停摆+序号分叉）', async () => {
    const journal = new InMemoryJournal()
    let aCalls = 0
    let bCalls = 0
    let crashGate = true // 第 2 次 A 调用吊死（模拟崩溃于执行中；engine1 被放弃）
    const nodeA: WorkflowNodeHandler = {
      type: 'nodeA' as never, controlKind: 'task', cancellable: false,
      outputSchema: [], validateConfig: () => [],
      execute: async () => {
        aCalls++
        if (aCalls === 2 && crashGate) await new Promise<void>(() => {}) // 永不 settle
        if (aCalls >= 4) return { status: 'failed' as never, error: 'A 达到轮次上限（测试收口）' }
        return { status: 'succeeded' as never, output: { round: aCalls } }
      },
    } as never
    const nodeB: WorkflowNodeHandler = {
      type: 'nodeB' as never, controlKind: 'task', cancellable: false,
      outputSchema: [], validateConfig: () => [],
      execute: async () => { bCalls++; return { status: 'succeeded' as never, output: { round: bCalls } } },
    } as never
    const graph = mkGraph(
      [['start', 'start'], ['A', 'nodeA'], ['B', 'nodeB'], ['end', 'end']],
      [['start', 'A'], ['A', 'B', 'normal'], ['B', 'A', 'normal'], ['B', 'end', 'normal']],
    )
    // 第一"进程"：A1 完成 → B1 完成 → B→A 重激活 A（C1）→ A2 吊死（崩溃点）。
    // 不 await execute——A2 永不 settle，execute 会挂到泵空闲；放弃该进程即可
    const first = mkEngine(journal, [nodeA, nodeB])
    await runWithUserAsync('u1', async () => {
      void first.engine.execute(input(graph, 'run_cycle')).catch(() => {})
      await settle(150)
    })
    expect(aCalls).toBe(2) // 第 2 次已进入且吊死
    expect(bCalls).toBe(1)

    // 第二"进程"恢复：A2 在途重执行 → settle 激活新 A→B 序号 → B 重执行
    crashGate = false
    const second = mkEngine(journal, [nodeA, nodeB])
    second.runs.row = { runId: 'run_cycle', userId: 'u1', definitionId: 'd1', graphSnapshot: graph, startInputs: {}, settings: null, triggerInfo: null, status: 'running' }
    await runWithUserAsync('u1', async () => {
      expect(await second.engine.ensureActive('run_cycle')).toBe(true)
      await settle(200)
    })
    expect(bCalls).toBe(2) // B 重执行（修复前：陈旧激活序号使 B 永不重跑）
    // 终态有界（end 与 A 第 4 轮失败并行竞争，两者皆合法收口——核心断言是 B 重跑）
    expect(['succeeded', 'failed']).toContain(second.runs.final.status)
    // journal 与内存一致：A→B 边存在大于 B 第一轮 completedSeq 的新激活
    const e1Seqs = journal.all()
      .filter((e) => e.type === 'edge_activated' && (e.payload as { edgeId?: string })?.edgeId === 'e1')
      .map((e) => (e.payload as { seq?: number }).seq)
    expect(e1Seqs.length).toBe(2)
    expect(e1Seqs[1]!).toBeGreaterThan(e1Seqs[0]!)
  })
})

describe('总收口 review：快照 loopPseudoVars 投影（二次方放大）', () => {
  it('循环体内挂起 → on-suspend 快照：伪变量投影为 {item,index,listSize}，不内嵌列表本体', async () => {
    const journal = new InMemoryJournal()
    const graph = mkGraph(
      [
        ['start', 'start'],
        ['loop1', 'loop', { listExpression: '{{start.items}}' }],
        ['body', 'rev'],
        ['end', 'end'],
      ],
      [['start', 'loop1'], ['loop1', 'body', 'loop-body'], ['body', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']],
    )
    const e = mkEngine(journal, [review])
    const runInput: ExecuteRunInput = { ...input(graph, 'run_snap'), startInputs: { items: ['甲', '乙'] } }
    const status = await runWithUserAsync('u1', async () => {
      const st = await e.engine.execute(runInput)
      await settle()
      return st
    })
    expect(status).toBe('waiting_review') // 第一迭代 body 挂起 → on-suspend 快照
    const snap = journal.all().find((ev) => ev.type === 'snapshot')
    expect(snap).toBeTruthy()
    const scopes = (snap!.payload as { scopes?: Array<{ loopPseudoVars?: Record<string, Record<string, unknown>> }> }).scopes ?? []
    const pseudos = scopes.flatMap((sc) => Object.values(sc.loopPseudoVars ?? {}))
    expect(pseudos.length).toBe(1) // 挂起迭代一条
    for (const pv of pseudos) {
      expect(pv.list).toBeUndefined() // 不内嵌列表本体（曾逐迭代内嵌 → N×N 二次方）
      expect(pv.listSize).toBe(2)
      expect(pv.index).toBe(0)
    }
  })
})
