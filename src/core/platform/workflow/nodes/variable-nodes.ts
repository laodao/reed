/**
 * 变量与数据表节点（P0 片4）
 * @module core/platform/workflow/nodes/variable-nodes
 * @description
 *  - variable：op=get 读持久化变量（无则 defaultValue 兜底）；op=set 写入（scope+key upsert）
 *  - data-table：op=insert/query/update/delete 操作数据表（insert 支持按名自动建表）
 */

import type { WorkflowNodeContext, WorkflowNodeExecutionResult } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { getVariableDataService } from '../variables/variable-data.service'
import { getDataSourceService } from '../datasource/datasource.service'
import { VARIABLE_SCOPES, type VariableScope } from '@shared/types/variable.types'

// ==================== 变量 ====================

const variableNode: WorkflowNodeHandler = {
  type: 'variable',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'value', type: 'json', desc: 'get：变量值（无则 defaultValue）；set：写入的值' },
    { key: 'ok', type: 'boolean', desc: 'set 是否成功' },
  ],
  validateConfig(config) {
    const cfg = config as { op?: string; scope?: string; key?: string }
    const errors: string[] = []
    if (!cfg.op || !['get', 'set'].includes(cfg.op)) errors.push('op 必须是 get 或 set')
    if (cfg.scope && !VARIABLE_SCOPES[cfg.scope as VariableScope]) errors.push('scope 必须是 global 或 user')
    if (!cfg.key || !stringifyValue(cfg.key).trim()) errors.push('变量键不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { op: 'get' | 'set'; scope?: VariableScope; key: string; value?: string; defaultValue?: string }
    const svc = getVariableDataService()
    const scope: VariableScope = cfg.scope ?? VARIABLE_SCOPES.global
    const key = stringifyValue(cfg.key)
    if (cfg.op === 'set') {
      const value = cfg.value ?? ''
      await svc.setVariable(scope, key, value)
      return { status: 'succeeded', output: { ok: true, value } }
    }
    const value = await svc.getVariable(scope, key, cfg.defaultValue ?? null)
    return { status: 'succeeded', output: { value } }
  },
}

// ==================== 数据表 ====================

const dataTableNode: WorkflowNodeHandler = {
  type: 'data-table',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'rows', type: 'json', desc: 'query：行数组 [{id, ...}]' },
    { key: 'rowId', type: 'string', desc: 'insert：新行 id' },
    { key: 'tableId', type: 'string', desc: 'insert：表 id（自动建表时为新建）' },
    { key: 'ok', type: 'boolean', desc: 'update/delete 是否成功' },
  ],
  validateConfig(config) {
    const cfg = config as { op?: string }
    const errors: string[] = []
    if (!cfg.op || !['insert', 'query', 'update', 'delete', 'execute'].includes(cfg.op)) {
      errors.push('op 必须是 insert/query/update/delete/execute')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      op: 'insert' | 'query' | 'update' | 'delete' | 'execute'
      dataSourceId?: string
      tableId?: string
      tableName?: string
      row?: string
      rowId?: string
      sql?: string
      params?: string
    }

    // 外部数据源模式：读写第三方数据库（路由到数据源驱动）
    if (cfg.dataSourceId) {
      return executeExternalDataTable(ctx, cfg)
    }

    // 内置数据表模式（本应用 wf_data_table_*）
    const svc = getVariableDataService()
    switch (cfg.op) {
      case 'insert': {
        let row: Record<string, unknown> = {}
        try {
          row = cfg.row ? JSON.parse(cfg.row) : {}
        } catch {
          return { status: 'failed', error: 'data-table: row 必须是合法 JSON 字符串', retryable: false }
        }
        const r = await svc.insertRow({ tableId: cfg.tableId, tableName: cfg.tableName, row })
        return { status: 'succeeded', output: { tableId: r.tableId, rowId: r.rowId } }
      }
      case 'query': {
        const rows = await svc.queryRows({ tableId: cfg.tableId, tableName: cfg.tableName })
        return { status: 'succeeded', output: { rows } }
      }
      case 'update': {
        let row: Record<string, unknown> = {}
        try {
          row = cfg.row ? JSON.parse(cfg.row) : {}
        } catch {
          return { status: 'failed', error: 'data-table: row 必须是合法 JSON 字符串', retryable: false }
        }
        if (!cfg.rowId) return { status: 'failed', error: 'data-table: update 需要 rowId', retryable: false }
        await svc.updateRow(cfg.rowId, row)
        return { status: 'succeeded', output: { ok: true } }
      }
      case 'delete': {
        if (!cfg.rowId) return { status: 'failed', error: 'data-table: delete 需要 rowId', retryable: false }
        await svc.deleteRow(cfg.rowId)
        return { status: 'succeeded', output: { ok: true } }
      }
      default:
        return { status: 'failed', error: 'data-table: 内置模式不支持 execute，请配置数据源', retryable: false }
    }
  },
}

/**
 * 外部数据源模式：路由到 DataSourceService 执行 SQL（参数化，防注入）。
 * - query/execute：执行 SQL（SELECT 或 DML/DDL），返回 rows/columns/rowCount
 * SQL 占位符用 $1,$2,...，值取自 params（JSON 数组）。
 */
async function executeExternalDataTable(
  ctx: WorkflowNodeContext,
  cfg: { op: 'insert' | 'query' | 'update' | 'delete' | 'execute'; dataSourceId: string; sql?: string; params?: string },
): Promise<WorkflowNodeExecutionResult> {
  const ds = getDataSourceService()
  if (!cfg.sql || !cfg.sql.trim()) {
    return { status: 'failed', error: 'data-table: 外部数据源模式需要填写 SQL', retryable: false }
  }
  let parameters: unknown[] = []
  if (cfg.params) {
    try {
      const parsed = JSON.parse(cfg.params)
      if (Array.isArray(parsed)) parameters = parsed
    } catch {
      return { status: 'failed', error: 'data-table: params 必须是 JSON 数组', retryable: false }
    }
  }
  try {
    const result = await ds.execute(cfg.dataSourceId, cfg.sql, parameters)
    return {
      status: 'succeeded',
      output: { columns: result.columns, rows: result.rows, rowCount: result.rowCount, durationMs: result.durationMs },
    }
  } catch (e: any) {
    return { status: 'failed', error: e?.message || '外部数据源执行失败', retryable: true }
  }
}

export const VARIABLE_NODE_HANDLERS: WorkflowNodeHandler[] = [variableNode, dataTableNode]
