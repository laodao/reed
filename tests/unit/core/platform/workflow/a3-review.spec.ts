/**
 * A3 审核交互三模式测试：review（既有）/ choose（选项路由）/ input（编辑提交）
 * @module tests/workflow/a3-review
 * @description 覆盖评审修正 P1（校验器放行 review-choose 的 branch 边）与
 *              P2（input 模式自动放行 output_result，不被 editableFields 白名单过滤）
 */
import { describe, it, expect } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { TASK_NODE_HANDLERS } from '@core/platform/workflow/nodes/task-nodes'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import { runWithUser } from '@core/context/user-context'

// ---- 假实现 ----
class FakeRuns {
  patches: Array<Record<string, unknown>> = []
  async patchRun(_id: string, p: Record<string, unknown>) { this.patches.push(p) }
  get final() { return this.patches[this.patches.length - 1] ?? {} }
}
class FakeNodeRuns {
  rows: Map<string, any> = new Map()
  async startNode(i: { nodeId: string; iterationIndex: number }) {
    this.rows.set(`${i.nodeId}|${i.iterationIndex}`, { ...i, status: 'running' })
  }
  async patchNode(_r: string, nodeId: string, iter: number, p: any) {
    Object.assign(this.rows.get(`${nodeId}|${iter}`) ?? {}, p)
  }
  outputOf(nodeId: string, iter = 0) { return this.rows.get(`${nodeId}|${iter}`)?.output }
  rowOf(nodeId: string, iter = 0) { return this.rows.get(`${nodeId}|${iter}`) }
}
const events: any[] = []

function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS])
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
const input = (graph: WorkflowGraph, startInputs: Record<string, unknown> = {}): ExecuteRunInput =>
  ({ runId: 'run_1', userId: 'u1', definitionId: 'd1', graph, startInputs })
const exec2 = (engine: any, i: ExecuteRunInput) => runWithUser('u1', () => engine.execute(i))
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

// choose 模式审核图：start → r1(choose 两选项) → a/b 分支 → end
function chooseGraph(interaction: string, options: Array<{ key: string; label: string }>): WorkflowGraph {
  const graph = g(
    [
      n('start', 'start'),
      n('r1', 'human-review', { payload: '{}', interaction, options }),
      n('a', 'delay', { durationMs: 1 }),
      n('b', 'delay', { durationMs: 1 }),
      n('end', 'end'),
    ],
    [['start', 'r1'], ['r1', 'a', 'branch'], ['r1', 'b', 'branch'], ['a', 'end'], ['b', 'end']]
  )
  graph.edges[1].branchId = options[0]?.key ?? 'a'
  graph.edges[2].branchId = options[1]?.key ?? 'b'
  return graph
}

// ==================== P1：校验器 ====================

describe('P1 校验器放行 review-choose 的 branch 边', () => {
  it('choose 模式 + 选项 branch 边 → 校验通过', () => {
    const graph = chooseGraph('choose', [{ key: 'optA', label: '选项A' }, { key: 'optB', label: '选项B' }])
    const result = validateGraph(graph)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('review 默认模式带 branch 边 → 仍报错（来源限制只对 choose 放开）', () => {
    const graph = chooseGraph('review', [{ key: 'optA', label: 'A' }, { key: 'optB', label: 'B' }])
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('branch'))).toBe(true)
  })

  it('choose 声明的选项缺出边 → 报错（防静默吞选项）', () => {
    const graph = chooseGraph('choose', [{ key: 'optA', label: 'A' }, { key: 'optB', label: 'B' }])
    graph.edges = graph.edges.filter(e => e.branchId !== 'optB') // 删 optB 的边
    // optB 分支无出边但 end 仍在——重新构造合法其余部分
    const result = validateGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('optB'))).toBe(true)
  })

  it('condition 的 branch 语义不回归', () => {
    const graph = g(
      [
        n('start', 'start'),
        n('c', 'condition', { branches: [{ branchId: 'b1', label: '一', conditions: [{ left: 'a', operator: 'eq', right: 'b' }] }], noMatchPolicy: 'fail' }),
        n('x', 'delay', { durationMs: 1 }),
        n('end', 'end'),
      ],
      [['start', 'c'], ['c', 'x', 'branch'], ['x', 'end']]
    )
    graph.edges[1].branchId = 'b1'
    expect(validateGraph(graph).valid).toBe(true)
  })
})

// ==================== choose 模式（引擎级） ====================

describe('choose 模式引擎执行', () => {
  const options = [{ key: 'optA', label: '选项A' }, { key: 'optB', label: '选项B' }]

  it('挂起后选择 optA → 走 optA 分支', async () => {
    const { engine, nodeRuns, runs } = makeEngine()
    const status = await exec2(engine, input(chooseGraph('choose', options)))
    expect(status).toBe('waiting_review')
    expect(nodeRuns.rowOf('r1')?.status).toBe('waiting_review')

    const applied = await runWithUser('u1', () => engine.resumeReview('run_1', 'r1', { decision: 'approve', choice: 'optA' } as any))
    expect(applied).toBe(true)
    await wait(50)
    expect(runs.final.status).toBe('succeeded')
    expect(nodeRuns.rowOf('a')?.status).toBe('succeeded') // optA 分支
    expect(nodeRuns.rowOf('b')).toBeUndefined() // optB 未走
    // decision 保持 approve，choice 为所选选项（语义分离）
    expect(nodeRuns.outputOf('r1')).toMatchObject({ decision: 'approve', choice: 'optA' })
  })

  it('选择 optB → 走 optB 分支', async () => {
    const { engine, nodeRuns } = makeEngine()
    await exec2(engine, input(chooseGraph('choose', options)))
    await runWithUser('u1', () => engine.resumeReview('run_1', 'r1', { decision: 'approve', choice: 'optB' } as any))
    await wait(50)
    expect(nodeRuns.rowOf('b')?.status).toBe('succeeded')
    expect(nodeRuns.rowOf('a')).toBeUndefined()
  })

  it('无效 choice（未声明选项）→ 拒绝，运行保持挂起', async () => {
    const { engine, runs } = makeEngine()
    await exec2(engine, input(chooseGraph('choose', options)))
    const applied = await runWithUser('u1', () => engine.resumeReview('run_1', 'r1', { decision: 'approve', choice: 'optX' } as any))
    expect(applied).toBe(false)
    await wait(30)
    expect(runs.final.status).toBe('waiting_review')
  })
})

// ==================== input 模式（P2） ====================

describe('input 模式（P2：output_result 自动放行白名单）', () => {
  function inputGraph(): WorkflowGraph {
    return g(
      [n('start', 'start'), n('r1', 'human-review', { payload: '请补充说明：', interaction: 'input' }), n('after', 'delay', { durationMs: 1 }), n('end', 'end')],
      [['start', 'r1'], ['r1', 'after', 'approve'], ['after', 'end']]
    )
  }

  it('用户提交文本 → output_result 进入输出，下游可引用', async () => {
    const { engine, nodeRuns, runs } = makeEngine()
    const status = await exec2(engine, input(inputGraph()))
    expect(status).toBe('waiting_review')
    // 未声明 editableFields——P2：input 模式自动放行 output_result
    const applied = await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'r1', { decision: 'approve_with_changes', editedValues: { output_result: '用户补充的内容' } } as any)
    )
    expect(applied).toBe(true)
    await wait(50)
    expect(runs.final.status).toBe('succeeded')
    expect(nodeRuns.outputOf('r1')).toMatchObject({ output_result: '用户补充的内容' })
  })

  it('review 模式未声明字段仍被过滤（白名单不回归）', async () => {
    const graph = g(
      [n('start', 'start'), n('r1', 'human-review', { payload: '审阅' }), n('end', 'end')],
      [['start', 'r1'], ['r1', 'end', 'approve']]
    )
    const { engine, nodeRuns } = makeEngine()
    await exec2(engine, input(graph))
    await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'r1', { decision: 'approve_with_changes', editedValues: { malicious: '注入' } } as any)
    )
    await wait(50)
    expect(nodeRuns.outputOf('r1')!.malicious).toBeUndefined()
  })
})
