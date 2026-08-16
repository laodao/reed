/**
 * ContextBuilder 类型定义（步骤1 新增）
 * @module core/services/longwriting/context/context.types
 *
 * 替代 generateChapter 手工拼 prompt，改为插件式 Provider 编排 + 动态 token 预算。
 */

import type { StoryOutline, StoryOverview, StoryCharacter, StoryLocation, ChapterPrewrite } from '@shared/types/longwriting.types'
import type { LwVectorIndexService } from '../lw-vector-index.service'
import type { LwVectorSearchResult } from '@shared/types/longwriting.types'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type { ChapterStateSummary } from '@shared/types/longwriting.types'

// ==================== 上下文项类型 ====================

/** 上下文项类型（决定前端展示标签 + 压缩策略分组） */
export type LwContextItemType =
  | 'storyOverview'
  | 'background'
  | 'character'
  | 'location'
  | 'item'
  | 'memory'
  | 'entityState'
  | 'previousChapter'
  | 'chapterStateSummary'
  | 'prewrite'
  | 'plot'
  // 以下为后续步骤预留（步骤3/4/5 实现时启用）
  | 'timeline'
  | 'foreshadow'
  | 'graphEdge'

/** 优先级 1-11（1 最高，超预算时低优先级先压缩） */
export type ContextPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

/**
 * 生成 ContextItem.id
 * 格式：`${type}:${entityId}`，同 entityType 多 chunk 加序号 `${type}:${entityId}:${idx}`
 * forcedContext 的 itemId 用此格式稳定映射。
 */
export function makeItemId(type: string, entityId: string, idx?: number | string): string {
  return idx !== undefined ? `${type}:${entityId}:${idx}` : `${type}:${entityId}`
}

// ==================== 核心数据结构 ====================

/** 单个上下文项（清单最小粒度，可单独 include/exclude/edit） */
export interface ContextItem {
  /** 稳定 id（forcedContext 映射键，见 makeItemId） */
  id: string
  type: LwContextItemType
  title: string
  /** 清单展示用（一行摘要） */
  summary: string
  /** 完整内容（注入 prompt 用） */
  content: string
  /** 来源：vector 检索 / sql 直查 / 手动 */
  source: 'vector' | 'graph' | 'timeline' | 'manual' | 'sql'
  /** 相关性分数 0-1（vector 检索有） */
  score?: number
  /** 是否注入 prompt（预算/用户控制） */
  included: boolean
  /** 用户可否编辑 */
  editable: boolean
  priority: ContextPriority
}

/** 上下文分区（同类 item 聚合） */
export interface ContextSection {
  key: string
  title: string
  items: ContextItem[]
  /** 该分区 token 估算（含 included + excluded） */
  tokenEstimate: number
  priority: ContextPriority
}

// ==================== 输入 / 输出 ====================

/** ContextBuilder.build 入参 */
export interface ContextBuildInput {
  projectId: string
  outlineId: string
  targetWords?: number
  userExtraPrompt?: string
  providerConfigId?: string
  modelId?: string
}

/** 用户在预览面板的强制注入/排除/编辑（优先级 > builder 默认 > 预算压缩） */
export interface ForcedContextItem {
  itemId: string
  action: 'include' | 'exclude' | 'edit'
  /** action='edit' 时的新内容 */
  editedContent?: string
}

/** 上下文清单（结构化，供前端预览/编辑 + buildFromManifest 复用） */
export interface ContextManifest {
  sections: ContextSection[]
  /** 含 included items 的总 token 估算 */
  totalTokenEstimate: number
  /** 各分区 token 预算分配 */
  budgetAllocation: Record<string, number>
  modelContextWindow: number
  reservedForGeneration: number
  availableForContext: number
  /** manifest 复用键（${outlineId}:${sha256(summary+involvedIds+targetWords)}） */
  buildId: string
}

/** ContextBuilder 最终输出（注入 AI 的 prompt） */
export interface ContextBuildOutput {
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  manifest: ContextManifest
}

// ==================== Provider 接口 + 共享上下文 ====================

/**
 * 上下文 Provider 接口：每个分区一个 Provider，ContextBuilder 编排所有 Provider。
 * 后续步骤 3/4/5 新增 Provider 自动纳入编排（无需改 ContextBuilder 主逻辑）。
 */
export interface ContextProvider {
  /** 分区键（唯一） */
  key: string
  /** 分区标题 */
  title: string
  /** 优先级（1-11） */
  priority: ContextPriority
  /** 构建该分区的上下文项 */
  build(input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection>
}

/**
 * 构建过程中共享的上下文（loadBuildContext 一次性加载，各 Provider 只读不重复查库）。
 * Provider 需要额外数据时通过 ctx.dbManager / ctx.vectorIndexService 自行查（仅查自己负责的）。
 */
export interface BuildContext {
  projectId: string
  outline: StoryOutline
  overview: StoryOverview | null
  background: any | null
  characters: StoryCharacter[]
  locations: StoryLocation[]
  /** 全部物品（ItemProvider 用） */
  items: any[]
  /** 当前章节序号（1-based） */
  chapterNumber: number
  /** 预估总章节数 */
  totalChapters: number
  /** 大纲树（计算章节序号用） */
  outlineTree: StoryOutline[]
  involvedCharacterIds: string[]
  involvedLocationIds: string[]
  involvedItemIds: string[]
  /** 上一章结尾原文（已按段落截取 ~550 字；首章为空） */
  previousChapterEnding: string
  /** 上一章状态摘要（首章为 null） */
  chapterStateSummary: ChapterStateSummary | null
  /** 预写内容（PrewriteProvider 用） */
  prewrite: ChapterPrewrite | null
  /** involved 实体的当前状态 map（key = `${type}:${entityId}`，value = stateSummary） */
  entityStateMap: Map<string, string>
  /** 向量检索服务（MemoryProvider/VectorSearchProvider 用） */
  vectorIndexService: LwVectorIndexService
  dbManager: ICoreDatabaseManager
}

/** 向量检索结果（Provider 内部用，转 ContextItem） */
export type VectorSearchHit = LwVectorSearchResult
