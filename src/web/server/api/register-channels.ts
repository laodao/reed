/**
 * Web 端 IPC channel 注册入口
 * @module web/server/api/register-channels
 * @description import + 调用各 handler 文件的 register 函数，触发 ipcBridge.handle
 *              注册到跨平台桥。Electron 端在主进程启动时也会调用同样的 register 函数，
 *              所以同一份 handler 代码两端复用。
 *
 *              新增 channel 时只需在对应 handler 文件 ipcBridge.handle 即可，无需在
 *              本文件维护映射表。仅在 handler 文件未被 Electron 流程主动 register 时
 *              才需要在此添加 import + register（目前共用同一组 register 函数）。
 */

import { registerSettingsHandlers } from '@electron/ipc/handlers/settings.handler'
import { registerApiKeyHandlers } from '@electron/ipc/handlers/api-key.handler'
import { registerRoleHandlers } from '@electron/ipc/handlers/role.handler'
import { registerMessageHandlers } from '@electron/ipc/handlers/message.handler'
import { registerDialogHandlers } from '@electron/ipc/handlers/dialog.handler'
import { registerOSSHandlers } from '@electron/ipc/handlers/oss.handler'
import { registerProviderConfigHandlers } from '@electron/ipc/handlers/provider-config.handler'
import { registerSearchEngineHandlers } from '@electron/ipc/handlers/search-engine.handler'

export async function registerAllWebChannels(): Promise<void> {
  // 已迁移到 ipcBridge 的 handler：导入即注册（在 Web 端运行时
  // process.versions.electron 不存在，不会触发 ipcMain.handle 分支）
  registerSettingsHandlers()
  registerApiKeyHandlers()
  registerRoleHandlers()
  registerMessageHandlers()
  registerDialogHandlers()
  registerOSSHandlers()
  registerProviderConfigHandlers()
  registerSearchEngineHandlers()

  // TODO 待迁移：image / voice / chat / knowledge-base / longwriting / diary /
  //              portrait / story-to-video / translation / file / export / data-path
}
