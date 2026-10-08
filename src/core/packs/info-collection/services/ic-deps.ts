/**
 * 信息搜集服务依赖注入面（照搬 kb-brain 纪律：所有外部效应皆可注入，测试零成本）
 * @module core/packs/info-collection/services/ic-deps
 *
 * 生产缺省：repos → getCoreDatabaseManager()；llm → simple-llm（purpose 区分用途）；
 * search → SearchEngineService 默认引擎解析（ai-nodes web-search 同款优先级）；
 * fetch → executeHttpFetch（自带 SSRF 闸门/超时/限长，服务层不再包一层）；
 * extract → htmlToMarkdown；kb → KnowledgeBaseService.addDocument（自动切块/嵌入）。
 */

import type { DataSource } from 'typeorm'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type {
  IcProjectRepository,
  IcProjectRow,
} from '@core/database/repositories/ic-project.repository'
import type { IcTaskRepository, IcTaskRow } from '@core/database/repositories/ic-task.repository'
import type {
  IcTaskPassRepository,
  IcPassRow,
} from '@core/database/repositories/ic-task-pass.repository'
import type {
  IcSourceRepository,
  IcSourceRow,
} from '@core/database/repositories/ic-source.repository'
import type { IcRowRepository, IcRowItem } from '@core/database/repositories/ic-row.repository'

/** 单轮文本 LLM（与 kb-brain BrainLlmFn 同形；purpose 由缺省实现内部区分） */
export type IcLlmFn = (req: { system: string; user: string; maxTokens?: number }) => Promise<string>

export interface IcSearchItem {
  title: string
  url: string
  snippet: string
}

export type IcSearchFn = (query: string, maxResults: number) => Promise<{ items: IcSearchItem[]; error?: string }>

export interface IcFetchedDoc {
  ok: boolean
  status: number
  body: string
  /** blocked = 反爬/限流（进手动导入建议清单，不重试硬撞） */
  blocked?: boolean
  error?: string
}

export type IcFetchFn = (url: string) => Promise<IcFetchedDoc>

/** 文档直链下载（多模态 M1）：原件落盘 + MIME + 字节数（executeHttpFetch responseType='file' 同形） */
export interface IcDocumentFetched {
  ok: boolean
  status: number
  /** 下载落盘的临时文件绝对路径（资产服务会复制进统一资产目录） */
  filePath?: string
  mimeType?: string
  bytes?: number
  error?: string
}

export type IcDocumentFetchFn = (url: string) => Promise<IcDocumentFetched>

/** 视频页元数据+字幕（多模态 M3 元数据档）：不下载视频原件 */
export interface IcVideoMeta {
  ok: boolean
  platform: string
  title?: string
  desc?: string
  owner?: string
  durationSec?: number
  /** CC 字幕全文（视频带字幕且可匿名获取时；否则缺省） */
  subtitleText?: string
  error?: string
}

export type IcVideoMetaFn = (url: string) => Promise<IcVideoMeta>

/**
 * 视觉描述（多模态 M2）：图片原件 → 结构化描述文本（即图片的内容化文本）。
 * 模型须支持 vision；失败走 fail-soft（资产只存原件，描述标记待补）。
 */
export interface IcVisionFn {
  (req: { imagePath: string; mimeType?: string; prompt: string }): Promise<{ ok: boolean; text?: string; error?: string }>
}

export type IcExtractFn = (html: string, baseUrl: string) => string

/**
 * 统一资产登记口（多模态 M1）：文档原件 + 内容化文本在 assets 表建卡，
 * "一资产一文件一正文"（SaveAssetInput 同形收窄）。测试注入内存假件。
 */
export interface IcAssetPort {
  create(input: {
    name: string
    category: string
    subCategory?: string
    tags?: string[]
    filePath: string
    textContent?: string
    url?: string
    mimeType?: string
    metadata?: Record<string, unknown>
    sourceType?: string
    sourceRef?: string
  }): Promise<{ id: string }>
  /** 删卡删原件（驳回时调用；资产不存在时静默成功） */
  remove(id: string): Promise<void>
  /** 纯文本卡（视频元数据/字幕等无原件资料；多模态 M3） */
  createText(input: {
    name: string
    category: string
    subCategory?: string
    tags?: string[]
    text: string
    url?: string
    metadata?: Record<string, unknown>
    sourceType?: string
    sourceRef?: string
  }): Promise<{ id: string }>
}

/** 知识库导入口（内容唯一存储在 kb；每源一文档） */
export interface IcKbPort {
  addDocument(
    kbId: string,
    doc: { name: string; content: string; sourceId: string },
  ): Promise<{ documentId: string | null; error?: string }>
}

/** 快照存取（先保命再解析；M1 生产接线 dataPath，缺省 null = 跳过快照并如实降级） */
export interface IcSnapshotStore {
  write(projectId: string, sourceId: string, html: string, markdown: string): Promise<string | null>
  read(path: string): Promise<string | null>
}

export interface IcRepos {
  projects: IcProjectRepository
  tasks: IcTaskRepository
  passes: IcTaskPassRepository
  sources: IcSourceRepository
  rows: IcRowRepository
}

export type IcReposFn = () => IcRepos | null

export interface IcCollectionDeps {
  /** 缺省 getCoreDatabaseManager() 的 ic 五仓储；测试传内存库仓储集 */
  repos?: IcReposFn
  llm?: IcLlmFn
  /** 第二模型复核（独立意见；缺省 simple-llm purpose='ic-review' 走不同模型档） */
  reviewLlm?: IcLlmFn
  search?: IcSearchFn
  fetch?: IcFetchFn
  /** 文档直链下载（缺省 executeHttpFetch responseType='file'；未注入 = 不启用文档分支） */
  documentFetch?: IcDocumentFetchFn
  /** 视觉描述（缺省宿主模型经平台多模态链路；未配置 vision 模型时 fail-soft 跳过描述） */
  vision?: IcVisionFn
  /** 视频页元数据+字幕（缺省 B站公开 API；未注入 = 不启用视频分支） */
  videoMeta?: IcVideoMetaFn
  extract?: IcExtractFn
  kb?: IcKbPort
  /** 统一资产登记（缺省接 getAssetService；未注入 = 不建卡，ic_source.assetId 留空） */
  assets?: IcAssetPort
  snapshotStore?: IcSnapshotStore | null
  /** id 生成（缺省 crypto.randomUUID）；测试注入确定性序列 */
  newId?: (prefix: string) => string
}

export type { IcProjectRow, IcTaskRow, IcPassRow, IcSourceRow, IcRowItem, ICoreDatabaseManager, DataSource }
