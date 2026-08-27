/**
 * favicon IPC 处理器
 * @module electron/ipc/handlers/favicon.handler
 * @description 按站点 URL 抓取并缓存其 favicon（data: URL 返回给渲染进程）。
 *              与 news-source.handler 同 via ipcBridge（Electron + Web 双端注册）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getFaviconService } from '@core/services/favicon.service'
import type { IpcResponse } from '@shared/types/ipc.types'

export function registerFaviconHandlers(): void {
  ipcBridge.handle('favicon:get', (_e, p: { url?: string }) =>
    wrap(async () => {
      if (!p?.url) throw new Error('缺少站点 URL')
      return getFaviconService().getFavicon(p.url)
    })
  )
}

/** 统一 IpcResponse 包裹 */
function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ success: true, data }))
    .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))
}
