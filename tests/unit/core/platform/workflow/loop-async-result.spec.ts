/**
 * 复现测试：loop 汇聚异步节点（web-extract 风格）输出到 results
 * @module tests/unit/core/platform/workflow/loop-async-result
 * @description C1 早报工作流发现：loop 内 web-extract（异步任务节点）的
 *              results 汇聚为 null。用真实 EXTRA_NODE_HANDLERS 的 web-extract
 *              （mock global.fetch）验证 collectIterationResult 是否取到输出。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { EXTRA_NODE_HANDLERS } from '@core/platform/workflow/nodes/extra-nodes'
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
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as any }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string, string?]>): WorkflowGraph {
  return {
    version: 1, nodes,
    edges: edges.map(([s, t, k]) => ({ id: `e${seq++}`, sourceNodeId: s, targetNodeId: t, kind: (k ?? 'normal') as any })),
  }
}
function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const events = new FakeEvents()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...EXTRA_NODE_HANDLERS])
  const engine = new WorkflowEngineService({ runs, nodeRuns, events } as WorkflowEngineDeps, registry)
  return { engine, runs, nodeRuns, events }
}
const input = (graph: WorkflowGraph, startInputs: Record<string, unknown> = {}): ExecuteRunInput => ({
  runId: 'run_1', userId: 'u1', definitionId: 'd1', graph, startInputs, settings: {},
})
const exec2 = (engine: WorkflowEngineService, i: ExecuteRunInput) => runWithUser('u1', () => engine.execute(i))

describe('loop 汇聚异步节点输出（复现 C1 早报）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => `<html><title>${url}</title><body><article><a href="/story1">第一篇新闻标题足够长</a></article></body></html>`,
    })))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loop 内 web-extract（异步 fetch）→ results 汇聚输出对象', async () => {
    const { engine, nodeRuns } = makeEngine()
    // start → loop(list) ⇄ extract(web-extract url={{loop.item}}) → end
    const graph = g(
      [
        n('start', 'start'),
        n('loop1', 'loop', { listExpression: '{{start.urls}}' }),
        n('ext', 'web-extract', { url: '{{loop1.item}}', maxLength: 1000, maxLinks: 0 }),
        n('end', 'end'),
      ],
      [['start', 'loop1'], ['loop1', 'ext', 'loop-body'], ['ext', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']]
    )
    const status = await exec2(engine, input(graph, { urls: ['https://a.com/1', 'https://a.com/2'] }))
    expect(status).toBe('succeeded')
    const ext0 = nodeRuns.outputOf('ext', 0)
    expect(ext0).toBeDefined()
    expect(ext0?.title).toContain('https://a.com/1')
    const loopOut = nodeRuns.outputOf('loop1')
    expect(loopOut).toBeDefined()
    const results = (loopOut?.results as unknown[]) ?? []
    expect(results.length).toBe(2)
    expect(results[0]).not.toBeNull()
    expect((results[0] as Record<string, unknown>).title).toContain('https://a.com/1')
    expect((results[1] as Record<string, unknown>).title).toContain('https://a.com/2')
  })
})
