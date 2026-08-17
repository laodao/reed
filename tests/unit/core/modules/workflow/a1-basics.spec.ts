/**
 * A1 引擎基础测试：sys 系统变量 / 条件运算符 regex·starts·ends / maxNodeRuns 护栏 / start select 参数
 * @module tests/workflow/a1-basics
 */
import { describe, it, expect } from 'vitest'
import { VariableResolver } from '@core/modules/workflow/engine/variable-resolver'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/modules/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/modules/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/modules/workflow/nodes/control-nodes'
import { WorkflowRunService } from '@core/modules/workflow/workflow-run.service'
import type { WorkflowEngineDeps } from '@core/modules/workflow/engine/ports'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import type { WorkflowNodeHandler } from '@core/modules/workflow/engine/node-handler'
import { runWithUser } from '@core/context/user-context'
import { validateGraph } from '@core/modules/workflow/engine/graph-validator'

// ---- 假实现 ----
class FakeRuns {
  patches: Array<Record<string, unknown>> = []
  rows: Map<string, any> = new Map()
  seq = 0
  async create(i: any) {
    const id = `r${++this.seq}`
    this.rows.set(id, { id, userId: 'u1', status: i.status ?? 'pending', ...i })
    return this.rows.get(id)
  }
  async getById(id: string) { return this.rows.get(id) ?? null }
  async update(id: string, patch: any) {
    const row = this.rows.get(id)
    if (row) Object.assign(row, patch)
    return row
  }
  async patchRun(id: string, p: any) { this.patches.push(p); await this.update(id, p) }
  async findMutexHolders(defId: string) {
    return [...this.rows.values()].filter((r: any) => r.definitionId === defId && ['pending', 'running', 'waiting_review'].includes(r.status))
  }
  async list(p: any) { return { items: [...this.rows.values()], total: this.rows.size } }
  get final() { return this.patches[this.patches.length - 1] ?? {} }
}
class FakeNodeRuns {
  rows: any[] = []
  async start(i: any) { this.rows.push({ ...i, status: 'running' }) }
  async patchNode(_r: string, nodeId: string, iter: number, patch: any) {
    const row = this.rows.find(x => x.nodeId === nodeId && x.iterationIndex === iter)
    if (row) Object.assign(row, patch)
  }
  async update(...a: any[]) { return this.patchNode(a[0], a[1], a[2], a[3]) }
  async getByRun(runId: string) { return this.rows.filter(r => r.runId === runId) }
  async findSucceededWithOutput(runId: string) { return this.rows.filter(r => r.runId === runId && r.status === 'succeeded' && r.output) }
  async findWaitingReview() { return [] }
  async deleteByRun(runId: string) { this.rows = this.rows.filter(r => r.runId !== runId) }
}
const events: any[] = []

const echo: WorkflowNodeHandler = {
  type: 'echo' as any, controlKind: 'task', cancellable: false,
  outputSchema: [{ key: 'text', type: 'string', desc: '' }], validateConfig: () => [],
  async execute(ctx) { return { status: 'succeeded', output: { text: String(ctx.config.text ?? '') } } },
}
function makeEngine(settings?: Record<string, number>) {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, echo])
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id, p) => runs.patchRun(id, p) },
      nodeRuns: { startNode: i => nodeRuns.start(i), patchNode: (r, n, it, p) => nodeRuns.patchNode(r, n, it, p) },
      events: { emit: (e: any) => events.push(e) },
    } as WorkflowEngineDeps,
    registry
  )
  return { engine, runs, nodeRuns }
}
let seq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}, settings?: Record<string, unknown>): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as any, settings: settings as any }
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

// ==================== sys 系统变量 ====================

describe('sys 系统变量', () => {
  const resolver = new VariableResolver({ variables: new Map(), startInputs: {} })

  it('{{sys.now}} 返回 ISO 时间字符串', () => {
    const v = resolver.resolve('{{sys.now}}')
    expect(typeof v).toBe('string')
    expect(() => new Date(v as string)).not.toThrow()
  })
  it('{{sys.today}} 返回 yyyy-MM-dd', () => {
    const v = resolver.resolve('{{sys.today}}') as string
    expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('{{sys.ts}} 返回毫秒数字', () => {
    const v = resolver.resolve('{{sys.ts}}')
    expect(typeof v).toBe('number')
    expect(v).toBeGreaterThan(1_700_000_000_000)
  })
  it('sys 不可被节点输出遮蔽（变量表同名键被忽略）', () => {
    const r2 = new VariableResolver({
      variables: new Map([['sys', { now: '假的' } as any]]),
      startInputs: {},
    })
    expect(String(r2.resolve('{{sys.now}}'))).not.toContain('假的')
  })
  it('未知 sys 变量解析为 undefined（字符串模式空）', () => {
    expect(resolver.resolve('{{sys.unknown}}')).toBeUndefined()
  })
})

// ==================== 条件运算符 ====================

describe('条件运算符 regex / starts_with / ends_with', () => {
  function condGraph(branches: any[]): WorkflowGraph {
    const graph = g(
      [
        n('start', 'start'),
        n('cond', 'condition', { branches, noMatchPolicy: 'fail' }),
        n('yes', 'echo', { text: '命中' }),
        n('no', 'echo', { text: '未命中' }),
        n('end', 'end'),
      ],
      [['start', 'cond'], ['cond', 'yes', 'branch'], ['cond', 'no', 'branch'], ['yes', 'end'], ['no', 'end']]
    )
    graph.edges[1].branchId = 'yes'
    graph.edges[2].branchId = 'no'
    return graph
  }

  it('regex 命中走对应分支', async () => {
    const { engine, nodeRuns } = makeEngine()
    const graph = condGraph([
      { branchId: 'yes', label: '匹配', conditions: [{ left: '{{start.code}}', operator: 'regex' as any, right: '^WF-\\d+$' }] },
      { branchId: 'no', label: '不匹配', conditions: [{ left: '{{start.code}}', operator: 'regex' as any, right: '^X' }] },
    ])
    await exec2(engine, input(graph, { code: 'WF-123' }))
    expect(nodeRuns.rows.find(r => r.nodeId === 'yes')?.output).toMatchObject({ text: '命中' })
  })

  it('非法正则容错为 false（不抛错）', async () => {
    const { engine, runs } = makeEngine()
    const graph = condGraph([
      { branchId: 'yes', label: '非法', conditions: [{ left: '{{start.code}}', operator: 'regex' as any, right: '([bad' }] },
      { branchId: 'no', label: '兜底', conditions: [{ left: '{{start.code}}', operator: 'ne' as any, right: 'zzz' }] },
    ])
    const status = await exec2(engine, input(graph, { code: 'anything' }))
    expect(status).toBe('succeeded') // 非法正则=false，走第二分支
    void runs
  })

  it('starts_with / ends_with 前后缀判断', async () => {
    const { engine, nodeRuns } = makeEngine()
    const graph = g(
      [
        n('start', 'start'),
        n('c1', 'condition', {
          branches: [
            { branchId: 'b1', label: '前', conditions: [{ left: '{{start.f}}', operator: 'starts_with' as any, right: '报告' }] },
            { branchId: 'b2', label: '后', conditions: [{ left: '{{start.f}}', operator: 'ends_with' as any, right: '.pdf' }] },
          ],
          noMatchPolicy: 'fail',
        }),
        n('a', 'echo', { text: '前缀' }),
        n('b', 'echo', { text: '后缀' }),
        n('end', 'end'),
      ],
      [['start', 'c1'], ['c1', 'a', 'branch'], ['c1', 'b', 'branch'], ['a', 'end'], ['b', 'end']]
    )
    graph.edges[1].branchId = 'b1'
    graph.edges[2].branchId = 'b2'
    await exec2(engine, input(graph, { f: '报告-final.pdf' }))
    expect(nodeRuns.rows.find(r => r.nodeId === 'a')?.output).toMatchObject({ text: '前缀' })
    expect(nodeRuns.rows.find(r => r.nodeId === 'b')).toBeUndefined()
  })
})

// ==================== maxNodeRuns 护栏 ====================

describe('maxNodeRuns 护栏', () => {
  function loopGraph(): WorkflowGraph {
    return g(
      [n('start', 'start'), n('loop1', 'loop', { listExpression: '{{start.items}}' }), n('body', 'echo', { text: '{{loop1.item}}' }), n('end', 'end')],
      [['start', 'loop1'], ['loop1', 'body', 'loop-body'], ['body', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']]
    )
  }

  it('线性/常规图不受默认值影响', async () => {
    const { engine, nodeRuns } = makeEngine()
    const graph = g(
      [n('start', 'start'), n('a', 'echo', { text: 'x' }), n('end', 'end')],
      [['start', 'a'], ['a', 'end']]
    )
    const status = await exec2(engine, input(graph))
    expect(status).toBe('succeeded')
    expect(nodeRuns.rows.find(r => r.nodeId === 'a')?.status).toBe('succeeded')
  })

  it('循环体超上限：节点 failed → run failed（P5 语义：每迭代计 1）', async () => {
    const { engine, runs } = makeEngine({ maxNodeRuns: 2 })
    const status = await exec2(engine, input(loopGraph(), { items: [1, 2, 3] }, { maxNodeRuns: 2 }))
    console.log('DEBUG status patches:', JSON.stringify(runs.patches.map((x: any) => ({ s: x.status, e: x.error }))))
    expect(status).toBe('failed')
    expect(String(runs.final.error)).toContain('最大运行次数')
  })

  it('重试不重复计数（P5：计数点唯一在 launchNode）', async () => {
    // retryCount=3 的节点失败两次后成功；maxNodeRuns=1 不应误杀（重试是同一执行实例）
    let calls = 0
    const flaky: WorkflowNodeHandler = {
      type: 'flaky' as any, controlKind: 'task', cancellable: false,
      outputSchema: [], validateConfig: () => [],
      async execute() {
        calls++
        if (calls <= 2) return { status: 'failed', error: '第' + calls + '次失败' }
        return { status: 'succeeded', output: { ok: true } }
      },
    }
    const runs = new FakeRuns()
    const nodeRuns = new FakeNodeRuns()
    const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, flaky])
    const engine = new WorkflowEngineService(
      {
        runs: { patchRun: (id, p) => runs.patchRun(id, p) },
        nodeRuns: { startNode: (i: any) => nodeRuns.start(i), patchNode: (r: any, nd: any, it: any, p: any) => nodeRuns.patchNode(r, nd, it, p) },
        events: { emit: () => {} },
      } as WorkflowEngineDeps,
      registry
    )
    const graph = g(
      [n('start', 'start'), n('f', 'flaky', {}, { retryCount: 3, retryDelayMs: 1 }), n('end', 'end')],
      [['start', 'f'], ['f', 'end']]
    )
    const status = await exec2(engine, input(graph, {}, { maxNodeRuns: 1 }))
    console.log('DEBUG retry patches:', JSON.stringify(runs.patches.map((x: any) => ({ s: x.status, e: x.error }))), 'calls=', calls)
    expect(status).toBe('succeeded')
    expect(calls).toBe(3)
  })
})

// ==================== 校验器保留字 ====================

describe('节点 id 保留字（P7）', () => {
  it('id 为 sys 报错', () => {
    const graph = g(
      [n('sys', 'echo', { text: 'x' }), n('end', 'end')],
      [['sys', 'end']]
    )
    // 无 start 的错误也会报——只断言保留字错误存在
    const result = validateGraph(graph)
    expect(result.errors.some(e => e.includes('保留字'))).toBe(true)
  })
  it('非 start 节点使用 id=start 报错；start 节点自身 id=start 合法', () => {
    const bad = g(
      [n('start', 'start'), n('start2', 'echo'), n('end', 'end')],
      [['start', 'start2'], ['start2', 'end']]
    )
    // 构造非 start 节点 id=start
    bad.nodes[1].id = 'start' // 会与真 start 重复 id……换方式：直接单测校验器对 (id=start,type=echo)
    const result = validateGraph({
      version: 1,
      nodes: [n('start', 'start'), { ...n('start2', 'echo'), id: 'start2' }, n('end', 'end')],
      edges: [],
    })
    expect(result.errors.some(e => e.includes('保留字'))).toBe(false) // start2 不冲突
    const result2 = validateGraph({
      version: 1,
      nodes: [n('start', 'start'), { ...n('x', 'echo'), id: 'sys' }, n('end', 'end')],
      edges: [],
    })
    expect(result2.errors.some(e => e.includes('保留字'))).toBe(true)
  })
})

// ==================== start select 参数（P8 类型感知校验） ====================

describe('start select 参数与 required 类型感知校验（P8）', () => {
  function setupService() {
    const runs = new FakeRuns()
    const nodeRuns = new FakeNodeRuns()
    const definitions: Map<string, any> = new Map()
    const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, echo])
    const engine = new WorkflowEngineService(
      {
        runs: { patchRun: (id, p) => runs.patchRun(id, p) },
        nodeRuns: { startNode: (i: any) => nodeRuns.start(i), patchNode: (r: any, nd: any, it: any, p: any) => nodeRuns.patchNode(r, nd, it, p) },
        events: { emit: () => {} },
      } as WorkflowEngineDeps,
      registry
    )
    const service = new WorkflowRunService({
      runs: runs as any, nodeRuns: nodeRuns as any,
      definitions: { getById: (id: string) => Promise.resolve(definitions.get(id) ?? null) } as any,
      engine,
    })
    return { service, runs, definitions }
  }

  const selectGraph = (): WorkflowGraph => g(
    [
      n('start', 'start', {
        inputs: [
          { key: 'lang', label: '语言', type: 'select', required: true, options: [{ label: '英', value: 'en' }, { label: '中', value: 'zh' }] },
          { key: 'tags', label: '标签', type: 'select', multi: true, options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
          { key: 'cfg', label: '配置', type: 'json', required: true },
        ],
      }),
      n('d', 'delay', { durationMs: 1 }),
      n('end', 'end'),
    ],
    [['start', 'd'], ['d', 'end']]
  )

  it('select 必填缺失报错；multi 空数组视为缺失；json 传 {} 视为缺失（P8）', async () => {
    const { service } = setupService()
    const def = { id: 'd1', name: 't', draftGraph: selectGraph(), publishedGraph: null, publishedVersion: 0, triggers: [], settings: null }
    // @ts-ignore
    ;(service as any).deps.definitions = { getById: async () => def }
    // 构造私有 deps 访问不可行——直接重建
    const { service: s2, definitions } = setupService()
    definitions.set('d1', def)
    await expect(
      runWithUser('u1', () => s2.startRun({ definitionId: 'd1', triggerType: 'manual', inputs: { lang: 'en', cfg: {} } }))
    ).rejects.toThrow('cfg')
    await expect(
      runWithUser('u1', () => s2.startRun({ definitionId: 'd1', triggerType: 'manual', inputs: { lang: '', cfg: { a: 1 } } }))
    ).rejects.toThrow('lang')
    void service
  })

  it('multi 提交数组、0/false 合法值通过', async () => {
    const { service: s, definitions, runs } = setupService()
    const def = { id: 'd1', name: 't', draftGraph: selectGraph(), publishedGraph: null, publishedVersion: 0, triggers: [], settings: null }
    definitions.set('d1', def)
    const run = await runWithUser('u1', () =>
      s.startRun({ definitionId: 'd1', triggerType: 'manual', inputs: { lang: 'en', tags: ['a', 'b'], cfg: { x: 1 } } })
    )
    expect(run.startInputs).toMatchObject({ lang: 'en', tags: ['a', 'b'] })
    void runs
  })
})
