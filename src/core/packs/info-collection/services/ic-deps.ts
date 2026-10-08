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

export type IcExtractFn = (html: string, baseUrl: string) => string

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
  extract?: IcExtractFn
  kb?: IcKbPort
  snapshotStore?: IcSnapshotStore | null
  /** id 生成（缺省 crypto.randomUUID）；测试注入确定性序列 */
  newId?: (prefix: string) => string
}

export type { IcProjectRow, IcTaskRow, IcPassRow, IcSourceRow, IcRowItem, ICoreDatabaseManager, DataSource }
