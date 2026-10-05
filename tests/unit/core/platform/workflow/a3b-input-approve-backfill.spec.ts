/**
 * human-review input 模式直接批准的 output_result 回填测试（2026-10-05 C3 修复）
 * @module tests/unit/core/platform/workflow/a3b-input-approve-backfill
 * @description 场景：内置流（日记周报复盘/知识提炼存日记/周报生成器）的审核卡
 *              只有「批准/驳回」按钮（不带 editedValues）。此前 {{review.output_result}}
 *              解析为空 → save-diary/report 落空产物。修复：input 交互直接批准时
 *              output_result 从 payload.content 回填。
 *              同时锁定：用户改过（approve_with_changes）优先用户值；非 input 交互不回填。
 */
import { describe, it, expect } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { TASK_NODE_HANDLERS } from '@core/platform/workflow/nodes/task-nodes'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import { runWithUser } from '@core/context/user-context'

class FakeRuns {
  final: { status?: string } = {}
  patchRun(_id: string, p: Record<string, unknown>) { Object.assign(this.final, p) }
}
class FakeNodeRuns {
  rows = new Map<string, { output?: Record<string, unknown> }>()
  startNode(i: { runId: string; nodeId: string }) { this.rows.set(`${i.nodeId}|0`, {}) }
  patchNode(_r: string, nodeId: string, iter: number, p: { output?: Record<string, unknown> }) {
    Object.assign(this.rows.get(`${nodeId}|${iter}`) ?? {}, p)
  }
  outputOf(nodeId: string) { return this.rows.get(`${nodeId}|0`)?.output }
}

function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS])
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id: string, p: Record<string, unknown>) => runs.patchRun(id, p) },
      nodeRuns: { startNode: (i: { runId: string; nodeId: string }) => nodeRuns.startNode(i), patchNode: nodeRuns.patchNode.bind(nodeRuns) },
      events: { emit: () => undefined },
    } as never,
    registry
  )
  return { engine, runs, nodeRuns }
}

let seq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as never }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string, string?]>): WorkflowGraph {
  return {
    version: 1, nodes,
    edges: edges.map(([s, t, k]) => ({ id: `e${seq++}`, sourceNodeId: s, targetNodeId: t, kind: (k ?? 'normal') as never })),
  }
}
const input = (graph: WorkflowGraph): ExecuteRunInput =>
  ({ runId: 'run_1', userId: 'u1', definitionId: 'd1', graph, startInputs: {} })
const exec = (engine: WorkflowEngineService, i: ExecuteRunInput) => runWithUser('u1', () => engine.execute(i))
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** start → r1(human-review input, payload=上游文本占位) → end（approve 边） */
function inputGraph(): WorkflowGraph {
  return g(
    [n('start', 'start'), n('r1', 'human-review', { payload: '复盘正文内容', interaction: 'input' }), n('end', 'end')],
    [['start', 'r1'], ['r1', 'end', 'approve']]
  )
}

describe('input 模式直接批准 → output_result 回填（C3）', () => {
  it('直接批准（无 editedValues）→ output_result = payload 字符串', async () => {
    const { engine, nodeRuns } = makeEngine()
    const status = await exec(engine, input(inputGraph()))
    expect(status).toBe('waiting_review')

    await runWithUser('u1', () =>
      (engine as never as { resumeReview: (a: string, b: string, c: object) => Promise<boolean> })
        .resumeReview('run_1', 'r1', { decision: 'approve' })
    )
    await wait(50)
    expect(nodeRuns.outputOf('r1')).toMatchObject({ output_result: '复盘正文内容' })
  })

  it('修改后批准 → 用户值优先，不被回填覆盖', async () => {
    const { engine, nodeRuns } = makeEngine()
    await exec(engine, input(inputGraph()))
    await runWithUser('u1', () =>
      (engine as never as { resumeReview: (a: string, b: string, c: object) => Promise<boolean> })
        .resumeReview('run_1', 'r1', {
          decision: 'approve_with_changes',
          editedValues: { output_result: '用户改过的复盘' },
        })
    )
    await wait(50)
    expect(nodeRuns.outputOf('r1')).toMatchObject({ output_result: '用户改过的复盘' })
  })

  it('approve 交互（非 input）不回填 output_result', async () => {
    const { engine, nodeRuns } = makeEngine()
    const graph = g(
      [n('start', 'start'), n('r1', 'human-review', { payload: '审阅内容' }), n('end', 'end')],
      [['start', 'r1'], ['r1', 'end', 'approve']]
    )
    await exec(engine, input(graph))
    await runWithUser('u1', () =>
      (engine as never as { resumeReview: (a: string, b: string, c: object) => Promise<boolean> })
        .resumeReview('run_1', 'r1', { decision: 'approve' })
    )
    await wait(50)
    expect(nodeRuns.outputOf('r1')!.output_result).toBeUndefined()
  })
})
