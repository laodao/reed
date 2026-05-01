/**
 * Web 端 IPC channel 注册入口
 * @module web/server/api/register-channels
 * @description 通过 import + 调用各 handler 文件的 register 函数，触发 ipcBridge.handle
 *              注册到跨平台桥。Electron 端在主进程启动时也会调用同样的 register 函数，
 *              所以同一份 handler 代码两端复用。
 *
 *              新增 channel 时只需在对应 handler 文件 ipcBridge.handle 即可，无需在
 *              本文件维护映射表。
 */

import { registerSettingsHandlers } from '@electron/ipc/handlers/settings.handler'

export async function registerAllWebChannels(): Promise<void> {
  // 复用 Electron handler 文件（已通过 ipcBridge.handle 注册到跨平台桥；
  // 在 Web 端运行时 process.versions.electron 不存在，不会触发 ipcMain.handle 分支）
  registerSettingsHandlers()

  // TODO: 后续逐个迁移其他 handler 到 ipcBridge.handle 形态后，在此追加 import + register。
  //       已迁移：settings
  //       待迁移：apiKey / providerConfig / dialog / message / role / image / voice /
  //              knowledge-base / longwriting / diary / search-engine / oss / ...
}
