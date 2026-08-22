/**
 * 渲染进程 window.electronAPI 的类型化访问（app 模块相关，AppList/AppDetail/AppSession 三页共用）
 * @module renderer/types/electron-api
 * @description 收敛各页面散落的 `window as never as {...}` 断言（R4 去重复）；
 *              IPC 返回统一 IpcResp 形状，data 类型与 preload 契约严格对应。
 *              其余模块的 api 访问暂未迁移（后续按需逐步收敛到本文件）。
 */

import type { AppRecord, AppSessionRecord } from '@shared/types/app.types'
import type { Message } from '@shared/types/message.types'
import type { AssetRecord } from '@shared/types/asset.types'

/** 统一 IPC 返回（preload invoke 经 ipcBridge 包裹） */
export interface IpcResp<T> {
  success: boolean
  data?: T
  error?: string
}

/** 工作流列表摘要（AppList「从工作流创建」下拉用） */
export interface WorkflowSummary {
  id: string
  name: string
  publishedVersion: number
}

export interface AppApi {
  app: {
    list(p: { keyword?: string; page: number; pageSize: number }): Promise<IpcResp<{ items: Array<AppRecord & { sessionCount: number }>; total: number }>>
    get(id: string): Promise<IpcResp<AppRecord | null>>
    getByDefinition(definitionId: string): Promise<IpcResp<AppRecord | null>>
    createFromWorkflow(p: { definitionId: string; name?: string; icon?: string }): Promise<IpcResp<AppRecord | null>>
    updateChannels(p: { id: string; channelSession?: boolean; channelShare?: boolean; channelApi?: boolean }): Promise<IpcResp<AppRecord | null>>
    enableShare(id: string): Promise<IpcResp<AppRecord | null>>
    disableShare(id: string): Promise<IpcResp<AppRecord | null>>
    setEnabled(id: string, enabled: boolean): Promise<IpcResp<AppRecord | null>>
    delete(id: string): Promise<IpcResp<{ deleted: boolean }>>
  }
  appSession: {
    list(appId: string): Promise<IpcResp<AppSessionRecord[]>>
    create(p: { appId: string; startInputs?: Record<string, unknown> }): Promise<IpcResp<AppSessionRecord | null>>
    get(sessionId: string): Promise<IpcResp<AppSessionRecord | null>>
    rename(sessionId: string, title: string): Promise<IpcResp<AppSessionRecord | null>>
    messages(sessionId: string): Promise<IpcResp<Message[]>>
    start(p: { sessionId: string; inputs?: Record<string, unknown> }): Promise<IpcResp<{ runId: string; status: string }>>
    review(p: { sessionId: string; nodeId: string; decision: string; editedValues?: Record<string, unknown>; choice?: string }): Promise<IpcResp<boolean>>
    delete(sessionId: string): Promise<IpcResp<{ deleted: boolean }>>
  }
  workflow: {
    listDefinitions(p: { page: number; pageSize: number }): Promise<IpcResp<{ items: WorkflowSummary[]; total: number }>>
    onRunEvent(cb: (e: { runId?: string } & Record<string, unknown>) => void): () => void
  }
  assets: {
    list(p: { category?: string; keyword?: string; page: number; pageSize: number }): Promise<IpcResp<{ items: AssetRecord[]; total: number }>>
    get(id: string): Promise<IpcResp<AssetRecord | null>>
    create(p: {
      category?: string
      name?: string
      description?: string
      tags?: string[]
      content: { kind: 'file'; path: string } | { kind: 'url'; url: string } | { kind: 'text'; text: string } | { kind: 'json'; json: string }
    }): Promise<IpcResp<AssetRecord | null>>
    update(p: { id: string; name?: string; description?: string | null; tags?: string[]; category?: string }): Promise<IpcResp<AssetRecord | null>>
    delete(id: string): Promise<IpcResp<{ deleted: boolean }>>
    stats(): Promise<IpcResp<{ total: number; byCategory: Record<string, number> }>>
    openFolder(id: string): Promise<IpcResp<{ opened: boolean }>>
  }
  file: {
    openDialog(options?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }): Promise<{
      success: boolean
      error?: string
      files: Array<{ id: string; fileName: string; filePath: string; fileSize: number; mimeType: string; type: string }>
    }>
  }
}

/** 取类型化 electronAPI（单点断言；未来可迁移为全局 window 声明） */
export function electronApi(): AppApi {
  return (window as unknown as { electronAPI: AppApi }).electronAPI
}
