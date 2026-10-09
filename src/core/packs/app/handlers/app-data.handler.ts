/**
 * 应用数据（app-data）IPC 处理器（2026-10-08 应用数据层，设计 §3.5）
 * @module core/packs/app/handlers/app-data.handler
 * @description 应用详情页「数据」页签的浏览/删行/删表/导出：
 *              - 通道前缀 app-data:（app 包 manifest 声明，IPC 守卫统一拦截）
 *              - appId → 应用 → sourceId(definitionId) → 该 definition 的 app 作用域表
 *              - 业务在 VariableDataService（架构铁律：handler 不写业务）
 *              - V1 只读浏览 + 删行/删表 + CSV 导出；整行编辑后置（JSON 行覆盖易误伤）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getWorkflowSubsystem } from '@core/platform/workflow/workflow-boot'
import { getVariableDataService, parseDedupKeys } from '@core/platform/workflow/variables/variable-data.service'
import type { AppDataTableDto } from '@shared/types/app.types'
import type { DataTableDef } from '@shared/types/variable.types'
import type { IpcResponse } from '@shared/types/ipc.types'

function subsystem() {
  return getWorkflowSubsystem()
}

/** 应用数据表 DTO（页签列表用：列声明解析后的形态；类型在 shared/types/app.types 双端同源） */
function toDto(t: DataTableDef & { rowCount: number }): AppDataTableDto {
  let columns: Array<{ key: string; label?: string; type?: string }> = []
  try {
    const parsed = JSON.parse(t.columnsJson)
    if (Array.isArray(parsed)) columns = parsed
  } catch { /* 列声明损坏按空处理 */ }
  return {
    id: t.id,
    name: t.name,
    columns,
    dedupKeys: parseDedupKeys(t.dedupKeysJson),
    rowCount: t.rowCount,
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
    updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : null,
  }
}

/** appId → definitionId（应用不存在即抛错；应用=工作流发布产物，sourceId 即定义 id） */
async function resolveOwnerId(appId: string): Promise<string> {
  const app = await subsystem().appDefinitionService.getApp(appId)
  if (!app) throw new Error('应用不存在')
  return app.sourceId
}

export function registerAppDataHandlers(): void {
  ipcBridge.handle('app-data:list-tables', (_e, p: { appId: string }) =>
    wrap(async () => {
      const ownerId = await resolveOwnerId(p.appId)
      const tables = await getVariableDataService().listTablesForOwner('app', ownerId)
      return { tables: tables.map(toDto) }
    })
  )

  ipcBridge.handle('app-data:query-rows', (_e, p: {
    appId: string
    tableId: string
    filterField?: string
    filterContains?: string
    page?: number
    pageSize?: number
  }) =>
    wrap(async () => {
      const ownerId = await resolveOwnerId(p.appId)
      // 越权防线：表必须属于该应用的 app 作用域（app-data 通道只见本应用数据）
      const table = await getVariableDataService().getTableDef(p.tableId)
      if (!table || table.scope !== 'app' || table.ownerId !== ownerId) {
        throw new Error('数据表不存在或不属于该应用')
      }
      return getVariableDataService().queryRowsPaged({
        tableId: p.tableId,
        filter: { field: p.filterField || undefined, contains: p.filterContains || undefined },
        page: p.page,
        pageSize: p.pageSize,
      })
    })
  )

  ipcBridge.handle('app-data:delete-row', (_e, p: { appId: string; tableId: string; rowId: string }) =>
    wrap(async () => {
      const ownerId = await resolveOwnerId(p.appId)
      const table = await getVariableDataService().getTableDef(p.tableId)
      if (!table || table.scope !== 'app' || table.ownerId !== ownerId) {
        throw new Error('数据表不存在或不属于该应用')
      }
      await getVariableDataService().deleteRow(p.rowId)
      return { deleted: true }
    })
  )

  ipcBridge.handle('app-data:delete-table', (_e, p: { appId: string; tableId: string }) =>
    wrap(async () => {
      const ownerId = await resolveOwnerId(p.appId)
      const table = await getVariableDataService().getTableDef(p.tableId)
      if (!table || table.scope !== 'app' || table.ownerId !== ownerId) {
        throw new Error('数据表不存在或不属于该应用')
      }
      await getVariableDataService().deleteTableCascade(p.tableId)
      return { deleted: true }
    })
  )

  ipcBridge.handle('app-data:export-csv', (_e, p: { appId: string; tableId: string }) =>
    wrap(async () => {
      const ownerId = await resolveOwnerId(p.appId)
      const table = await getVariableDataService().getTableDef(p.tableId)
      if (!table || table.scope !== 'app' || table.ownerId !== ownerId) {
        throw new Error('数据表不存在或不属于该应用')
      }
      const rows = await getVariableDataService().queryRows({ tableId: p.tableId })
      const columns = toDto({ ...table, rowCount: rows.length }).columns
      const header = ['id', ...columns.map(c => c.key)]
      // 未声明列兜底：行里出现但列声明没有的键也导出（数据完整性优先）
      const extraKeys = new Set<string>()
      for (const r of rows) {
        for (const k of Object.keys(r)) {
          if (k !== 'id' && !header.includes(k)) extraKeys.add(k)
        }
      }
      header.push(...extraKeys)
      const lines = [header.map(csvEscape).join(',')]
      for (const r of rows) {
        lines.push(header.map(h => csvEscape(r[h] === undefined ? '' : r[h])).join(','))
      }
      // BOM：Excel 打开中文不乱码
      return { filename: `${table.name}.csv`, csv: '\uFEFF' + lines.join('\r\n') }
    })
  )
}

/** CSV 字段转义（含逗号/引号/换行的字段加引号并双写引号） */
function csvEscape(v: unknown): string {
  const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** 统一 IpcResponse 包裹（与 app.handler.wrap 同构） */
function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return Promise.resolve()
    .then(fn)
    .then(data => ({ success: true as const, data }))
    .catch(err => ({ success: false as const, error: err instanceof Error ? err.message : String(err) }))
}
