/**
 * 变量与数据表服务（P0 片4）+ 注册器
 * @module core/platform/workflow/variables/variable-data.service
 * @description 跨运行持久化：键值变量（scope+key 唯一，upsert）与数据表（结构+行）。
 *              节点经注册器取用（同 tool-registry 模式）。
 *
 *              2026-10-08 应用数据层（设计 docs/design/2026-10-08-workflow-app-platform-evolution.md §3.3）：
 *              - 表作用域 scope ∈ workflow（历史语义，全局命名空间）| app（按 owner=definitionId 隔离）
 *              - createTable 显式声明 schema（列类型 + 去重键），幂等（只增不改）
 *              - upsertRow 按 dedup_keys 的 sha256 判重；唯一索引兜底并发竞插
 *              - queryRowsPaged 内存过滤+分页（行存储是 JSON 文本，无法 SQL 过滤）
 *              - 容量红线走 workflowRuntimeParams().dataTables（登记表驱动，设置页同源）
 */

import { createHash } from 'node:crypto'
import type { DataTableColumn, DataTableDef, DataTableRow, WorkflowVariable } from '@shared/types/variable.types'
import { canonicalDedupPayload } from '@shared/types/variable.types'
import { workflowRuntimeParams } from '@shared/utils/workflow-runtime-params'

type DefRepoLike = {
  findById(id: string): Promise<DataTableDef | null>
  findByName(name: string): Promise<DataTableDef | null>
  findByScopeAndName(scope: string, ownerId: string | null, name: string): Promise<DataTableDef | null>
  create(name: string, columnsJson: string, extra?: { scope?: string; ownerId?: string | null; dedupKeysJson?: string | null }): Promise<DataTableDef>
  listByScopeOwner(scope: string, ownerId: string | null): Promise<DataTableDef[]>
  countByOwner(ownerId: string): Promise<number>
  delete(id: string): Promise<number>
}

type RowRepoLike = {
  insertRow(tableId: string, rowJson: string, dedupHash?: string | null): Promise<DataTableRow>
  listByTable(tableId: string): Promise<DataTableRow[]>
  findByTableAndHash(tableId: string, dedupHash: string): Promise<DataTableRow | null>
  countByTable(tableId: string): Promise<number>
  updateRow(id: string, rowJson: string): Promise<DataTableRow | null>
  findById(id: string): Promise<DataTableRow | null>
  deleteRow(id: string): Promise<number>
  deleteByTable(tableId: string): Promise<number>
}

type VarRepoLike = {
  findByScopeAndKey(scope: string, key: string): Promise<WorkflowVariable | null>
  upsert(scope: string, key: string, valueJson: string): Promise<WorkflowVariable>
  list(scope?: string): Promise<WorkflowVariable[]>
  deleteByScope(scope: string): Promise<number>
  delete(id: string): Promise<number>
}

/** 表定位：tableId 优先；app 作用域按 (scope,ownerId,name)，workflow 作用域按名全局 */
export type TableRef = {
  tableId?: string
  tableName?: string
  scope?: 'workflow' | 'app'
  /** scope='app' 时的属主（= definitionId） */
  ownerId?: string
}

export class VariableDataService {
  constructor(
    private readonly variables: VarRepoLike,
    private readonly tableDefs: DefRepoLike,
    private readonly tableRows: RowRepoLike,
  ) {}

  // ==================== 变量 ====================

  /** 读取变量（返回解析后的 JSON 值；无则 defaultValue 兜底。scope 含 run:<runId> 复合作用域） */
  async getVariable(scope: string, key: string, defaultValue: unknown = null): Promise<unknown> {
    const v = await this.variables.findByScopeAndKey(scope, key)
    if (!v) return defaultValue
    try {
      return JSON.parse(v.valueJson)
    } catch {
      return v.valueJson
    }
  }

  async setVariable(scope: string, key: string, value: unknown): Promise<void> {
    await this.variables.upsert(scope, key, JSON.stringify(value ?? null))
  }

  async listVariables(scope?: string): Promise<WorkflowVariable[]> {
    return this.variables.list(scope)
  }

  /** 按作用域整删（run:<runId> 随运行删除级联清理） */
  async deleteByScope(scope: string): Promise<number> {
    return this.variables.deleteByScope(scope)
  }

  async deleteVariable(id: string): Promise<void> {
    await this.variables.delete(id)
  }

  // ==================== 数据表 ====================

  /** 解析表：tableId 优先；app 作用域按 (scope,ownerId,name) 隔离，workflow 作用域按名（历史语义） */
  private async resolveTable(ref: TableRef): Promise<DataTableDef | null> {
    if (ref.tableId) return this.tableDefs.findById(ref.tableId)
    if (ref.tableName) {
      if (ref.scope === 'app') {
        if (!ref.ownerId) throw new Error('data-table: app 作用域需要 ownerId（definitionId）')
        return this.tableDefs.findByScopeAndName('app', ref.ownerId, ref.tableName)
      }
      return this.tableDefs.findByName(ref.tableName)
    }
    return null
  }

  /** 解析表（app 作用域找不到按名表时，不回退全局——隔离铁律） */
  private async resolveTableStrict(ref: TableRef): Promise<DataTableDef> {
    const table = await this.resolveTable(ref)
    if (!table) {
      throw new Error(
        ref.scope === 'app'
          ? `data-table: app 表「${ref.tableName}」不存在——请先在工作流里用 createTable 声明`
          : 'data-table: 需要 tableId 或 tableName',
      )
    }
    return table
  }

  /**
   * 显式建表（幂等：「只增不改」——已存在且新列键集 ⊇ 旧键集 → 返回既有；删列/去重键变更 → 报错。
   * 对齐 n8n Data Tables 的 schema 演进取舍：可加列、不改列类型）。
   */
  async createTable(input: {
    name: string
    columns: DataTableColumn[]
    dedupKeys?: string[]
    scope?: 'workflow' | 'app'
    ownerId?: string
  }): Promise<{ tableId: string; created: boolean }> {
    if (!input.name.trim()) throw new Error('data-table: 表名不能为空')
    if (!input.columns.length) throw new Error('data-table: 至少声明一列')
    const scope = input.scope ?? 'workflow'
    if (scope === 'app' && !input.ownerId) throw new Error('data-table: app 作用域需要 ownerId（definitionId）')

    // 去重键必须是已声明的列
    const columnKeys = new Set(input.columns.map(c => c.key))
    for (const dk of input.dedupKeys ?? []) {
      if (!columnKeys.has(dk)) throw new Error(`data-table: 去重键「${dk}」不在声明的列里`)
    }

    const existing = await this.tableDefs.findByScopeAndName(scope, scope === 'app' ? input.ownerId! : null, input.name)
    if (existing) {
      const oldKeys = new Set(parseColumns(existing.columnsJson).map(c => c.key))
      const removed = [...oldKeys].filter(k => !columnKeys.has(k))
      if (removed.length) {
        throw new Error(`data-table: 表「${input.name}」已存在且本次声明删掉了列 [${removed.join(', ')}]——schema 只增不改（如确需变更请换表名重建）`)
      }
      const oldDedup = parseDedupKeys(existing.dedupKeysJson)
      const newDedup = [...(input.dedupKeys ?? [])].sort().join(',')
      if (oldDedup.sort().join(',') !== newDedup) {
        throw new Error(`data-table: 表「${input.name}」的去重键已锁定为 [${oldDedup.join(', ') || '无'}]，不可变更（存量重复行会让唯一索引失效；确需变更请去重后换表名重建）`)
      }
      return { tableId: existing.id, created: false }
    }

    // 容量护栏（app 作用域）：单 definition 表数上限
    if (scope === 'app') {
      const { maxTablesPerDefinition } = workflowRuntimeParams().dataTables
      const count = await this.tableDefs.countByOwner(input.ownerId!)
      if (count >= maxTablesPerDefinition) {
        throw new Error(`data-table: 该应用的数据表已达上限（${count}/${maxTablesPerDefinition}）`)
      }
    }

    const table = await this.tableDefs.create(input.name, JSON.stringify(input.columns), {
      scope,
      ownerId: scope === 'app' ? input.ownerId : null,
      dedupKeysJson: input.dedupKeys?.length ? JSON.stringify(input.dedupKeys) : null,
    })
    return { tableId: table.id, created: true }
  }

  /**
   * 按列声明做类型校正（仅 number/boolean 列强转——它们是 upsert 哈希稳定与数值比较的依据；
   * string 列不做强转保持原生值，兼容历史"列全 string + 原样存储"语义）。
   * 不符→报错带列名；未声明的列原样保留。
   */
  private coerceRow(table: DataTableDef, row: Record<string, unknown>): Record<string, unknown> {
    const columns = parseColumns(table.columnsJson)
    const out: Record<string, unknown> = { ...row }
    for (const col of columns) {
      if (!(col.key in out) || out[col.key] === undefined) continue
      const v = out[col.key]
      const type = col.type ?? 'string'
      if (type === 'number') {
        if (typeof v === 'number') continue
        const n = Number(v)
        if (Number.isNaN(n)) throw new Error(`data-table: 列「${col.key}」声明为 number，但值 ${JSON.stringify(v)} 无法转换`)
        out[col.key] = n
      } else if (type === 'boolean') {
        if (typeof v === 'boolean') continue
        if (typeof v === 'string') {
          if (v === 'true' || v === '1') out[col.key] = true
          else if (v === 'false' || v === '0') out[col.key] = false
          else throw new Error(`data-table: 列「${col.key}」声明为 boolean，但值 ${JSON.stringify(v)} 无法转换`)
        } else {
          throw new Error(`data-table: 列「${col.key}」声明为 boolean，但值类型为 ${typeof v}`)
        }
      }
      // string / json 列原样保留
    }
    return out
  }

  /** 插入行：表不存在且给了 tableName → 按 row 键自动建表（仅 workflow 作用域的历史语义；app 表必须先 createTable） */
  async insertRow(input: { tableId?: string; tableName?: string; scope?: 'workflow' | 'app'; ownerId?: string; row: Record<string, unknown> }): Promise<{ tableId: string; rowId: string }> {
    let table = await this.resolveTable(input)
    if (!table) {
      if (input.scope === 'app') {
        throw new Error(`data-table: app 表「${input.tableName}」不存在——app 作用域不做自动建表，请先 createTable`)
      }
      if (!input.tableName) throw new Error('data-table: 需要 tableId 或 tableName')
      const columns = Object.keys(input.row).map(k => ({ key: k, label: k, type: 'string' as const }))
      table = await this.tableDefs.create(input.tableName, JSON.stringify(columns))
    }
    await this.assertRowCapacity(table.id)
    const row = this.coerceRow(table, input.row)
    const inserted = await this.tableRows.insertRow(table.id, JSON.stringify(row))
    return { tableId: table.id, rowId: inserted.id }
  }

  /**
   * upsert：按表 dedup_keys 列值计算 sha256 判重——命中→整行覆盖更新；未命中→插入。
   * 行去重键缺值 = 报错（显式失败优于静默 insert）。并发兜底：唯一索引 (table_id,dedup_hash)——
   * 竞插后到者撞索引，改走更新（SQLite 写天然串行；PG 捕获唯一冲突重试一次）。
   */
  async upsertRow(input: { tableId?: string; tableName?: string; scope?: 'workflow' | 'app'; ownerId?: string; row: Record<string, unknown> }): Promise<{ tableId: string; rowId: string; action: 'inserted' | 'updated' }> {
    const table = await this.resolveTableStrict(input)
    const dedupKeys = parseDedupKeys(table.dedupKeysJson)
    if (!dedupKeys.length) {
      throw new Error(`data-table: 表「${table.name}」未声明去重键（dedupKeys），不能 upsert——请用 insert 或重建表时声明`)
    }
    const row = this.coerceRow(table, input.row)
    const payload = canonicalDedupPayload(dedupKeys, row)
    if (payload === null) {
      throw new Error(`data-table: upsert 行缺少去重键的值 [${dedupKeys.join(', ')}]`)
    }
    const hash = sha256(payload)

    const existing = await this.tableRows.findByTableAndHash(table.id, hash)
    if (existing) {
      await this.tableRows.updateRow(existing.id, JSON.stringify(row))
      return { tableId: table.id, rowId: existing.id, action: 'updated' }
    }
    await this.assertRowCapacity(table.id)
    try {
      const inserted = await this.tableRows.insertRow(table.id, JSON.stringify(row), hash)
      return { tableId: table.id, rowId: inserted.id, action: 'inserted' }
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      // 并发竞插：唯一索引兜底——改走更新
      const raced = await this.tableRows.findByTableAndHash(table.id, hash)
      if (!raced) throw e
      await this.tableRows.updateRow(raced.id, JSON.stringify(row))
      return { tableId: table.id, rowId: raced.id, action: 'updated' }
    }
  }

  /** 查询行：返回 [{ id, ...row }]（兼容历史全量语义） */
  async queryRows(input: TableRef): Promise<Array<Record<string, unknown>>> {
    const table = await this.resolveTable(input)
    if (!table) return []
    const rows = await this.tableRows.listByTable(table.id)
    return rows.map(r => {
      let obj: Record<string, unknown> = {}
      try { obj = JSON.parse(r.rowJson) } catch { obj = { raw: r.rowJson } }
      return { id: r.id, ...obj }
    })
  }

  /** 查询行（分页+关键字过滤；内存过滤，容量红线内可接受） */
  async queryRowsPaged(input: TableRef & {
    filter?: { field?: string; contains?: string }
    page?: number
    pageSize?: number
  }): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    const table = await this.resolveTable(input)
    if (!table) return { rows: [], total: 0 }
    let rows = await this.tableRows.listByTable(table.id)
    const { field, contains } = input.filter ?? {}
    if (contains) {
      const needle = contains.toLowerCase()
      rows = rows.filter(r => {
        if (field) {
          let obj: Record<string, unknown> = {}
          try { obj = JSON.parse(r.rowJson) } catch { obj = {} }
          const v = obj[field]
          return v !== undefined && String(v).toLowerCase().includes(needle)
        }
        return r.rowJson.toLowerCase().includes(needle)
      })
    }
    const total = rows.length
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, input.pageSize ?? 50))
    const slice = rows.slice((page - 1) * pageSize, page * pageSize)
    return {
      rows: slice.map(r => {
        let obj: Record<string, unknown> = {}
        try { obj = JSON.parse(r.rowJson) } catch { obj = { raw: r.rowJson } }
        return { id: r.id, ...obj }
      }),
      total,
    }
  }

  async countRows(input: TableRef): Promise<number> {
    const table = await this.resolveTable(input)
    if (!table) return 0
    return this.tableRows.countByTable(table.id)
  }

  /** 应用侧数据浏览：按作用域+属主列表（含行数） */
  async listTablesForOwner(scope: 'workflow' | 'app', ownerId: string | null): Promise<Array<DataTableDef & { rowCount: number }>> {
    const tables = await this.tableDefs.listByScopeOwner(scope, ownerId)
    return Promise.all(tables.map(async t => ({ ...t, rowCount: await this.tableRows.countByTable(t.id) })))
  }

  /** 删表（级联删行；应用页签二次确认后调用） */
  async deleteTableCascade(tableId: string): Promise<void> {
    const table = await this.tableDefs.findById(tableId)
    if (!table) throw new Error('data-table: 表不存在')
    await this.tableRows.deleteByTable(tableId)
    await this.tableDefs.delete(tableId)
  }

  async getTableDef(tableId: string): Promise<DataTableDef | null> {
    return this.tableDefs.findById(tableId)
  }

  async updateRow(rowId: string, row: Record<string, unknown>): Promise<void> {
    await this.tableRows.updateRow(rowId, JSON.stringify(row))
  }

  async deleteRow(rowId: string): Promise<void> {
    await this.tableRows.deleteRow(rowId)
  }

  /** 单表行数红线（超限拒写；设计 §3.3——n8n 到顶禁写同款语义） */
  private async assertRowCapacity(tableId: string): Promise<void> {
    const { maxRowsPerTable } = workflowRuntimeParams().dataTables
    const count = await this.tableRows.countByTable(tableId)
    if (count >= maxRowsPerTable) {
      throw new Error(`data-table: 该表行数已达上限（${count}/${maxRowsPerTable}）——请先归档或删除部分行（参数设置 → 工作流 → 应用数据表可调）`)
    }
  }
}

// ==================== 工具 ====================

function parseColumns(raw: string | null | undefined): DataTableColumn[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter(c => c && typeof c.key === 'string') : []
  } catch {
    return []
  }
}

export function parseDedupKeys(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter(k => typeof k === 'string' && k) : []
  } catch {
    return []
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/** SQLite（SQLITE_CONSTRAINT/UNIQUE）与 PG（23505）的唯一冲突判定 */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string }
  if (!err) return false
  if (err.code === '23505') return true
  return !!err.message && /UNIQUE constraint failed|duplicate key value/i.test(err.message)
}

// ==================== 注册器 ====================

let _svc: VariableDataService | null = null

export function registerVariableDataService(svc: VariableDataService): void {
  _svc = svc
}

export function getVariableDataService(): VariableDataService {
  if (!_svc) {
    throw new Error('变量/数据表服务未注册（workflow-boot 装配失败或未调用）')
  }
  return _svc
}

export function resetVariableDataService(): void {
  _svc = null
}
