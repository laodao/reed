/**
 * IPC handler 平台工具函数
 * @module ipc/handlers/_platform
 * @description 跨端 handler 共用：Electron 模块懒加载（Web 模式不会触发 require('electron')），
 *              以及 BrowserWindow / dialog / shell 等 Electron API 的访问入口。
 */

export const isElectron =
  !!(process.versions as Record<string, string | undefined>)?.electron

interface ElectronModules {
  BrowserWindow?: any
  dialog?: any
  shell?: any
  app?: any
}

let cached: ElectronModules | null = null

/**
 * 懒加载 electron 模块（Web 模式返回空对象）
 */
export function loadElectronModules(): ElectronModules {
  if (!isElectron) return {}
  if (cached) return cached
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const e = require('electron')
  cached = {
    BrowserWindow: e.BrowserWindow,
    dialog: e.dialog,
    shell: e.shell,
    app: e.app,
  }
  return cached
}

/**
 * 从 IPC event 获取 BrowserWindow（Web 模式返回 null）
 */
export function getBrowserWindowFromEvent(event: any): any {
  if (!isElectron) return null
  const { BrowserWindow } = loadElectronModules()
  return BrowserWindow?.fromWebContents(event?.sender) ?? null
}
