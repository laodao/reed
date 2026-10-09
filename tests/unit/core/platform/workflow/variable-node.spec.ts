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
  async deleteByScope(scope: string) { const n = this.rows.filter(r => r.scope === scope).length; this.rows = this.rows.filter(r => r.scope !== scope); return n }
  async delete() { return 1 }
}
class MemDefs {
  rows: any[] = []
  async findById(id: string) { return this.rows.find(r => r.id === id) ?? null }
  async findByName(name: string) {
    // 历史语义：全局命名空间（scope 为空或 workflow）
    return this.rows.find(r => r.name === name && (r.scope ?? 'workflow') === 'workflow') ?? null
  }
  async findByScopeAndName(scope: string, ownerId: string | null, name: string) {
    if (scope === 'app') return this.rows.find(r => r.name === name && r.scope === 'app' && r.ownerId === ownerId) ?? null
    return this.rows.find(r => r.name === name && (r.scope ?? 'workflow') === 'workflow') ?? null
  }
  async create(name: string, columnsJson: string, extra?: { scope?: string; ownerId?: string | null; dedupKeysJson?: string | null }) {
    const d = { id: `tbl_${this.rows.length + 1}`, name, columnsJson, scope: extra?.scope ?? 'workflow', ownerId: extra?.ownerId ?? null, dedupKeysJson: extra?.dedupKeysJson ?? null, createdAt: null, updatedAt: null }
    this.rows.push(d)
    return d
  }
  async listByScopeOwner(scope: string, ownerId: string | null) {
    if (scope === 'app') return this.rows.filter(r => r.scope === 'app' && r.ownerId === ownerId)
    return this.rows.filter(r => (r.scope ?? 'workflow') === 'workflow')
  }
  async countByOwner(ownerId: string) { return this.rows.filter(r => r.scope === 'app' && r.ownerId === ownerId).length }
  async delete(id: string) { const i = this.rows.findIndex(r => r.id === id); if (i >= 0) this.rows.splice(i, 1); return 1 }
}
class MemRows {
  rows: any[] = []
  seq = 0
  /** 模拟 (table_id, dedup_hash) 唯一索引 */
  strictUnique = true
  async insertRow(tableId: string, rowJson: string, dedupHash?: string | null) {
    if (dedupHash && this.strictUnique && this.rows.some(r => r.tableId === tableId && r.dedupHash === dedupHash)) {
      throw new Error('UNIQUE constraint failed: wf_data_table_rows.table_id, wf_data_table_rows.dedup_hash')
    }
    const r = { id: `row_${++this.seq}`, tableId, rowJson, dedupHash: dedupHash ?? null, createdAt: null, updatedAt: null }
    this.rows.push(r)
    return r
  }
  async listByTable(tableId: string) { return this.rows.filter(r => r.tableId === tableId).reverse() }
  async findByTableAndHash(tableId: string, dedupHash: string) { return this.rows.find(r => r.tableId === tableId && r.dedupHash === dedupHash) ?? null }
  async countByTable(tableId: string) { return this.rows.filter(r => r.tableId === tableId).length }
  async updateRow(id: string, rowJson: string) { const r = this.rows.find(x => x.id === id); if (r) r.rowJson = rowJson; return r ?? null }
  async findById(id: string) { return this.rows.find(r => r.id === id) ?? null }
  async deleteRow(id: string) { const i = this.rows.findIndex(r => r.id === id); if (i >= 0) this.rows.splice(i, 1); return i >= 0 ? 1 : 0 }
  async deleteByTable(tableId: string) { const n = this.rows.filter(r => r.tableId === tableId).length; this.rows = this.rows.filter(r => r.tableId !== tableId); return n }
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

  it('run 作用域：落库为 run:<runId>，跨实例不可见（并行实例隔离）', async () => {
    const { vars } = setupSvc()
    // 实例 A（runId=run_1）写入 run 作用域
    const w = await variableNode.execute(baseCtx({ op: 'set', scope: 'run', key: 'topic', value: '缅北' }))
    expect(w.status).toBe('succeeded')
    expect(vars.rows[0]).toMatchObject({ scope: 'run:run_1', key: 'topic' })
    // 实例 B（runId=run_2）读同一键 → 无值（互不可见）
    const ctxB = baseCtx({ op: 'get', scope: 'run', key: 'topic' }) as Record<string, unknown>
    ctxB.runId = 'run_2'
    const rB = await variableNode.execute(ctxB as never)
    if (rB.status === 'succeeded') expect(rB.output.value).toBeNull()
    // 实例 A 自己读得到
    const rA = await variableNode.execute(baseCtx({ op: 'get', scope: 'run', key: 'topic' }))
    if (rA.status === 'succeeded') expect(rA.output.value).toBe('缅北')
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

describe('data-table 节点（应用数据层：createTable/upsert/count/app 作用域）', () => {
  beforeEach(() => { svcMock.mockReset(); dsMock.mockReset() })

  const appCtx = (config: Record<string, unknown>) =>
    ({ ...baseCtx(config), definitionId: 'def_app1' })

  it('createTable 声明建表（幂等：重复执行 created=false）；去重键必须是已声明列', async () => {
    const { defs } = setupSvc()
    const cols = JSON.stringify([{ key: 'url', type: 'string' }, { key: 'price', type: 'number' }])
    const c1 = await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: '监控', columns: cols, dedupKeys: 'url' }))
    expect(c1.status).toBe('succeeded')
    if (c1.status !== 'succeeded') return
    expect(c1.output.created).toBe(true)
    expect(defs.rows[0]).toMatchObject({ scope: 'app', ownerId: 'def_app1', name: '监控' })
    // 幂等重入
    const c2 = await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: '监控', columns: cols, dedupKeys: 'url' }))
    if (c2.status === 'succeeded') expect(c2.output.created).toBe(false)
    // 去重键不在列里 → failed
    const bad = await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: 'X', columns: cols, dedupKeys: 'nope' }))
    expect(bad.status).toBe('failed')
  })

  it('createTable：schema 只增不改——删列报错；去重键变更报错', async () => {
    setupSvc()
    const cols = JSON.stringify([{ key: 'url', type: 'string' }, { key: 'price', type: 'number' }])
    await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: 'T', columns: cols, dedupKeys: 'url' }))
    const removed = await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: 'T', columns: JSON.stringify([{ key: 'url', type: 'string' }]), dedupKeys: 'url' }))
    expect(removed.status === 'failed' && /删掉了列/.test(removed.error)).toBe(true)
    const changedDedup = await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: 'T', columns: cols, dedupKeys: 'price' }))
    expect(changedDedup.status === 'failed' && /去重键已锁定/.test(changedDedup.error)).toBe(true)
  })

  it('upsert：同去重键第二次 → updated 覆盖；类型按列声明校正（number）', async () => {
    setupSvc()
    const cols = JSON.stringify([{ key: 'url', type: 'string' }, { key: 'price', type: 'number' }])
    await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: 'T', columns: cols, dedupKeys: 'url' }))
    const u1 = await dataTableNode.execute(appCtx({ op: 'upsert', scope: 'app', tableName: 'T', row: '{"url":"https://a","price":"12.5"}' }))
    expect(u1.status === 'succeeded' && u1.output.action).toBe('inserted')
    // 第一次写入即做类型校正："12.5" → 12.5（number 列强转，upsert 哈希稳定的依据）
    const q1 = await dataTableNode.execute(appCtx({ op: 'query', scope: 'app', tableName: 'T' }))
    if (q1.status === 'succeeded') {
      expect((q1.output.rows as any[])[0].price).toBe(12.5)
    }
    const u2 = await dataTableNode.execute(appCtx({ op: 'upsert', scope: 'app', tableName: 'T', row: '{"url":"https://a","price":99}' }))
    expect(u2.status === 'succeeded' && u2.output.action).toBe('updated')
    expect(u1.status === 'succeeded' && u2.status === 'succeeded' && u1.output.rowId).toBe(u2.output.rowId)
    const q2 = await dataTableNode.execute(appCtx({ op: 'query', scope: 'app', tableName: 'T' }))
    if (q2.status === 'succeeded') {
      expect((q2.output.rows as any[])).toHaveLength(1)
      expect((q2.output.rows as any[])[0].price).toBe(99)
    }
  })

  it('app 作用域隔离：不同 definition 同名表互不可见；app 表缺失不回退全局、也不自动建表', async () => {
    setupSvc()
    const cols = JSON.stringify([{ key: 'k', type: 'string' }])
    await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: 'T', columns: cols }))
    // 另一个 definition（def_app2）看不到 def_app1 的表
    const otherCtx = { ...appCtx({ op: 'count', scope: 'app', tableName: 'T' }), definitionId: 'def_app2' }
    const c = await dataTableNode.execute(otherCtx as never)
    if (c.status === 'succeeded') expect(c.output.total).toBe(0)
    // workflow 全局作用域另建同名表互不干扰
    await dataTableNode.execute(baseCtx({ op: 'insert', tableName: 'T', row: '{"k":"global"}' }))
    const c2 = await dataTableNode.execute(appCtx({ op: 'count', scope: 'app', tableName: 'T' }))
    if (c2.status === 'succeeded') expect(c2.output.total).toBe(0)
    // app 表不存在时 insert → failed（不自动建表）
    const ins = await dataTableNode.execute(appCtx({ op: 'insert', scope: 'app', tableName: '不存在', row: '{"k":1}' }))
    expect(ins.status).toBe('failed')
  })

  it('query 过滤分页：filterContains + page/pageSize → {rows,total}', async () => {
    setupSvc()
    const cols = JSON.stringify([{ key: 'url', type: 'string' }])
    await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: 'T', columns: cols, dedupKeys: 'url' }))
    for (let i = 1; i <= 5; i++) {
      await dataTableNode.execute(appCtx({ op: 'upsert', scope: 'app', tableName: 'T', row: JSON.stringify({ url: `https://a/${i}`, n: i }) }))
    }
    const q1 = await dataTableNode.execute(appCtx({ op: 'query', scope: 'app', tableName: 'T', filterContains: '/3' }))
    if (q1.status === 'succeeded') {
      expect(q1.output.total).toBe(1)
      expect((q1.output.rows as any[])[0].url).toBe('https://a/3')
    }
    const q2 = await dataTableNode.execute(appCtx({ op: 'query', scope: 'app', tableName: 'T', page: 2, pageSize: 2 }))
    if (q2.status === 'succeeded') {
      expect(q2.output.total).toBe(5)
      expect((q2.output.rows as any[])).toHaveLength(2)
    }
  })

  it('并发竞插兜底：唯一索引冲突 → 改走更新（action=updated）', async () => {
    const { rows } = setupSvc()
    rows.strictUnique = false // 关闭前置 find（模拟查完到插入之间被并发抢先）
    // 让 findByTableAndHash 先返回 null 再返回已有行：直接禁用唯一索引会真插入——改为模拟竞态
    rows.strictUnique = true
    const cols = JSON.stringify([{ key: 'url', type: 'string' }])
    await dataTableNode.execute(appCtx({ op: 'createTable', scope: 'app', tableName: 'T', columns: cols, dedupKeys: 'url' }))
    const u1 = await dataTableNode.execute(appCtx({ op: 'upsert', scope: 'app', tableName: 'T', row: '{"url":"x"}' }))
    expect(u1.status === 'succeeded' && u1.output.action).toBe('inserted')
    // 手工制造竞态：删掉 hash 再查（findByTableAndHash 返回 null）但唯一索引仍在 → insert 撞索引 → retry 更新
    const orig = rows.findByTableAndHash.bind(rows)
    ;(rows as any).findByTableAndHash = async () => {
      ;(rows as any).findByTableAndHash = orig
      return null // 第一次查 miss，撞索引后再走真实查询
    }
    const u2 = await dataTableNode.execute(appCtx({ op: 'upsert', scope: 'app', tableName: 'T', row: '{"url":"x","v":2}' }))
    expect(u2.status === 'succeeded' && u2.output.action).toBe('updated')
    expect(rows.rows.filter(r => r.tableId === rows.rows[0].tableId)).toHaveLength(1)
  })

  it('validateConfig：新 op 与 scope 校验', () => {
    expect(dataTableNode.validateConfig({ op: 'createTable' } as never)).toEqual([])
    expect(dataTableNode.validateConfig({ op: 'upsert', scope: 'app' } as never)).toEqual([])
    expect(dataTableNode.validateConfig({ op: 'x' } as never)).toEqual(expect.arrayContaining([expect.stringContaining('op')]))
    expect(dataTableNode.validateConfig({ op: 'insert', scope: 'bad' } as never)).toEqual(expect.arrayContaining([expect.stringContaining('scope')]))
  })
})

describe('目录契约', () => {
  it('catalog 含 variable/data-table 且 requiredConfigKeys 正确', () => {
    expect(NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['variable']].requiredConfigKeys).toEqual(['op', 'key'])
    expect(NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['data-table']].requiredConfigKeys).toEqual(['op'])
  })
})
