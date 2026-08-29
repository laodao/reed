/**
 * IPC 桥接适配器（跨平台）
 * @module core/ipc/bridge-adapter
 * @description 业务侧统一调用 ipcBridge.handle(channel, fn)，由本模块按平台分发：
 *              - 总是注册到跨平台 ipc-bridge 注册表（Web HTTP 路由从这里取）
 *              - 若运行在 Electron 主进程，**额外**注册到 ipcMain.handle（IPC 通道）
 *
 *              注：handler 函数签名与 Electron 兼容：(event, ...args) → result。
 *              在 Web 端 event 会传一个空对象（fake），handler 不应依赖 event 内部细节
 *              （Phase 2 已经把 event.sender / BrowserWindow.fromWebContents 等
 *              逻辑都拆到 IPC handler 文件里、移出 service，所以 web 端直接传 {} 即可）。
 */

import { registerIpc } from './ipc-bridge'
import { guardIpcHandler } from '../packs/ipc-guard'

export type ElectronCompatHandler = (event: any, ...args: any[]) => unknown | Promise<unknown>

interface IpcBridge {
  handle(channel: string, handler: ElectronCompatHandler): void
  removeHandler(channel: string): void
}

const isElectronMain =
  typeof process !== 'undefined' &&
  !!(process.versions as Record<string, string | undefined>)?.electron &&
  // 只有主进程才有 process.type === 'browser' / undefined（preload/renderer 是 'renderer'）
  ((process as any).type === undefined || (process as any).type === 'browser')

let cachedIpcMain: any = null
function getElectronIpcMain(): any {
  if (!isElectronMain) return null
  if (cachedIpcMain !== null) return cachedIpcMain
  // 用 require 而非 import，避免在非 Electron 端打包/解析时报错
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  cachedIpcMain = require('electron').ipcMain
  return cachedIpcMain
}

export const ipcBridge: IpcBridge = {
  handle(channel: string, handler: ElectronCompatHandler): void {
    // 0. 业务包 IPC 守卫：明确属于某包且该包被禁用/pending 的 channel 统一拦截
    //    （归属未声明的 channel 放行；详见 core/packs/ipc-guard）。
    //    在注册点包一层 → Electron（ipcMain）与 Web（invokeIpc）两条路径同时生效。
    const guarded = guardIpcHandler(channel, handler) as ElectronCompatHandler

    // 1. 总是注册到跨平台桥（Web HTTP 路由从此取）
    //    Web 端没有真实 IpcMainInvokeEvent，传一个 fake 占位对象。
    const fakeEvent = { sender: { send: () => {} } }
    registerIpc(channel, async (...args: unknown[]) => {
      return guarded(fakeEvent, ...args)
    })

    // 2. 若在 Electron 主进程，额外注册到 ipcMain
    const ipcMain = getElectronIpcMain()
    if (ipcMain) {
      ipcMain.handle(channel, guarded)
    }
  },

  removeHandler(channel: string): void {
    const ipcMain = getElectronIpcMain()
    if (ipcMain) ipcMain.removeHandler(channel)
    // 注：跨平台桥的 registerIpc 没有 remove；若有需要再补
  },
}
