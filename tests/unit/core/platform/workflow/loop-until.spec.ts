/**
 * 循环 until 模式（repeat body until stopValue）引擎级测试
 * @module tests/unit/core/platform/workflow/loop-until
 * @description 验证：提前收尾 / 达上限必收尾 / 每轮作用域隔离与 prev 伪变量 /
 *              maxIterations 运行时上限护栏。循环体用真实 INTERACTION 的 message 节点
 *              （content 可模板化引用循环伪变量 index/prev），无需外部依赖。
 */
import { describe, it, expect } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { INTERACTION_NODE_HANDLERS } from '@core/platform/workflow/nodes/interaction-nodes'
import type { WorkflowEngineDeps, WorkflowEventPort, WorkflowNodeRunPort, WorkflowRunPort } from '@core/platform/workflow/engine/ports'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import { runWithUser } from '@core/context/user-context'

class FakeRuns implements WorkflowRunPort {
  patches: Array<Record<string, unknown>> = []
  async patchRun(_id: string, patch: Record<string, unknown>): Promise<void> {
    this.patches.push(patch)
  }
  get final(): Record<string, unknown> {
    return this.patches[this.patches.length - 1] ?? {}
  }
}
class FakeNodeRuns implements WorkflowNodeRunPort {
  rows: Map<string, Record<string, unknown>> = new Map()
  async startNode(i: { nodeId: string; iterationIndex: number }): Promise<void> {
    this.rows.set(`${i.nodeId}|${i.iterationIndex}`, { ...i, status: 'running' })
  }
  async patchNode(_r: string, nodeId: string, iter: number, patch: Record<string, unknown>): Promise<void> {
    Object.assign(this.rows.get(`${nodeId}|${iter}`) ?? {}, patch)
  }
  outputOf(nodeId: string, iter = 0): Record<string, unknown> | undefined {
    return this.rows.get(`${nodeId}|${iter}`)?.output as Record<string, unknown> | undefined
  }
  statusOf(nodeId: string, iter = 0): unknown {
    return this.rows.get(`${nodeId}|${iter}`)?.status
  }
}
class FakeEvents implements WorkflowEventPort {
  events: unknown[] = []
  emit(e: never): void { void e }
}

let seq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as never }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string, string?]>): WorkflowGraph {
  return {
    version: 1,
    nodes,
    edges: edges.map(([s, t, k]) => ({ id: `e${seq++}`, sourceNodeId: s, targetNodeId: t, kind: (k ?? 'normal') as never })),
  }
}
function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const events = new FakeEvents()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...INTERACTION_NODE_HANDLERS])
  const engine = new WorkflowEngineService({ runs, nodeRuns, events } as WorkflowEngineDeps, registry)
  return { engine, runs, nodeRuns, events }
}
const input = (graph: WorkflowGraph, startInputs: Record<string, unknown> = {}, settings: Record<string, unknown> = {}): ExecuteRunInput => ({
  runId: 'run_1', userId: 'u1', definitionId: 'd1', graph, startInputs, settings,
})
const exec2 = (engine: WorkflowEngineService, i: ExecuteRunInput) => runWithUser('u1', () => engine.execute(i))

/** until 循环：body = message（引用 index 与 prev），loop-back 源即 message */
function untilGraph(overrides: Record<string, unknown> = {}) {
  const cfg: Record<string, unknown> = {
    mode: 'until',
    stopExpression: '{{round1.index}}',
    stopValue: '1',
    maxIterations: 5,
    ...overrides,
  }
  return g(
    [
      n('start', 'start'),
      n('round1', 'loop', cfg),
      n('m1', 'message', { content: 'idx={{round1.index}} prev={{round1.prev.content}}' }),
      n('end', 'end'),
    ],
    [['start', 'round1'], ['round1', 'm1', 'loop-body'], ['m1', 'round1', 'loop-back'], ['round1', 'end', 'loop-done']]
  )
}

describe('loop until 模式（repeat body until stopValue）', () => {
  it('stop 在第 k 轮满足 → 恰好执行 k 轮并成功，输出 iterations/count/last', async () => {
    const { engine, nodeRuns } = makeEngine()
    const status = await exec2(engine, input(untilGraph())) // stopValue=1 → 执行 2 轮
    expect(status).toBe('succeeded')
    const out = nodeRuns.outputOf('round1')
    expect(out).toBeDefined()
    expect(out?.iterations).toBe(2)
    expect(out?.count).toBe(2)
    const results = (out?.results as unknown[]) ?? []
    expect(results.length).toBe(2)
    expect((results[1] as Record<string, unknown>).content as string).toContain('idx=1')
    expect((out?.last as Record<string, unknown>).content as string).toContain('idx=1')
  })

  it('永不满足 → 达 maxIterations 上限无条件收尾（成功，不失败）', async () => {
    const { engine, nodeRuns } = makeEngine()
    const status = await exec2(engine, input(untilGraph({ stopValue: 'never', maxIterations: 3 })))
    expect(status).toBe('succeeded')
    const out = nodeRuns.outputOf('round1')
    expect(out?.iterations).toBe(3)
    expect((out?.results as unknown[]).length).toBe(3)
  })

  it('每轮作用域隔离 + prev 伪变量：第 1 轮 prev 为空，第 2 轮可读到第 1 轮产物', async () => {
    const { engine, nodeRuns } = makeEngine()
    await exec2(engine, input(untilGraph()))
    const out = nodeRuns.outputOf('round1')
    const results = (out?.results as unknown[]) ?? []
    const c0 = String((results[0] as Record<string, unknown>).content)
    const c1 = String((results[1] as Record<string, unknown>).content)
    expect(c0).toBe('idx=0 prev=') // 首轮 prev 缺失渲染空串（不抛错）
    expect(c1).toContain('idx=1')
    expect(c1).toContain('idx=0') // 第二轮读到了第一轮的 content
  })

  it('maxIterations 超过运行上限（settings.maxLoopIterations）→ 运行失败且不可重试', async () => {
    const { engine } = makeEngine()
    const status = await exec2(engine, input(untilGraph({ maxIterations: 50 }), {}, { maxLoopIterations: 10 }))
    expect(status).toBe('failed')
  })
})
