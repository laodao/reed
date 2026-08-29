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
import { registerOSSHandlers } from '@electron/ipc/handlers/oss.handler'
import { registerProviderConfigHandlers } from '@electron/ipc/handlers/provider-config.handler'
import { registerSearchEngineHandlers } from '@electron/ipc/handlers/search-engine.handler'
import { registerTranslationHandlers } from '@electron/ipc/handlers/translation.handler'
import { registerImageHandlers } from '@electron/ipc/handlers/image.handler'
import { registerKnowledgeBaseHandlers } from '@electron/ipc/handlers/knowledge-base.handler'
import { registerWorkflowHandlers } from '@electron/ipc/handlers/workflow.handler'
import { registerAppHandlers } from '@electron/ipc/handlers/app.handler'
import { registerToolHandlers } from '@electron/ipc/handlers/tool.handler'
import { registerEmailHandlers } from '@electron/ipc/handlers/email.handler'
import { registerAssetHandlers } from '@electron/ipc/handlers/asset.handler'
import { registerNewsSourceHandlers } from '@electron/ipc/handlers/news-source.handler'
import { registerFaviconHandlers } from '@electron/ipc/handlers/favicon.handler'
import { registerDataSourceHandlers } from '@electron/ipc/handlers/datasource.handler'
import { registerFileHandlers } from '@electron/ipc/handlers/file.handler'
import { registerExportHandlers } from '@electron/ipc/handlers/export.handler'
import { registerDataPathHandlers } from '@electron/ipc/handlers/data-path.handler'
import { registerPackHandlers } from '@electron/ipc/handlers/pack.handler'

export async function registerAllWebChannels(): Promise<void> {
  // 已迁移到 ipcBridge 的 handler：导入即注册（在 Web 端运行时
  // process.versions.electron 不存在，不会触发 ipcMain.handle 分支）
  registerSettingsHandlers()
  registerApiKeyHandlers()
  registerOSSHandlers()
  registerProviderConfigHandlers()
  registerSearchEngineHandlers()
  registerTranslationHandlers()
  registerImageHandlers()
  registerKnowledgeBaseHandlers()
  registerWorkflowHandlers()
  registerAppHandlers()
  registerToolHandlers()
  registerEmailHandlers()
  registerAssetHandlers()
  registerNewsSourceHandlers()
  registerFaviconHandlers()
  // skills/diary/portrait/chat/voice-design/longwriting/episode-production 七个业务的
  // handler 已迁移为内置业务包（core/packs/builtin-packs），由包内核激活时注册，不再在
  // 此平铺（避免重复注册；skill 系 channel 此前 Web 端未登记，迁移后随 skills 包激活在
  // Web 端补齐；episode-production 此前双端登记一致，迁移后行为无差异）
  // 数据源：Web 端仓储/服务/驱动已由 workflow-boot 装配（web-database-manager +
  // initWorkflowSubsystem），此前只缺 IPC 这一环，导致 Web 端数据源管理不可用
  registerDataSourceHandlers()
  registerFileHandlers()
  registerExportHandlers()
  // data-path 仅在 Electron 端有意义，函数内部已 isElectron 判断
  registerDataPathHandlers()
  // 业务包（pack:list / pack:setEnabled）：Web 端同样经 ipcBridge 暴露
  registerPackHandlers()
}
