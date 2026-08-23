/**
 * 新闻来源模块 IPC 处理器（内置应用 C1 早报 / C2 周报的数据源管理）
 * @module electron/ipc/handlers/news-source.handler
 * @description 薄适配层：newsSource:* 通道 → NewsSourceRepository（业务在仓库层）。
 *              与 asset.handler 同 via ipcBridge（Electron + Web 双端注册）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'

function repo() {
  const db = getCoreDatabaseManager()
  if (!db.newsSources) throw new Error('新闻来源仓库未初始化')
  return db.newsSources
}

export function registerNewsSourceHandlers(): void {
  ipcBridge.handle('newsSource:list', (_e, p: { topicId?: string; keyword?: string }) =>
    wrap(() => repo().list({ topicId: p.topicId ?? '', keyword: p.keyword }))
  )
  ipcBridge.handle('newsSource:get', (_e, p: { id: string }) =>
    wrap(() => repo().findById(p.id))
  )
  ipcBridge.handle('newsSource:create', (_e, p: { topicId: string; name: string; url: string }) =>
    wrap(() => repo().create({ topicId: p.topicId, name: p.name, url: p.url }))
  )
  ipcBridge.handle('newsSource:update', (_e, p: { id: string; topicId?: string; name?: string; url?: string; enabled?: boolean }) =>
    wrap(() => repo().update(p.id, { topicId: p.topicId, name: p.name, url: p.url, enabled: p.enabled }))
  )
  ipcBridge.handle('newsSource:delete', (_e, p: { id: string }) =>
    wrap(async () => ({ deleted: await repo().delete(p.id) }))
  )
}

/** 统一 IpcResponse 包裹 */
function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ success: true, data }))
    .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))
}
