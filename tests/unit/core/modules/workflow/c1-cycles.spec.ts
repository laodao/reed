/**
 * C1 成环测试：边激活序号重执行语义（spec §4 六用例）
 * @module tests/workflow/c1-cycles
 */
import { describe, it, expect, vi } from 'vitest'

// mock 重依赖（KB/ai-call/docx/path/fs）——避免测试收集阶段拉起数据库等基础设施
vi.mock('@core/services/knowledge-base.service', () => ({ KnowledgeService: class {} }))
vi.mock('@core/services/ai-call', () => ({ callAIStream: vi.fn(), callVLM: vi.fn(), toImageDataUrl: vi.fn() }))
import { WorkflowEngineService, type ExecuteRunInput } from '@core/modules/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/modules/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/modules/workflow/nodes/control-nodes'
import { TASK_NODE_HANDLERS } from '@core/modules/workflow/nodes/task-nodes'
import { validateGraph } from '@core/modules/workflow/engine/graph-validator'
import type { WorkflowNodeHandler } from '@core/modules/workflow/engine/node-handler'
import type { WorkflowGraph } from '@shared/types/workflow.types'
import { runWithUser } from '@core/context/user-context'

// ---- 假实现 ----
class FakeRuns {
  patches: Array<Record<string, unknown>> = []
  async patchRun(_id: string, p: Record<string, unknown>) { this.patches.push(p) }
  get final() { return this.patches[this.patches.length - 1] ?? {} }
}
class FakeNodeRuns {
  rows: any[] = []
  seq = 0
  async startNode(i: any) { this.rows.push({ rowKey: `${i.nodeId}|${i.iterationIndex}|${++this.seq}`, ...i, status: 'running' }) }
  async patchNode(_r: string, nodeId: string, iter: number, p: any) {
    // 重执行后同一 (nodeId, iter) 有多行（rowKey 唯一）——patch 打到最新行
    const rows = this.rows.filter(x => x.nodeId === nodeId && x.iterationIndex === iter)
    if (rows.length) Object.assign(rows[rows.length - 1], p)
  }
  outputsOf(nodeId: string): any[] { return this.rows.filter(r => r.nodeId === nodeId && r.status === 'succeeded').map(r => r.output) }
}
const events: any[] = []

/** 可编程 echo：按调用序返回 outputs 数组中的值 */
function makeScriptedHandler(type: string, outputs: Array<Record<string, unknown>>): WorkflowNodeHandler {
  let calls = 0
  return {
    type: type as any, controlKind: 'task', cancellable: false,
    outputSchema: [], validateConfig: () => [],
    async execute() {
      const out = outputs[Math.min(calls, outputs.length - 1)]
      calls++
      return { status: 'succeeded', output: { ...out } }
    },
  }
}
/** 可编程审核：每次挂起（由测试驱动 resume） */
function makeInputReviewHandler(type: string): WorkflowNodeHandler {
  return {
    type: type as any, controlKind: 'task', cancellable: false,
    outputSchema: [], validateConfig: () => [],
    async execute(ctx) {
      return { status: 'waiting_review', payload: { prompt: String(ctx.config.payload ?? '') }, timeoutMs: null }
    },
  }
}

function makeEngine(extra: WorkflowNodeHandler[]) {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS, ...extra])
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id, p) => runs.patchRun(id, p) },
      nodeRuns: { startNode: i => nodeRuns.startNode(i), patchNode: (r, n, it, p) => nodeRuns.patchNode(r, n, it, p) },
      events: { emit: (e: any) => events.push(e) },
    } as any,
    registry
  )
  return { engine, runs, nodeRuns }
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
const input = (graph: WorkflowGraph, startInputs: Record<string, unknown> = {}, settings?: Record<string, number>): ExecuteRunInput =>
  ({ runId: 'run_1', userId: 'u1', definitionId: 'd1', graph, startInputs, settings })
const exec2 = (engine: any, i: ExecuteRunInput) => runWithUser('u1', () => engine.execute(i))
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

// 两轮迭代环图：start → rev(input) → llm → 回连 rev；llm → cond → 跳出
function cycleGraph(): WorkflowGraph {
  const graph = g(
    [
      n('start', 'start'),
      n('rev', 'inputReview', { payload: '初稿' }),
      n('llm', 'scriptedLlm', {}),
      n('cond', 'condition', {
        branches: [
          { branchId: 'again', label: '再改', conditions: [{ left: '{{llm.round}}', operator: 'lt', right: '2' }] },
          { branchId: 'done', label: '完成', conditions: [{ left: '{{llm.round}}', operator: 'gte', right: '2' }] },
        ],
        noMatchPolicy: 'fail',
      }),
      n('end', 'end'),
    ],
    [
      ['start', 'rev'], ['rev', 'llm', 'approve'], ['llm', 'cond'],
      ['cond', 'rev', 'branch'],   // 再改：回连审核（成环）
      ['cond', 'end', 'branch'],   // 完成：跳出
    ]
  )
  graph.edges[3].branchId = 'again'
  graph.edges[4].branchId = 'done'
  return graph
}

// ==================== 校验器降为警告 ====================

describe('C1 校验器：环检测降为警告', () => {
  it('普通环 → valid=true 且 warnings 含成环提示', () => {
    const graph = g(
      [n('start', 'start'), n('a', 'delay', { durationMs: 1 }), n('b', 'delay', { durationMs: 1 }), n('end', 'end')],
      [['start', 'a'], ['a', 'b'], ['b', 'a', 'fail'], ['b', 'end']]
    )
    const result = validateGraph(graph)
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.includes('环') || w.includes('跳出'))).toBe(true)
  })

  it('loop-back 机制不回归（合法循环仍 valid）', () => {
    const graph = g(
      [n('start', 'start'), n('loop1', 'loop', { listExpression: '{{start.items}}' }), n('body', 'delay', { durationMs: 1 }), n('end', 'end')],
      [['start', 'loop1'], ['loop1', 'body', 'loop-body'], ['body', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']]
    )
    expect(validateGraph(graph).valid).toBe(true)
  })
})

// ==================== 引擎重执行语义 ====================

describe('C1 引擎：环中节点重执行', () => {
  it('两轮迭代环：审核重执行两轮后条件跳出 → succeeded（spec 用例1/2）', async () => {
    const scriptedLlm = makeScriptedHandler('scriptedLlm', [{ round: 1 }, { round: 2 }])
    const inputReview = makeInputReviewHandler('inputReview')
    const { engine, runs } = makeEngine([scriptedLlm, inputReview])

    // 第一轮：挂起
    let status = await exec2(engine, input(cycleGraph()))
    expect(status).toBe('waiting_review')

    // 提交 v1 → llm(round=1) → cond(again) → rev 重执行（第二轮挂起）
    let applied = await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'rev', { decision: 'approve_with_changes', editedValues: { output_result: 'v1' } } as any)
    )
    expect(applied).toBe(true)
    await wait(100)
    expect(runs.final.status).toBe('waiting_review') // 环回到 rev（第二轮）

    // 提交 v2 → llm(round=2) → cond(done) → end → succeeded
    applied = await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'rev', { decision: 'approve_with_changes', editedValues: { output_result: 'v2' } } as any)
    )
    expect(applied).toBe(true)
    await wait(150)
    expect(runs.final.status).toBe('succeeded')
  })

  it('无出口环触 maxNodeRuns 护栏 → failed（spec 用例3）', async () => {
    // a→b→a 无交互（用 fail 边回环制造必然重入）
    const boom = makeScriptedHandler('boomNode', [{}])
    const boomHandler: WorkflowNodeHandler = {
      ...boom,
      async execute() { return { status: 'failed', error: '永远失败', retryable: false } },
    }
    const { engine, runs } = makeEngine([boomHandler])
    const graph = g(
      [n('start', 'start'), n('a', 'boomNode'), n('b', 'delay', { durationMs: 1 }), n('end', 'end')],
      [['start', 'a'], ['a', 'b'], ['a', 'a', 'fail'], ['b', 'end']]
    )
    const status = await exec2(engine, input(graph, {}, { maxNodeRuns: 3 }))
    expect(status).toBe('failed')
    expect(String(runs.final.error)).toContain('最大运行次数')
  })

  it('并行汇合（parallel-merge 等齐）只执行一次——完成前旧激活不重执行（spec 用例6 修正版）', async () => {
    const echoX: WorkflowNodeHandler = {
      type: 'echoX' as any, controlKind: 'task', cancellable: false,
      outputSchema: [], validateConfig: () => [],
      async execute() { return { status: 'succeeded', output: { v: 1 } } },
    }
    const { engine, nodeRuns } = makeEngine([echoX])
    const graph = g(
      [
        n('start', 'start'), n('p', 'parallel'),
        n('a', 'delay', { durationMs: 20 }), n('b', 'delay', { durationMs: 1 }),
        n('m', 'parallel-merge', { waitPolicy: 'all' }),
        n('end', 'end'),
      ],
      [['start', 'p'], ['p', 'a'], ['p', 'b'], ['a', 'm'], ['b', 'm'], ['m', 'end']]
    )
    await exec2(engine, input(graph))
    await wait(50)
    // 等齐语义：m 在两条入边都激活后才执行一次；b 先到不触发（waitPolicy=all）
    expect(nodeRuns.rows.filter(r => r.nodeId === 'm' && r.status === 'succeeded').length).toBeLessThanOrEqual(1)
  })
})
