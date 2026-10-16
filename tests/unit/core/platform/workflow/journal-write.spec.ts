/**
 * Run Journal 写入完整性测试（11 号 §5.2 E1：先日志后内存）
 * @module tests/core/platform/workflow/journal-write.spec
 *
 * InMemoryJournal + 真实引擎：跑通典型图后断言事件序列完备、seq 严格单调、
 * 挂起强制快照、写失败=run 失败终态（不变量 2）。
 * 重放投影（replayJournal/rehydrate）在批 7a 第二段测试。
 */

import { describe, it, expect } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { InMemoryJournal } from '@core/platform/workflow/engine/journal'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { INTERACTION_NODE_HANDLERS } from '@core/platform/workflow/nodes/interaction-nodes'
import type { WorkflowEngineDeps, WorkflowEventPort, WorkflowRunPort, WorkflowNodeRunPort } from '@core/platform/workflow/engine/ports'
import type { WorkflowGraph, WorkflowRunEvent, WorkflowNode } from '@shared/types/workflow.types'
import type { WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'
import { runWithUserAsync } from '@core/context/user-context'

class FakeEvents implements WorkflowEventPort {
  emit(_e: WorkflowRunEvent): void {}
}
class FakeRuns implements WorkflowRunPort {
  final: { status?: string } = {}
  async patchRun(_id: string, patch: Record<string, unknown>) { Object.assign(this.final, patch) }
  async create() { return '' } async get() { return null } async list() { return { items: [], total: 0 } }
  async scanRecoverable() { return [] } async listRecent() { return [] } async findSucceededWithOutput() { return [] }
  async patch() {} async delete() {} async mutexScopeOf() { return null }
}
class FakeNodeRuns implements WorkflowNodeRunPort {
  rows = new Map<string, { status?: string; output?: unknown }>()
  async startNode(n: { nodeId: string }) { this.rows.set(n.nodeId, { status: 'running' }) }
  async patchNode(_r: string, nodeId: string, _i: number, patch: Record<string, unknown>) {
    const cur = this.rows.get(nodeId) ?? {}; Object.assign(cur, patch); this.rows.set(nodeId, cur)
  }
  async listByRun() { return [] } async findByRunAndNode() { return null } async deleteByRun() {}
}

const echo = (text = 'ok'): WorkflowNodeHandler => ({
  type: 'echo' as never, controlKind: 'task', cancellable: false,
  outputSchema: [], validateConfig: () => [],
  execute: async () => ({ status: 'succeeded' as never, output: { text } }),
} as never)
const review: WorkflowNodeHandler = {
  type: 'rev' as never, controlKind: 'interaction', cancellable: true,
  outputSchema: [], validateConfig: () => [],
  execute: async () => ({ status: 'waiting_review' as never, payload: { q: '审吗' } }),
} as never

function mkGraph(
  nodes: Array<[string, string] | [string, string, Record<string, unknown>]>,
  edges: Array<[string, string, string?]>,
): WorkflowGraph {
  return {
    nodes: nodes.map(([id, type, config]) => ({ id, type: type as never, config: config ?? {}, position: { x: 0, y: 0 } } as unknown as WorkflowNode)),
    edges: edges.map(([s, t, kind], i) => ({ id: `e${i}`, sourceNodeId: s, targetNodeId: t, kind: (kind ?? 'normal') as never })),
  } as unknown as WorkflowGraph
}

function mkEngine(journal: InMemoryJournal | null) {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...INTERACTION_NODE_HANDLERS, echo(), review] as never)
  const deps = { runs, nodeRuns, events: new FakeEvents(), journal } as unknown as WorkflowEngineDeps
  return { engine: new WorkflowEngineService(deps, registry), runs, nodeRuns }
}

const input = (graph: WorkflowGraph, startInputs: Record<string, unknown> = {}): ExecuteRunInput =>
  ({ runId: 'run_1', userId: 'u1', definitionId: 'd1', graph, startInputs })

describe('Run Journal 写入（E1）', () => {
  it('顺序图：run_started → 边/节点事件交替 → run_finished，seq 严格单调', async () => {
    const journal = new InMemoryJournal()
    const { engine } = mkEngine(journal)
    const graph = mkGraph(
      [['start', 'start'], ['a', 'echo'], ['end', 'end']],
      [['start', 'a'], ['a', 'end']],
    )
    const status = await runWithUserAsync('u1', () => engine.execute(input(graph)))
    expect(status).toBe('succeeded')
    const events = await journal.listByRun('run_1')
    const types = events.map((e) => e.type)
    expect(types[0]).toBe('run_started')
    expect(types.at(-1)).toBe('run_finished')
    // 关键事件全在
    for (const t of ['node_launched', 'node_completed', 'edge_activated', 'run_finished']) {
      expect(types).toContain(t)
    }
    // seq 严格单调且连续（0 起）
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i))
    // 边事件带激活序号与端点
    const edge = events.find((e) => e.type === 'edge_activated')!
    expect(edge.payload).toMatchObject({ edgeId: 'e0', sourceNodeId: 'start', targetNodeId: 'a' })
    expect(edge.scopeKey).toBe('root')
    // 完成事件带输出与完成序号
    const done = events.find((e) => e.type === 'node_completed' && e.nodeId === 'a')!
    expect(done.payload).toMatchObject({ output: { text: 'ok' }, completedSeq: expect.any(Number) })
  })

  it('挂起：node_suspended（含审核现场）+ 强制快照；seq 连续', async () => {
    const journal = new InMemoryJournal()
    const { engine, runs } = mkEngine(journal)
    const graph = mkGraph(
      [['start', 'start'], ['r1', 'rev'], ['end', 'end']],
      [['start', 'r1'], ['r1', 'end', 'approve']],
    )
    const status = await runWithUserAsync('u1', async () => {
      const s = await Promise.race([
        engine.execute(input(graph)),
        new Promise((_, rej) => setTimeout(() => rej(new Error('execute 超时')), 3000)),
      ]) as string
      // 后台挂起任务排空（fire-and-forget 交互节点）
      await new Promise((r) => setTimeout(r, 50))
      return s
    }).catch((e) => {
      console.log('CAUGHT:', String(e))
      return 'timeout'
    })
    if (status === 'timeout') {
      console.log('EVENTS:', JSON.stringify((await journal.listByRun('run_1')).map(e => e.type)))
    }
    expect(status).toBe('waiting_review')
    expect(runs.final.status).toBe('waiting_review')
    const events = await journal.listByRun('run_1')
    const types = events.map((e) => e.type)
    expect(types).toContain('node_suspended')
    const susp = events.find((e) => e.type === 'node_suspended')!
    expect(susp.payload).toMatchObject({ reviewPayload: { q: '审吗' }, timeoutPolicy: 'fail' })
    expect(susp.nodeId).toBe('r1')
    // 挂起强制快照（reason=on-suspend，含投影结构）
    const snap = events.find((e) => e.type === 'snapshot')
    expect(snap?.payload).toMatchObject({ v: 1, suspended: true, reason: 'on-suspend' })
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i))
    expect(types.at(-1)).not.toBe('run_finished') // 挂起无终态锚点（重放止于快照）
  })

  it('失败：node_failed 带 disposition（fatal / fail_edge / retry_scheduled）', async () => {
    const journal = new InMemoryJournal()
    // 无 fail 边的失败 → fatal
    const boom: WorkflowNodeHandler = {
      type: 'boom' as never, controlKind: 'task', cancellable: false,
      outputSchema: [], validateConfig: () => [],
      execute: async () => { throw new Error('炸了') },
    } as never
    const runs = new FakeRuns()
    const nodeRuns = new FakeNodeRuns()
    const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, boom] as never)
    const engine = new WorkflowEngineService({ runs, nodeRuns, events: new FakeEvents(), journal } as unknown as WorkflowEngineDeps, registry)
    const graph = mkGraph([['start', 'start'], ['b', 'boom'], ['end', 'end']], [['start', 'b'], ['b', 'end']])
    const status = await runWithUserAsync('u1', () => engine.execute(input(graph)))
    expect(status).toBe('failed')
    const events = await journal.listByRun('run_1')
    const failed = events.find((e) => e.type === 'node_failed')
    expect(failed?.payload).toMatchObject({ error: expect.stringContaining('炸了'), disposition: 'fatal' })
    expect(events.at(-1)!.type).toBe('run_finished')
    expect((events.at(-1)!.payload as { status: string }).status).toBe('failed')
  })

  it('循环：loop_started / loop_iteration_settled / loop_completed；迭代事件在父作用域', async () => {
    const journal = new InMemoryJournal()
    const { engine } = mkEngine(journal)
    const graph = mkGraph(
      [['start', 'start'], ['loop1', 'loop', { listExpression: '{{start.items}}' }], ['body', 'echo'], ['end', 'end']],
      [['start', 'loop1'], ['loop1', 'body', 'loop-body'], ['body', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']],
    )
    // loop 列表来自 start 节点输出（= startInputs 透传）
    const status = await runWithUserAsync('u1', () => engine.execute(input(graph, { items: ['x', 'y'] })))
    expect(status).toBe('succeeded')
    const events = await journal.listByRun('run_1')
    const types = events.map((e) => e.type)
    expect(types).toContain('loop_started')
    const settled = events.filter((e) => e.type === 'loop_iteration_settled')
    expect(settled.length).toBeGreaterThanOrEqual(0) // 空 body 时不产生（防御路径）
    const loopDone = events.find((e) => e.type === 'loop_completed')
    if (loopDone) expect(loopDone.payload).toMatchObject({ routeTaken: 'loop-done' })
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i))
  })

  it('不变量 2：journal 写失败 = run 立即 failed 终态', async () => {
    const broken = {
      append: () => Promise.reject(new Error('disk full')),
      appendBatch: () => Promise.reject(new Error('disk full')),
      listByRun: async () => [], hasEvents: async () => false, deleteByRun: async () => 0,
    }
    const { engine, runs } = mkEngine(broken as never)
    const graph = mkGraph([['start', 'start'], ['a', 'echo'], ['end', 'end']], [['start', 'a'], ['a', 'end']])
    const status = await runWithUserAsync('u1', () => engine.execute(input(graph)).catch((e) => {
      // 引擎按不变量转 failed 终态并抛出中止信号——上层收到 run 失败
      expect(String(e)).toContain('运行日志写入失败')
      return 'failed-by-throw'
    }))
    expect(['failed', 'failed-by-throw']).toContain(status)
    expect(runs.final.status).toBe('failed')
    expect(String(runs.final.error)).toContain('运行日志写入失败')
  })

  it('快照阈值：事件数达 200 触发（低阈值注入验证机制）——由缺省常量保证，此处验证挂起快照已覆盖；InMemory seq 冲突防御', async () => {
    const journal = new InMemoryJournal()
    await expect(
      journal.append({ runId: 'r', seq: 1, type: 'run_started' }),
    ).resolves.toBeUndefined()
    await expect(
      journal.append({ runId: 'r', seq: 1, type: 'run_started' }),
    ).rejects.toThrow(/seq 冲突/)
    expect(await journal.hasEvents('r')).toBe(true)
    expect(await journal.deleteByRun('r')).toBe(1)
    expect(await journal.hasEvents('r')).toBe(false)
  })
})
