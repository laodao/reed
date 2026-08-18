/**
 * C3 override 测试：configOverrides 一次性覆盖节点配置（不改定义、不入库）
 * @module tests/workflow/c3-override
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@core/services/knowledge-base.service', () => ({ KnowledgeService: class {} }))
vi.mock('@core/services/ai-call', () => ({ callAIStream: vi.fn(), callVLM: vi.fn(), toImageDataUrl: vi.fn() }))
import { WorkflowRunService } from '@core/modules/workflow/workflow-run.service'
import { WorkflowEngineService } from '@core/modules/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/modules/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/modules/workflow/nodes/control-nodes'
import { TASK_NODE_HANDLERS } from '@core/modules/workflow/nodes/task-nodes'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import type { WorkflowNodeHandler } from '@core/modules/workflow/engine/node-handler'
import { runWithUser } from '@core/context/user-context'

// ---- 捕获 config 的探针节点 ----
const probeCalls: Array<Record<string, unknown>> = []
const probe: WorkflowNodeHandler = {
  type: 'probe' as any,
  controlKind: 'task',
  cancellable: false,
  outputSchema: [],
  validateConfig: () => [],
  async execute(ctx) {
    probeCalls.push(ctx.config)
    return { status: 'succeeded', output: { seen: ctx.config } }
  },
}

// ---- 内存假仓库（与 run-service.spec 同构） ----
class MemRuns {
  rows: Map<string, any> = new Map()
  seq = 0
  async create(i: any) {
    const id = `r${++this.seq}`
    this.rows.set(id, { id, userId: 'u1', status: 'pending', ...i, createdAt: new Date() })
    return this.rows.get(id)
  }
  async getById(id: string) { return this.rows.get(id) ?? null }
  async update(id: string, patch: any) {
    const row = this.rows.get(id)
    if (row) Object.assign(row, patch)
    return row
  }
  async findMutexHolders(defId: string) {
    return [...this.rows.values()].filter((r: any) => r.definitionId === defId && ['pending', 'running', 'waiting_review'].includes(r.status))
  }
  async listByDefinition() { return { items: [], total: 0 } }
}
class MemNodeRuns {
  rows: any[] = []
  async start(i: any) { this.rows.push({ ...i, status: 'running' }) }
  async update(runId: string, nodeId: string, iter: number, patch: any) {
    const row = this.rows.find(r => r.runId === runId && r.nodeId === nodeId && r.iterationIndex === iter)
    if (row) Object.assign(row, patch)
  }
}
class MemDefinitions {
  rows: Map<string, any> = new Map()
  async getById(id: string) { return this.rows.get(id) ?? null }
}

function setup() {
  const runs = new MemRuns()
  const nodeRuns = new MemNodeRuns()
  const definitions = new MemDefinitions()
  const events: any[] = []
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS, probe])
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id, p) => runs.update(id, p).then(() => undefined) },
      nodeRuns: { startNode: i => nodeRuns.start(i), patchNode: (r, n, it, p) => nodeRuns.update(r, n, it, p) },
      events: { emit: (e: any) => events.push(e) },
    } as any,
    registry
  )
  const service = new WorkflowRunService({ runs: runs as any, nodeRuns: nodeRuns as any, definitions: definitions as any, engine })
  return { service, runs, nodeRuns, definitions, events }
}

let seq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as any }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string]>): WorkflowGraph {
  return { version: 1, nodes, edges: edges.map(([s, t]) => ({ id: `e${seq++}`, sourceNodeId: s, targetNodeId: t, kind: 'normal' as any })) }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

function setupDef(definitions: MemDefinitions, graph: WorkflowGraph) {
  definitions.rows.set('d1', { id: 'd1', name: 'wf', publishedGraph: graph, draftGraph: graph, publishedVersion: 1, settings: null })
}

describe('C3 override：configOverrides 一次性配置覆盖', () => {
  it('override 覆盖生效且不修改定义图', async () => {
    const { service, runs, definitions } = setup()
    const graph = g([n('start', 'start'), n('p', 'probe', { topic: '原始', extra: '保留' }), n('end', 'end')], [['start', 'p'], ['p', 'end']])
    setupDef(definitions, graph)

    await runWithUser('u1', () =>
      service.startRun({
        definitionId: 'd1',
        triggerType: 'manual' as any,
        inputs: {},
        configOverrides: { p: { topic: '覆盖后的' } },
      })
    )
    await wait(80)

    // 覆盖生效 + 未覆盖键保留（浅合并语义）
    expect(probeCalls.at(-1)).toMatchObject({ topic: '覆盖后的', extra: '保留' })
    // 定义图未被改动（一次性实验）
    expect(definitions.rows.get('d1')!.publishedGraph.nodes.find((x: any) => x.id === 'p')!.config.topic).toBe('原始')
    expect(runs.rows.get('r1')!.status).toBe('succeeded')
  })

  it('无 override 时行为与原先一致（零回归）', async () => {
    const { service, runs, definitions } = setup()
    const graph = g([n('start', 'start'), n('p', 'probe', { topic: '原始' }), n('end', 'end')], [['start', 'p'], ['p', 'end']])
    setupDef(definitions, graph)
    await runWithUser('u1', () => service.startRun({ definitionId: 'd1', triggerType: 'manual' as any, inputs: {} }))
    await wait(80)
    expect(probeCalls.at(-1)).toMatchObject({ topic: '原始' })
    expect(runs.rows.get('r1')!.status).toBe('succeeded')
  })

  it('override 值支持模板引用 start 输入', async () => {
    const { service, definitions } = setup()
    const graph = g([n('start', 'start', { inputs: [] }), n('p', 'probe', { topic: 'x' }), n('end', 'end')], [['start', 'p'], ['p', 'end']])
    setupDef(definitions, graph)
    await runWithUser('u1', () =>
      service.startRun({
        definitionId: 'd1',
        triggerType: 'manual' as any,
        inputs: { q: 'hello' },
        configOverrides: { p: { topic: '前缀-{{start.q}}' } },
      })
    )
    await wait(80)
    expect(probeCalls.at(-1)).toMatchObject({ topic: '前缀-hello' })
  })
})
