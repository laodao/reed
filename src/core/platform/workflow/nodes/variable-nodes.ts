/**
 * 变量与数据表节点（P0 片4；2026-10-08 应用数据层扩展）
 * @module core/platform/workflow/nodes/variable-nodes
 * @description
 *  - variable：op=get 读持久化变量（无则 defaultValue 兜底）；op=set 写入（scope+key upsert）
 *  - data-table：op=insert/query/update/delete（历史）+ createTable/upsert/count（应用数据层）
 *    scope=workflow（全局命名空间）| app（按 definitionId 隔离——一 definition 一 app，等价按应用隔离）
 */

import type { WorkflowNodeContext, WorkflowNodeExecutionResult } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { getVariableDataService } from '../variables/variable-data.service'
import { getDataSourceService } from '../datasource/datasource.service'
import { VARIABLE_SCOPES, runVariableScope } from '@shared/types/variable.types'

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
    if (cfg.scope && !(cfg.scope in VARIABLE_SCOPES)) errors.push('scope 必须是 global、user 或 run')
    if (!cfg.key || !stringifyValue(cfg.key).trim()) errors.push('变量键不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { op: 'get' | 'set'; scope?: string; key: string; value?: string; defaultValue?: string }
    const svc = getVariableDataService()
    // run 作用域 = 本运行实例独享（存 run:<runId>，并行实例互不可见，随运行删除清理）
    const scope = cfg.scope === VARIABLE_SCOPES.run ? runVariableScope(ctx.runId) : (cfg.scope ?? VARIABLE_SCOPES.global)
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
    { key: 'rowId', type: 'string', desc: 'insert/upsert：行 id' },
    { key: 'tableId', type: 'string', desc: 'insert/createTable：表 id（自动建表时为新建）' },
    { key: 'ok', type: 'boolean', desc: 'update/delete 是否成功' },
    { key: 'created', type: 'boolean', desc: 'createTable：是否新建（幂等重入为 false）' },
    { key: 'action', type: 'string', desc: 'upsert：inserted | updated' },
    { key: 'total', type: 'number', desc: 'count：行数；query 分页时为过滤后总数' },
  ],
  validateConfig(config) {
    const cfg = config as { op?: string; scope?: string }
    const errors: string[] = []
    const OPS = ['insert', 'query', 'update', 'delete', 'execute', 'createTable', 'upsert', 'count']
    if (!cfg.op || !OPS.includes(cfg.op)) {
      errors.push(`op 必须是 ${OPS.join('/')}`)
    }
    if (cfg.scope && !['workflow', 'app'].includes(cfg.scope)) {
      errors.push('scope 必须是 workflow 或 app')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      op: 'insert' | 'query' | 'update' | 'delete' | 'execute' | 'createTable' | 'upsert' | 'count'
      dataSourceId?: string
      tableId?: string
      tableName?: string
      /** app=按 definitionId 隔离（应用数据）；缺省 workflow=全局命名空间（历史语义） */
      scope?: 'workflow' | 'app'
      row?: string
      rowId?: string
      sql?: string
      params?: string
      /** createTable：列声明 JSON 数组 [{key,label?,type?}] */
      columns?: string
      /** createTable：去重键，逗号分隔（upsert 判重；建表时锁定） */
      dedupKeys?: string
      filterField?: string
      filterContains?: string
      page?: number
      pageSize?: number
    }

    // 外部数据源模式：读写第三方数据库（路由到数据源驱动）
    if (cfg.dataSourceId) {
      return executeExternalDataTable(ctx, cfg)
    }

    // 内置数据表模式（wf_data_table_*）：app 作用域自动以本运行的工作流定义为属主
    const svc = getVariableDataService()
    const owner = cfg.scope === 'app' ? { scope: 'app' as const, ownerId: ctx.definitionId } : {}
    const parseRowJson = (): Record<string, unknown> | null => {
      try {
        return cfg.row ? JSON.parse(cfg.row) : {}
      } catch {
        return null
      }
    }
    switch (cfg.op) {
      case 'createTable': {
        let columns: Array<{ key: string; label?: string; type?: 'string' | 'number' | 'boolean' | 'json' }> = []
        try {
          const parsed = cfg.columns ? JSON.parse(cfg.columns) : []
          if (Array.isArray(parsed)) columns = parsed
        } catch {
          return { status: 'failed', error: 'data-table: columns 必须是合法 JSON 数组（如 [{"key":"url","type":"string"}]）', retryable: false }
        }
        if (!columns.length || columns.some(c => !c?.key)) {
          return { status: 'failed', error: 'data-table: columns 至少一列且每列必须有 key', retryable: false }
        }
        const dedupKeys = (cfg.dedupKeys ?? '').split(',').map(s => s.trim()).filter(Boolean)
        try {
          const r = await svc.createTable({ name: stringifyValue(cfg.tableName), columns, dedupKeys, ...owner })
          return { status: 'succeeded', output: { tableId: r.tableId, created: r.created } }
        } catch (e) {
          return { status: 'failed', error: e instanceof Error ? e.message : String(e), retryable: false }
        }
      }
      case 'insert': {
        const row = parseRowJson()
        if (!row) return { status: 'failed', error: 'data-table: row 必须是合法 JSON 字符串', retryable: false }
        try {
          const r = await svc.insertRow({ tableId: cfg.tableId, tableName: cfg.tableName, row, ...owner })
          return { status: 'succeeded', output: { tableId: r.tableId, rowId: r.rowId } }
        } catch (e) {
          return { status: 'failed', error: e instanceof Error ? e.message : String(e), retryable: false }
        }
      }
      case 'upsert': {
        const row = parseRowJson()
        if (!row) return { status: 'failed', error: 'data-table: row 必须是合法 JSON 字符串', retryable: false }
        try {
          const r = await svc.upsertRow({ tableId: cfg.tableId, tableName: cfg.tableName, row, ...owner })
          return { status: 'succeeded', output: { tableId: r.tableId, rowId: r.rowId, action: r.action } }
        } catch (e) {
          return { status: 'failed', error: e instanceof Error ? e.message : String(e), retryable: false }
        }
      }
      case 'query': {
        if (cfg.filterField || cfg.filterContains || cfg.page || cfg.pageSize) {
          const r = await svc.queryRowsPaged({
            tableId: cfg.tableId, tableName: cfg.tableName,
            filter: { field: cfg.filterField || undefined, contains: cfg.filterContains || undefined },
            page: cfg.page, pageSize: cfg.pageSize, ...owner,
          })
          return { status: 'succeeded', output: { rows: r.rows, total: r.total } }
        }
        const rows = await svc.queryRows({ tableId: cfg.tableId, tableName: cfg.tableName, ...owner })
        return { status: 'succeeded', output: { rows } }
      }
      case 'count': {
        const total = await svc.countRows({ tableId: cfg.tableId, tableName: cfg.tableName, ...owner })
        return { status: 'succeeded', output: { total } }
      }
      case 'update': {
        const row = parseRowJson()
        if (!row) return { status: 'failed', error: 'data-table: row 必须是合法 JSON 字符串', retryable: false }
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
