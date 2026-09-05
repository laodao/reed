/**
 * 应用模块 IPC 处理器（片3）
 * @module core/packs/app/handlers/app.handler
 * @description 薄适配层：app:* 与 app-session:* 通道统一"单对象参数 → IpcResponse"，
 *              业务在 core 的 app-definition/app-session 服务（架构铁律：handler 不写业务）。
 *              与 workflow.handler 同 via ipcBridge（Electron + Web 双端注册）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getWorkflowSubsystem } from '@core/modules/workflow/workflow-boot'
import type { IpcResponse } from '@shared/types/ipc.types'

function subsystem() {
  return getWorkflowSubsystem()
}

export function registerAppHandlers(): void {
  // ==================== 应用定义 ====================
  ipcBridge.handle('app:list', (_e, p: { keyword?: string; category?: string; pinned?: boolean; page: number; pageSize: number }) =>
    wrap(() => subsystem().appDefinitionService.listApps(p ?? { page: 1, pageSize: 20 }))
  )
  ipcBridge.handle('app:categories', () =>
    wrap(() => subsystem().appDefinitionService.listAppCategories())
  )
  ipcBridge.handle('app:set-pinned', (_e, p: { id: string; pinned: boolean }) =>
    wrap(() => subsystem().appDefinitionService.setPinned(p.id, p.pinned))
  )
  ipcBridge.handle('app:update-meta', (_e, p: { id: string; name?: string; icon?: string | null; description?: string | null; category?: string | null; tags?: string[] }) =>
    wrap(() => subsystem().appDefinitionService.updateMeta(p.id, {
      name: p.name, icon: p.icon, description: p.description, category: p.category, tags: p.tags,
    }))
  )
  ipcBridge.handle('app:get', (_e, p: { id: string }) =>
    wrap(() => subsystem().appDefinitionService.getApp(p.id))
  )
  ipcBridge.handle('app:get-by-definition', (_e, p: { definitionId: string }) =>
    wrap(() => subsystem().appDefinitionService.getAppByDefinitionId(p.definitionId))
  )
  ipcBridge.handle('app:create-from-workflow', (_e, p: { definitionId: string; name?: string; icon?: string; channelSession?: boolean; channelShare?: boolean; channelApi?: boolean }) =>
    wrap(() => subsystem().appDefinitionService.createFromWorkflow(p.definitionId, {
      name: p.name, icon: p.icon,
      channelSession: p.channelSession, channelShare: p.channelShare, channelApi: p.channelApi,
    }))
  )
  ipcBridge.handle('app:update-channels', (_e, p: { id: string; channelSession?: boolean; channelShare?: boolean; channelApi?: boolean }) =>
    wrap(() => subsystem().appDefinitionService.updateChannels(p.id, { channelSession: p.channelSession, channelShare: p.channelShare, channelApi: p.channelApi }))
  )
  ipcBridge.handle('app:enable-share', (_e, p: { id: string }) =>
    wrap(() => subsystem().appDefinitionService.enableShare(p.id))
  )
  ipcBridge.handle('app:disable-share', (_e, p: { id: string }) =>
    wrap(() => subsystem().appDefinitionService.disableShare(p.id))
  )
  ipcBridge.handle('app:set-enabled', (_e, p: { id: string; enabled: boolean }) =>
    wrap(() => subsystem().appDefinitionService.setEnabled(p.id, p.enabled))
  )
  ipcBridge.handle('app:delete', (_e, p: { id: string }) =>
    wrap(async () => { await subsystem().appDefinitionService.deleteApp(p.id); return { deleted: true } })
  )

  // ==================== 应用会话 ====================
  ipcBridge.handle('app-session:list', (_e, p: { appId: string }) =>
    wrap(() => subsystem().appSessionService.listSessions(p.appId))
  )
  ipcBridge.handle('app-session:create', (_e, p: { appId: string; startInputs?: Record<string, unknown> }) =>
    wrap(() => subsystem().appSessionService.createSession(p.appId, p.startInputs))
  )
  ipcBridge.handle('app-session:get', (_e, p: { sessionId: string }) =>
    wrap(() => subsystem().appSessionService.getSession(p.sessionId))
  )
  ipcBridge.handle('app-session:rename', (_e, p: { sessionId: string; title: string }) =>
    wrap(() => subsystem().appSessionService.renameSession(p.sessionId, p.title))
  )
  ipcBridge.handle('app-session:messages', (_e, p: { sessionId: string }) =>
    wrap(() => subsystem().appSessionService.getSessionMessages(p.sessionId))
  )
  ipcBridge.handle('app-session:start', (_e, p: { sessionId: string; inputs?: Record<string, unknown> }) =>
    wrap(() => subsystem().appSessionService.startRun(p.sessionId, p.inputs))
  )
  ipcBridge.handle('app-session:review', (_e, p: { sessionId: string; nodeId: string; decision: 'approve' | 'approve_with_changes' | 'reject'; editedValues?: Record<string, unknown>; choice?: string }) =>
    wrap(() => subsystem().appSessionService.reviewDecide(p.sessionId, p.nodeId, p))
  )
  ipcBridge.handle('app-session:delete', (_e, p: { sessionId: string }) =>
    wrap(async () => { await subsystem().appSessionService.deleteSession(p.sessionId); return { deleted: true } })
  )
}

/** 统一 IpcResponse 包裹（与 workflow.handler.wrap 同构） */
function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ success: true, data }))
    .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))
}