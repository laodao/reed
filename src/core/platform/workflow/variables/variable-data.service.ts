/**
 * 变量与数据表服务（P0 片4）+ 注册器
 * @module core/platform/workflow/variables/variable-data.service
 * @description 跨运行持久化：键值变量（scope+key 唯一，upsert）与数据表（结构+行）。
 *              节点经注册器取用（同 tool-registry 模式）。
 */

import type { DataTableDef, DataTableRow, WorkflowVariable, VariableScope } from '@shared/types/variable.types'
import type { VariableRepository, DataTableDefRepository, DataTableRowRepository } from '@core/database/repositories/variable.repositories'

type DefRepoLike = {
  findById(id: string): Promise<DataTableDef | null>
  findByName(name: string): Promise<DataTableDef | null>
  create(name: string, columnsJson: string): Promise<DataTableDef>
}

type RowRepoLike = {
  insertRow(tableId: string, rowJson: string): Promise<DataTableRow>
  listByTable(tableId: string): Promise<DataTableRow[]>
  updateRow(id: string, rowJson: string): Promise<DataTableRow | null>
  findById(id: string): Promise<DataTableRow | null>
  deleteRow(id: string): Promise<number>
}

type VarRepoLike = {
  findByScopeAndKey(scope: VariableScope, key: string): Promise<WorkflowVariable | null>
  upsert(scope: VariableScope, key: string, valueJson: string): Promise<WorkflowVariable>
  list(scope?: VariableScope): Promise<WorkflowVariable[]>
  delete(id: string): Promise<number>
}

export class VariableDataService {
  constructor(
    private readonly variables: VarRepoLike,
    private readonly tableDefs: DefRepoLike,
    private readonly tableRows: RowRepoLike,
  ) {}

  // ==================== 变量 ====================

  /** 读取变量（返回解析后的 JSON 值；无则 defaultValue 兜底） */
  async getVariable(scope: VariableScope, key: string, defaultValue: unknown = null): Promise<unknown> {
    const v = await this.variables.findByScopeAndKey(scope, key)
    if (!v) return defaultValue
    try {
      return JSON.parse(v.valueJson)
    } catch {
      return v.valueJson
    }
  }

  async setVariable(scope: VariableScope, key: string, value: unknown): Promise<void> {
    await this.variables.upsert(scope, key, JSON.stringify(value ?? null))
  }

  async listVariables(scope?: VariableScope): Promise<WorkflowVariable[]> {
    return this.variables.list(scope)
  }

  async deleteVariable(id: string): Promise<void> {
    await this.variables.delete(id)
  }

  // ==================== 数据表 ====================

  /** 解析表：tableId 优先，tableName 兜底（V1 仅 insert 支持按名自动建表） */
  private async resolveTable(input: { tableId?: string; tableName?: string }): Promise<DataTableDef | null> {
    if (input.tableId) return this.tableDefs.findById(input.tableId)
    if (input.tableName) return this.tableDefs.findByName(input.tableName)
    return null
  }

  /** 插入行：表不存在且给了 tableName → 按 row 键自动建表（列类型默认 string） */
  async insertRow(input: { tableId?: string; tableName?: string; row: Record<string, unknown> }): Promise<{ tableId: string; rowId: string }> {
    let table = await this.resolveTable(input)
    if (!table) {
      if (!input.tableName) throw new Error('data-table: 需要 tableId 或 tableName')
      const columns = Object.keys(input.row).map(k => ({ key: k, label: k, type: 'string' as const }))
      table = await this.tableDefs.create(input.tableName, JSON.stringify(columns))
    }
    const row = await this.tableRows.insertRow(table.id, JSON.stringify(input.row))
    return { tableId: table.id, rowId: row.id }
  }

  /** 查询行：返回 [{ id, ...row }] */
  async queryRows(input: { tableId?: string; tableName?: string }): Promise<Array<Record<string, unknown>>> {
    const table = await this.resolveTable(input)
    if (!table) return []
    const rows = await this.tableRows.listByTable(table.id)
    return rows.map(r => {
      let obj: Record<string, unknown> = {}
      try { obj = JSON.parse(r.rowJson) } catch { obj = { raw: r.rowJson } }
      return { id: r.id, ...obj }
    })
  }

  async updateRow(rowId: string, row: Record<string, unknown>): Promise<void> {
    await this.tableRows.updateRow(rowId, JSON.stringify(row))
  }

  async deleteRow(rowId: string): Promise<void> {
    await this.tableRows.deleteRow(rowId)
  }
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
