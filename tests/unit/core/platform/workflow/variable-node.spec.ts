/**
 * 变量/数据表节点与服务测试（P0 片4）：变量 get/set（作用域/兜底）、数据表 insert（自动建表）/query/update/delete、目录契约
 * @module tests/workflow/variable-node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@core/platform/workflow/variables/variable-data.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/workflow/variables/variable-data.service')>()
  return {
    ...actual,
    getVariableDataService: vi.fn(),
    registerVariableDataService: vi.fn(),
  }
})

vi.mock('@core/platform/workflow/datasource/datasource.service', () => ({
  getDataSourceService: vi.fn(),
  registerDataSourceService: vi.fn(),
}))

import { VARIABLE_NODE_HANDLERS } from '@core/platform/workflow/nodes/variable-nodes'
import { getVariableDataService } from '@core/platform/workflow/variables/variable-data.service'
import { getDataSourceService } from '@core/platform/workflow/datasource/datasource.service'
import { VariableDataService } from '@core/platform/workflow/variables/variable-data.service'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

const svcMock = vi.mocked(getVariableDataService)
const dsMock = vi.mocked(getDataSourceService)
const [variableNode, dataTableNode] = VARIABLE_NODE_HANDLERS

const baseCtx = (config: Record<string, unknown>) =>
  ({ config, runId: 'run_1', nodeId: 'v1', signal: new AbortController().signal, logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} } }) as never

// ---- 内存假服务（直接 new VariableDataService + 假仓库） ----
class MemVars {
  rows: any[] = []
  async findByScopeAndKey(scope: string, key: string) { return this.rows.find(r => r.scope === scope && r.key === key) ?? null }
  async upsert(scope: string, key: string, valueJson: string) {
    const ex = this.rows.find(r => r.scope === scope && r.key === key)
    if (ex) { ex.valueJson = valueJson; return ex }
    const row = { id: 'v1', scope, key, valueJson }
    this.rows.push(row)
    return row
  }
  async list() { return this.rows }
  async delete() { return 1 }
}
class MemDefs {
  rows: any[] = []
  async findById(id: string) { return this.rows.find(r => r.id === id) ?? null }
  async findByName(name: string) { return this.rows.find(r => r.name === name) ?? null }
  async create(name: string, columnsJson: string) { const d = { id: `tbl_${this.rows.length + 1}`, name, columnsJson }; this.rows.push(d); return d }
}
class MemRows {
  rows: any[] = []
  seq = 0
  async insertRow(tableId: string, rowJson: string) { const r = { id: `row_${++this.seq}`, tableId, rowJson }; this.rows.push(r); return r }
  async listByTable(tableId: string) { return this.rows.filter(r => r.tableId === tableId) }
  async updateRow(id: string, rowJson: string) { const r = this.rows.find(x => x.id === id); if (r) r.rowJson = rowJson; return r ?? null }
  async findById(id: string) { return this.rows.find(r => r.id === id) ?? null }
  async deleteRow(id: string) { const i = this.rows.findIndex(r => r.id === id); if (i >= 0) this.rows.splice(i, 1); return i >= 0 ? 1 : 0 }
}

function setupSvc() {
  const vars = new MemVars()
  const defs = new MemDefs()
  const rows = new MemRows()
  const svc = new VariableDataService(vars as never, defs as never, rows as never)
  svcMock.mockReturnValue(svc as never)
  return { vars, defs, rows, svc }
}

describe('variable 节点', () => {
  beforeEach(() => { svcMock.mockReset() })

  it('set 写入（global 作用域）→ ok + 回显值', async () => {
    const { vars } = setupSvc()
    const r = await variableNode.execute(baseCtx({ op: 'set', scope: 'global', key: 'counter', value: '42' }))
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') expect(r.output.ok).toBe(true)
    expect(vars.rows[0]).toMatchObject({ scope: 'global', key: 'counter', valueJson: '"42"' })
  })

  it('get 读取：已有值返回；无值返回 defaultValue 兜底', async () => {
    const { vars } = setupSvc()
    await vars.upsert('global', 'name', '"张三"')
    const r1 = await variableNode.execute(baseCtx({ op: 'get', scope: 'global', key: 'name' }))
    if (r1.status === 'succeeded') expect(r1.output.value).toBe('张三')
    const r2 = await variableNode.execute(baseCtx({ op: 'get', scope: 'global', key: 'missing', defaultValue: '默认值' }))
    if (r2.status === 'succeeded') expect(r2.output.value).toBe('默认值')
  })

  it('validateConfig：缺 op/key 报错', () => {
    expect(variableNode.validateConfig({ op: 'get' } as never)).toEqual(expect.arrayContaining([expect.stringContaining('键')]))
    expect(variableNode.validateConfig({ op: 'x', key: 'k' } as never)).toEqual(expect.arrayContaining([expect.stringContaining('op')]))
  })
})

describe('data-table 节点', () => {
  beforeEach(() => { svcMock.mockReset(); dsMock.mockReset() })

  it('insert 自动建表 + 返回 tableId/rowId；query 全查', async () => {
    const { defs, rows } = setupSvc()
    const i = await dataTableNode.execute(baseCtx({ op: 'insert', tableName: '订单', row: '{"name":"a","qty":2}' }))
    expect(i.status).toBe('succeeded')
    if (i.status !== 'succeeded') return
    expect(defs.rows).toHaveLength(1)
    expect(defs.rows[0].name).toBe('订单')
    expect(rows.rows).toHaveLength(1)
    const q = await dataTableNode.execute(baseCtx({ op: 'query', tableId: i.output.tableId }))
    expect(q.status).toBe('succeeded')
    if (q.status === 'succeeded') {
      expect(q.output.rows).toEqual([{ id: rows.rows[0].id, name: 'a', qty: 2 }])
    }
  })

  it('update / delete 按 rowId 操作', async () => {
    const { rows } = setupSvc()
    const ins = await dataTableNode.execute(baseCtx({ op: 'insert', tableName: 'T', row: '{"v":1}' }))
    if (ins.status !== 'succeeded') return
    const rowId = ins.output.rowId
    const u = await dataTableNode.execute(baseCtx({ op: 'update', rowId, row: '{"v":99}' }))
    expect(u.status).toBe('succeeded')
    expect(JSON.parse(rows.rows[0].rowJson).v).toBe(99)
    const d = await dataTableNode.execute(baseCtx({ op: 'delete', rowId }))
    expect(d.status).toBe('succeeded')
    expect(rows.rows).toHaveLength(0)
  })

  it('row 非法 JSON → failed；update/delete 缺 rowId → failed', async () => {
    setupSvc()
    const bad = await dataTableNode.execute(baseCtx({ op: 'insert', tableName: 'T', row: 'not-json' }))
    expect(bad.status).toBe('failed')
    const noRowId = await dataTableNode.execute(baseCtx({ op: 'update', row: '{}' }))
    expect(noRowId.status).toBe('failed')
  })

  it('外部数据源模式：dataSourceId 已设 → 路由到数据源执行 SQL（参数化）', async () => {
    const fakeDs = {
      execute: vi.fn().mockResolvedValue({ columns: ['id', 'name'], rows: [{ id: 1, name: 'a' }], rowCount: 1, durationMs: 3 }),
    }
    dsMock.mockReturnValue(fakeDs as never)
    const r = await dataTableNode.execute(baseCtx({
      op: 'query', dataSourceId: 'ds_1', sql: 'SELECT * FROM t WHERE id=$1', params: '[1]',
    }))
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') {
      expect(r.output.rows).toEqual([{ id: 1, name: 'a' }])
      expect(r.output.columns).toEqual(['id', 'name'])
    }
    expect(fakeDs.execute).toHaveBeenCalledWith('ds_1', 'SELECT * FROM t WHERE id=$1', [1])
  })

  it('外部数据源模式：缺 SQL → failed；params 非法 JSON → failed；执行抛错 → failed 可重试', async () => {
    const fakeDs = { execute: vi.fn().mockRejectedValue(new Error('连接超时')) }
    dsMock.mockReturnValue(fakeDs as never)
    const noSql = await dataTableNode.execute(baseCtx({ op: 'query', dataSourceId: 'ds_1' }))
    expect(noSql.status).toBe('failed')
    const badParams = await dataTableNode.execute(baseCtx({ op: 'query', dataSourceId: 'ds_1', sql: 'SELECT 1', params: 'not-json' }))
    expect(badParams.status).toBe('failed')
    const throwing = await dataTableNode.execute(baseCtx({ op: 'query', dataSourceId: 'ds_1', sql: 'SELECT 1' }))
    expect(throwing.status).toBe('failed')
    if (throwing.status === 'failed') expect(throwing.retryable).toBe(true)
  })
})

describe('目录契约', () => {
  it('catalog 含 variable/data-table 且 requiredConfigKeys 正确', () => {
    expect(NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['variable']].requiredConfigKeys).toEqual(['op', 'key'])
    expect(NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['data-table']].requiredConfigKeys).toEqual(['op'])
  })
})
