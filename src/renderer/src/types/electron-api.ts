/**
 * 渲染进程 window.electronAPI 的类型化访问（app 模块相关，AppList/AppDetail/AppSession 三页共用）
 * @module renderer/types/electron-api
 * @description 收敛各页面散落的 `window as never as {...}` 断言（R4 去重复）；
 *              IPC 返回统一 IpcResp 形状，data 类型与 preload 契约严格对应。
 *              其余模块的 api 访问暂未迁移（后续按需逐步收敛到本文件）。
 */

import type { AppRecord, AppSessionRecord } from '@shared/types/app.types'
import type { Message } from '@shared/types/message.types'
import type { AssetCategoryDef, AssetGroupRecord, AssetPreviewResult, AssetPreviewTemplateOption, AssetRecord, AssetSourceLink } from '@shared/types/asset.types'

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
    list(p: { keyword?: string; category?: string; pinned?: boolean; page: number; pageSize: number }): Promise<IpcResp<{ items: Array<AppRecord & { sessionCount: number }>; total: number }>>
    get(id: string): Promise<IpcResp<AppRecord | null>>
    getByDefinition(definitionId: string): Promise<IpcResp<AppRecord | null>>
    createFromWorkflow(p: { definitionId: string; name?: string; icon?: string; category?: string; tags?: string[]; channelSession?: boolean; channelShare?: boolean; channelApi?: boolean }): Promise<IpcResp<AppRecord | null>>
    updateChannels(p: { id: string; channelSession?: boolean; channelShare?: boolean; channelApi?: boolean }): Promise<IpcResp<AppRecord | null>>
    setPinned(id: string, pinned: boolean): Promise<IpcResp<AppRecord | null>>
    updateMeta(p: { id: string; name?: string; icon?: string | null; description?: string | null; category?: string | null; tags?: string[] }): Promise<IpcResp<AppRecord | null>>
    categories(): Promise<IpcResp<Array<{ category: string; count: number }>>>
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
    list(p: { category?: string; subCategory?: string; keyword?: string; page: number; pageSize: number }): Promise<IpcResp<{ items: AssetRecord[]; total: number }>>
    get(id: string): Promise<IpcResp<AssetRecord | null>>
    create(p: {
      category?: string
      subCategory?: string
      name?: string
      description?: string
      tags?: string[]
      content: { kind: 'file'; path: string } | { kind: 'url'; url: string } | { kind: 'text'; text: string } | { kind: 'json'; json: string }
    }): Promise<IpcResp<AssetRecord | null>>
    update(p: { id: string; name?: string; description?: string | null; tags?: string[]; category?: string; subCategory?: string | null }): Promise<IpcResp<AssetRecord | null>>
    delete(id: string): Promise<IpcResp<{ deleted: boolean }>>
    stats(): Promise<IpcResp<{ total: number; byCategory: Record<string, number> }>>
    subCategoryStats(category: string): Promise<IpcResp<Array<{ subCategory: string | null; count: number }>>>
    openFolder(id: string): Promise<IpcResp<{ opened: boolean }>>
    /** 打开套图/组图所在目录（组内首个文件成员定位） */
    groupOpenFolder(groupId: string): Promise<IpcResp<{ opened: boolean }>>
    /** 分类定义（业务分类实体：驱动资产中心分组与预览） */
    listCategories(p?: { category?: string }): Promise<IpcResp<AssetCategoryDef[]>>
    createCategory(p: {
      name: string
      code?: string
      allowedKinds?: string[]
      allowedCategories?: string[]
      previewable?: boolean
      previewMode?: string
      previewTemplateId?: string | null
      sortOrder?: number
    }): Promise<IpcResp<AssetCategoryDef | null>>
    updateCategory(p: {
      id: string
      name?: string
      code?: string | null
      allowedKinds?: string[]
      allowedCategories?: string[]
      previewable?: boolean
      previewMode?: string
      previewTemplateId?: string | null
      sortOrder?: number
    }): Promise<IpcResp<AssetCategoryDef | null>>
    deleteCategory(id: string): Promise<IpcResp<{ deleted: boolean }>>
    /** 分类驱动预览渲染（早报/周报 → 长图 data URL；Web → HTML） */
    previewRender(assetId: string): Promise<IpcResp<AssetPreviewResult | null>>
    previewTemplates(): Promise<IpcResp<AssetPreviewTemplateOption[]>>
    /** 资产来源跳转（需求 3：资产 → 产出它的应用/工作流执行历史） */
    sourceLink(assetId: string): Promise<IpcResp<AssetSourceLink | null>>
    /** 资产组详情（需求 2：组卡片 → 组内成员画廊） */
    groupDetail(groupId: string): Promise<IpcResp<{ group: AssetGroupRecord; members: AssetRecord[] } | null>>
  }
  /** 新闻来源库（内置应用 C1 早报 / C2 周报的数据源管理） */
  newsSource: {
    list(p: { topicId?: string; keyword?: string }): Promise<IpcResp<Array<{ id: string; topicId: string; name: string; url: string; isBuiltin: boolean; enabled: boolean; sortOrder: number }>>>
    get(id: string): Promise<IpcResp<{ id: string; topicId: string; name: string; url: string; isBuiltin: boolean; enabled: boolean } | null>>
    create(p: { topicId: string; name: string; url: string }): Promise<IpcResp<{ id: string; topicId: string; name: string; url: string } | null>>
    update(p: { id: string; topicId?: string; name?: string; url?: string; enabled?: boolean }): Promise<IpcResp<{ id: string; topicId: string; name: string; url: string } | null>>
    delete(id: string): Promise<IpcResp<{ deleted: boolean }>>
  }
  file: {
    openDialog(options?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }): Promise<{
      success: boolean
      error?: string
      files: Array<{ id: string; fileName: string; filePath: string; fileSize: number; mimeType: string; type: string }>
    }>
    readTextFile(p: { path: string }): Promise<{ success: boolean; data?: string; error?: string }>
  }
}

/** 取类型化 electronAPI（单点断言；未来可迁移为全局 window 声明） */
export function electronApi(): AppApi {
  return (window as unknown as { electronAPI: AppApi }).electronAPI
}
