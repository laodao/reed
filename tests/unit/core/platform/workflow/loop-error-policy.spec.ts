/**
 * 循环迭代错误策略（errorPolicy）测试
 * @module tests/unit/core/platform/workflow/loop-error-policy
 * @description loop 节点新增 errorPolicy：
 *              - fail（默认）：迭代体内任一节点失败 → 循环失败（现有行为，回归）
 *              - skip：失败迭代被跳过（results 对应位置记 { error, skipped:true }），
 *                循环继续跑完其余迭代，最后成功（批量采集单条失败不中断整体）
 *              用真实 EXTRA_NODE_HANDLERS 的 web-extract（mock fetch 使部分失败）验证。
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

describe('loop 迭代错误策略 errorPolicy', () => {
  beforeEach(() => {
    // mock fetch：'https://bad.com/*' 失败，其余成功（模拟逐条抓正文部分站点不可达）
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('bad.com')) throw new Error('fetch failed')
      return {
        ok: true,
        status: 200,
        text: async () => `<html><title>${url}</title><body><article>${url} 正文内容足够长用于提取测试验证</article></body></html>`,
      } as unknown as Response
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function loopGraph(errorPolicy?: 'fail' | 'skip') {
    const cfg: Record<string, unknown> = { listExpression: '{{start.urls}}' }
    if (errorPolicy) cfg.errorPolicy = errorPolicy
    return g(
      [
        n('start', 'start'),
        n('loop1', 'loop', cfg),
        n('ext', 'web-extract', { url: '{{loop1.item}}', maxLength: 1000, maxLinks: 0, onError: 'fail' }),
        n('end', 'end'),
      ],
      [['start', 'loop1'], ['loop1', 'ext', 'loop-body'], ['ext', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']]
    )
  }

  it('默认（fail）：任一迭代失败 → 循环失败（回归现有行为）', async () => {
    const { engine } = makeEngine()
    const status = await exec2(engine, input(loopGraph(undefined), { urls: ['https://bad.com/1', 'https://ok.com/2'] }))
    expect(status).toBe('failed')
  })

  it('errorPolicy=skip：失败迭代被跳过，成功迭代保留，循环最终成功', async () => {
    const { engine, nodeRuns } = makeEngine()
    const status = await exec2(engine, input(loopGraph('skip'), { urls: ['https://bad.com/1', 'https://ok.com/2', 'https://ok.com/3'] }))
    expect(status).toBe('succeeded')
    const loopOut = nodeRuns.outputOf('loop1')
    expect(loopOut).toBeDefined()
    const results = (loopOut?.results as unknown[]) ?? []
    expect(results.length).toBe(3)
    // 失败迭代占位
    expect(results[0]).toMatchObject({ skipped: true })
    expect((results[0] as Record<string, unknown>).error).toBeTruthy()
    // 成功迭代保留正文
    expect((results[1] as Record<string, unknown>).title).toContain('https://ok.com/2')
    expect((results[2] as Record<string, unknown>).title).toContain('https://ok.com/3')
    // 失败节点状态仍为 failed（日志可见），但不影响运行成功
    expect(nodeRuns.statusOf('ext', 0)).toBe('failed')
  })

  it('errorPolicy=skip：全部迭代失败 → 循环仍成功（results 全为跳过占位）', async () => {
    const { engine, nodeRuns } = makeEngine()
    const status = await exec2(engine, input(loopGraph('skip'), { urls: ['https://bad.com/1', 'https://bad.com/2'] }))
    expect(status).toBe('succeeded')
    const loopOut = nodeRuns.outputOf('loop1')
    const results = (loopOut?.results as unknown[]) ?? []
    expect(results.length).toBe(2)
    expect(results.every(r => (r as Record<string, unknown>).skipped === true)).toBe(true)
  })

  it('errorPolicy=skip：空列表仍按 emptyPolicy=skip 直接完成', async () => {
    const { engine, nodeRuns } = makeEngine()
    const status = await exec2(engine, input(loopGraph('skip'), { urls: [] }))
    expect(status).toBe('succeeded')
    const loopOut = nodeRuns.outputOf('loop1')
    expect((loopOut?.results as unknown[]) ?? []).toHaveLength(0)
  })
})
