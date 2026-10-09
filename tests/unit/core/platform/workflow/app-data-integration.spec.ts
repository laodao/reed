/**
 * 应用数据层·引擎级集成测试（2026-10-08 P1 验收补全）
 * @module tests/workflow/app-data-integration
 * @description 与单测的区别：真实 WorkflowEngineService 跑完整图（模板解析 → data-table 节点
 *              → VariableDataService → 内存仓储），验证单元测试覆盖不到的运行时链路：
 *              - {{start.*}} 模板解析进 row JSON
 *              - app 作用域经 ExecuteRunInput.definitionId → ctx.definitionId → 属主解析
 *              - createTable → upsert → query 的「增量更新」骨架在图执行下成立
 *              （设计 §8 P1 验收：非一次性应用的最小闭环）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { TASK_NODE_HANDLERS } from '@core/platform/workflow/nodes/task-nodes'
import { VARIABLE_NODE_HANDLERS } from '@core/platform/workflow/nodes/variable-nodes'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import {
  VariableDataService,
  registerVariableDataService,
  resetVariableDataService,
} from '@core/platform/workflow/variables/variable-data.service'

// ---- 引擎依赖：假投影（与 a3-review.spec 同款） ----
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
}

// ---- 内存仓储（实现服务层 repo 契约；含唯一索引语义） ----
function makeRepos() {
  const defs: any[] = []
  const rows: any[] = []
  let seq = 0
  return {
    defs, rows,
    defRepo: {
      async findById(id: string) { return defs.find(d => d.id === id) ?? null },
      async findByName(name: string) { return defs.find(d => d.name === name && (d.scope ?? 'workflow') === 'workflow') ?? null },
      async findByScopeAndName(scope: string, ownerId: string | null, name: string) {
        if (scope === 'app') return defs.find(d => d.name === name && d.scope === 'app' && d.ownerId === ownerId) ?? null
        return defs.find(d => d.name === name && (d.scope ?? 'workflow') === 'workflow') ?? null
      },
      async create(name: string, columnsJson: string, extra?: any) {
        const d = { id: `tbl_${++seq}`, name, columnsJson, scope: extra?.scope ?? 'workflow', ownerId: extra?.ownerId ?? null, dedupKeysJson: extra?.dedupKeysJson ?? null, createdAt: null, updatedAt: null }
        defs.push(d)
        return d
      },
      async listByScopeOwner(scope: string, ownerId: string | null) {
        return scope === 'app' ? defs.filter(d => d.scope === 'app' && d.ownerId === ownerId) : defs.filter(d => (d.scope ?? 'workflow') === 'workflow')
      },
      async countByOwner(ownerId: string) { return defs.filter(d => d.scope === 'app' && d.ownerId === ownerId).length },
      async delete(id: string) { const i = defs.findIndex(d => d.id === id); if (i >= 0) defs.splice(i, 1); return 1 },
    },
    rowRepo: {
      async insertRow(tableId: string, rowJson: string, dedupHash?: string | null) {
        if (dedupHash && rows.some(r => r.tableId === tableId && r.dedupHash === dedupHash)) {
          throw new Error('UNIQUE constraint failed: wf_data_table_rows.table_id, wf_data_table_rows.dedup_hash')
        }
        const r = { id: `row_${++seq}`, tableId, rowJson, dedupHash: dedupHash ?? null, createdAt: null, updatedAt: null }
        rows.push(r)
        return r
      },
      async listByTable(tableId: string) { return rows.filter(r => r.tableId === tableId).reverse() },
      async findByTableAndHash(tableId: string, h: string) { return rows.find(r => r.tableId === tableId && r.dedupHash === h) ?? null },
      async countByTable(tableId: string) { return rows.filter(r => r.tableId === tableId).length },
      async updateRow(id: string, rowJson: string) { const r = rows.find(x => x.id === id); if (r) r.rowJson = rowJson; return r ?? null },
      async findById(id: string) { return rows.find(r => r.id === id) ?? null },
      async deleteRow(id: string) { const i = rows.findIndex(r => r.id === id); if (i >= 0) rows.splice(i, 1); return i >= 0 ? 1 : 0 },
      async deleteByTable(tableId: string) { const n = rows.filter(r => r.tableId === tableId).length; for (let i = rows.length - 1; i >= 0; i--) if (rows[i].tableId === tableId) rows.splice(i, 1); return n },
    },
  }
}

function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS, ...VARIABLE_NODE_HANDLERS])
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id: string, p: any) => runs.patchRun(id, p) },
      nodeRuns: { startNode: (i: any) => nodeRuns.startNode(i), patchNode: (r: string, n: string, it: number, p: any) => nodeRuns.patchNode(r, n, it, p) },
      events: { emit: () => {} },
    } as any,
    registry,
  )
  return { engine, runs, nodeRuns }
}

let edgeSeq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as any }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string]>): WorkflowGraph {
  return {
    version: 1, nodes,
    edges: edges.map(([s, t]) => ({ id: `e${edgeSeq++}`, sourceNodeId: s, targetNodeId: t, kind: 'normal' as any })),
  }
}

describe('应用数据层·引擎级集成：createTable → upsert 增量 → query', () => {
  let svc: VariableDataService
  let repos: ReturnType<typeof makeRepos>

  beforeEach(() => {
    repos = makeRepos()
    svc = new VariableDataService({ findByScopeAndKey: async () => null, upsert: async () => null, list: async () => [], deleteByScope: async () => 0, delete: async () => 0 } as any, repos.defRepo as any, repos.rowRepo as any)
    registerVariableDataService(svc)
  })
  afterEach(() => resetVariableDataService())

  const GRAPH = () => g(
    [
      n('start', 'start'),
      n('create', 'data-table', {
        op: 'createTable', scope: 'app', tableName: '商品价格',
        columns: JSON.stringify([{ key: 'url', type: 'string' }, { key: 'name', type: 'string' }, { key: 'price', type: 'number' }, { key: 'date', type: 'string' }]),
        dedupKeys: 'url,date',
      }),
      n('up1', 'data-table', {
        op: 'upsert', scope: 'app', tableName: '商品价格',
        row: '{"url":"{{start.url}}","name":"{{start.name}}","price":"{{start.price}}","date":"2026-10-08"}',
      }),
      n('up2', 'data-table', {
        op: 'upsert', scope: 'app', tableName: '商品价格',
        row: '{"url":"https://static/other","name":"固定行","price":7,"date":"2026-10-08"}',
      }),
      n('q', 'data-table', { op: 'query', scope: 'app', tableName: '商品价格', filterContains: '{{start.name}}' }),
      n('end', 'end'),
    ],
    [['start', 'create'], ['create', 'up1'], ['up1', 'up2'], ['up2', 'q'], ['q', 'end']],
  )

  it('图先过 validateGraph（模板占位在 row JSON 字符串内合法）', () => {
    expect(validateGraph(GRAPH()).valid).toBe(true)
  })

  it('真实引擎跑全图：模板解析进 row、app 作用域挂 definitionId、upsert 幂等、query 过滤', async () => {
    const { engine, runs, nodeRuns } = makeEngine()
    const input: ExecuteRunInput = {
      runId: 'run_it1', userId: 'u1', definitionId: 'def_demo_app', graph: GRAPH(),
      startInputs: { url: 'https://shop/item-9', name: '无线耳机', price: '199.5' },
    }
    await engine.execute(input)

    // 运行成功
    expect(runs.final.status).toBe('succeeded')

    // createTable：app 作用域，owner=definitionId
    const createOut = nodeRuns.outputOf('create')
    expect(createOut.created).toBe(true)
    const def = repos.defs[0]
    expect(def).toMatchObject({ scope: 'app', ownerId: 'def_demo_app', name: '商品价格' })

    // up1：{{start.*}} 已解析；number 列 "199.5"→199.5；行挂 dedup hash
    expect(nodeRuns.outputOf('up1').action).toBe('inserted')
    const row1 = JSON.parse(repos.rows.find((r: any) => JSON.parse(r.rowJson).name === '无线耳机').rowJson)
    expect(row1).toEqual({ url: 'https://shop/item-9', name: '无线耳机', price: 199.5, date: '2026-10-08' })

    // query：按 start.name 过滤 → 只命中 1 行（total=1，静态行被排除）
    const qOut = nodeRuns.outputOf('q')
    expect(qOut.total).toBe(1)
    expect(qOut.rows[0]).toMatchObject({ name: '无线耳机', price: 199.5 })
  })

  it('同 start 输入再跑一次（模拟 cron/第二次运行）：upsert 全部 updated，行数不涨（非一次性语义）', async () => {
    {
      const { engine } = makeEngine()
      await engine.execute({ runId: 'run_it2', userId: 'u1', definitionId: 'def_demo_app', graph: GRAPH(), startInputs: { url: 'https://shop/item-9', name: '无线耳机', price: '199.5' } })
    }
    const { engine, nodeRuns } = makeEngine()
    await engine.execute({ runId: 'run_it3', userId: 'u1', definitionId: 'def_demo_app', graph: GRAPH(), startInputs: { url: 'https://shop/item-9', name: '无线耳机', price: '250' } })

    expect(nodeRuns.outputOf('create').created).toBe(false) // 幂等重入
    expect(nodeRuns.outputOf('up1').action).toBe('updated')
    expect(nodeRuns.outputOf('up2').action).toBe('updated')
    expect(repos.rows).toHaveLength(2) // 两条数据，不随运行次数增长
    const row1 = JSON.parse(repos.rows.find((r: any) => JSON.parse(r.rowJson).name === '无线耳机').rowJson)
    expect(row1.price).toBe(250) // 覆盖为新值
  })

  it('同名表挂在另一个 definition 下互不可见（应用隔离）', async () => {
    const { engine: e1 } = makeEngine()
    await e1.execute({ runId: 'run_it4', userId: 'u1', definitionId: 'def_app_a', graph: GRAPH(), startInputs: { url: 'u1', name: 'A 商品', price: '1' } })
    const { engine: e2, nodeRuns } = makeEngine()
    await e2.execute({ runId: 'run_it5', userId: 'u1', definitionId: 'def_app_b', graph: GRAPH(), startInputs: { url: 'u1', name: 'B 商品', price: '2' } })

    expect(repos.defs.filter((d: any) => d.name === '商品价格')).toHaveLength(2) // 两个属主各一张
    // B 应用的 query 只看到自己的行
    expect(nodeRuns.outputOf('q').total).toBe(1)
    expect(nodeRuns.outputOf('q').rows[0].name).toBe('B 商品')
  })
})
