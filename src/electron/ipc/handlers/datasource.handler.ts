/**
 * 数据源（第三方数据库）配置 IPC 处理器
 * @module ipc/handlers/datasource.handler
 * @description 处理数据源 CRUD + testConnection。密码经 SecureStorage 加密后落库，
 *              绝不明文返回。执行 SQL 走 DataSourceService（节点取用的同一执行器）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { DataSourceService, getDataSourceService } from '@core/modules/workflow/datasource/datasource.service'
import type { IpcResponse } from '@shared/types/ipc.types'
import type {
  CreateDataSourceRequest,
  UpdateDataSourceRequest,
} from '@shared/types/datasource.types'

function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return fn().then(
    data => ({ success: true, data }),
    (error: any) => ({ success: false, error: error?.message || '操作失败' }),
  )
}

/** 数据源 → 前端视图（密码遮盖，不返回密文） */
function toView(config: any) {
  if (!config) return config
  return {
    ...config,
    passwordEnc: undefined,
    hasPassword: !!config.passwordEnc,
  }
}

/** 注册数据源 IPC 处理器 */
export function registerDataSourceHandlers(): void {
  // 优先用已装配的单例（workflow-boot）；未装配时按 repository 直接构造（设置页可用）
  const svc = (): DataSourceService => {
    try {
      return getDataSourceService()
    } catch {
      const db = getCoreDatabaseManager()
      if (!db.dataSources) throw new Error('数据源仓库未初始化')
      return new DataSourceService(db.dataSources)
    }
  }

  ipcBridge.handle('datasource:list', () => wrap(async () => {
    const list = await svc().list()
    return list.map(toView)
  }))

  ipcBridge.handle('datasource:list-eligible', () => wrap(async () => {
    const list = await svc().listEligible()
    return list.map(toView)
  }))

  ipcBridge.handle('datasource:create', (_e: any, req: CreateDataSourceRequest) => wrap(async () => {
    const created = await svc().create(req)
    return toView(created)
  }))

  ipcBridge.handle('datasource:update', (_e: any, payload: { id: string; req: UpdateDataSourceRequest }) => wrap(async () => {
    const ok = await svc().update(payload.id, payload.req)
    return { ok }
  }))

  ipcBridge.handle('datasource:delete', (_e: any, id: string) => wrap(async () => {
    const ok = await svc().delete(id)
    return { ok }
  }))

  ipcBridge.handle('datasource:toggle-enabled', (_e: any, id: string) => wrap(async () => {
    const ok = await svc().toggleEnabled(id)
    return { ok }
  }))

  ipcBridge.handle('datasource:test-connection', (_e: any, id: string) => wrap(async () => {
    return svc().testConnection(id)
  }))

  console.log('[DataSourceHandlers] 数据源 IPC 处理器已注册')
}
