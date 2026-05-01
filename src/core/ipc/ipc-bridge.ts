/**
 * IPC 桥接注册表（平台无关）
 * @module core/ipc/ipc-bridge
 * @description 把"channel → 处理函数"统一登记到一个表里，再由两端各自胶水化：
 *              - Electron：在主进程启动时遍历，调用 ipcMain.handle(channel, fn)
 *              - Web：在 Express 启动时遍历，挂 POST /api/ipc/<channel>
 *
 *              业务侧只需调用 registerIpc(channel, handler)，无需关心运行环境。
 */

/**
 * IPC 处理函数签名：参数从客户端透传，返回值序列化回去。
 * 实现侧应当用 try/catch 包裹，返回值不需要遵循 { success } 格式（保留与现有
 * Electron handler 一致的语义即可）。
 */
export type IpcHandler = (...args: unknown[]) => unknown | Promise<unknown>

const handlers = new Map<string, IpcHandler>()

/**
 * 注册一个 channel 的处理器。重复注册会覆盖（与 ipcMain.handle 行为一致）。
 */
export function registerIpc(channel: string, handler: IpcHandler): void {
  handlers.set(channel, handler)
}

/**
 * 取得所有已注册 channel（供 Electron / Web 启动时遍历）
 */
export function getAllIpcHandlers(): ReadonlyMap<string, IpcHandler> {
  return handlers
}

/**
 * 直接调用某个 channel（供 Web HTTP 路由内部转发）。未注册时抛错。
 */
export async function invokeIpc(channel: string, args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`[IPC] 未注册的 channel: ${channel}`)
  return await fn(...args)
}

/**
 * （仅测试用）清空注册表。
 */
export function _clearIpcHandlers(): void {
  handlers.clear()
}
