/**
 * 剧集制作 · 对话式工作流 Agent · 类型定义
 * @module modules/episode-production/agent/ep-agent.types
 *
 * 参考长文写作 agent（src/core/services/longwriting/agent/agent.types.ts）复刻的范式：
 * 用户消息 → AI 决策（JSON: reply + actions）→ 引擎执行动作（调用现有生成/落库能力）
 *       → AI 总结（流式回复）。工作流 = 依赖规则 + 生产状态，顺序由 AI 推进。
 *
 * 动作全部映射到现有 episode-production 真实服务（script / scene / storyboard / asset 等），
 * 严禁写死或假数据。
 */

import type { SceneScript, Storyboard } from '@shared/types/episode-production'

// ==================== 生产动作 ====================

/**
 * 剧集制作生产动作类型（映射现有生成/落库能力）
 */
export type EpAgentActionType =
  | 'generate_script'          // 生成整集剧本（synopsis + 结构化场景 + 正文）
  | 'split_scenes'             // 从剧本 synopsis 拆分场景
  | 'generate_storyboards'     // 按场景批量生成分镜
  | 'generate_char_asset'      // 为角色生成定妆主图
  | 'generate_location_asset'  // 为地点生成主图
  | 'generate_item_asset'      // 为物品生成主图
  | 'update_entity'            // 修改已有资产（角色/地点/物品）
  | 'delete_entity'            // 删除已有资产（角色/地点/物品）

/** AI 决策输出（system prompt 约束为纯 JSON） */
export interface EpAgentAction {
  type: EpAgentActionType
  params?: Record<string, any>
}

/** AI 决策输出（system prompt 约束为纯 JSON） */
export interface EpAgentDecision {
  reply?: string
  actions?: EpAgentAction[]
}

// ==================== 执行摘要 / 事件 ====================

export type EpAgentActionStatus = 'ok' | 'error' | 'skipped'

/** 单个动作执行摘要（喂给总结调用 + 写入对话 metadata） */
export interface EpAgentActionSummary {
  type: EpAgentActionType
  status: EpAgentActionStatus
  /** 人类可读结果（如"已生成剧本：第1集《xxx》，含 5 场"） */
  message: string
  /** 变更分区（前端数据面板刷新用） */
  changed?: EpAgentPanelSection[]
  /** 预览数据（前端对话内嵌预览卡用） */
  data?: any
  /** 失败原因（status=error 时） */
  error?: string
}

/** 数据面板分区（Tab + 事件 changed） */
export type EpAgentPanelSection =
  | 'script'
  | 'scenes'
  | 'storyboards'
  | 'assets'

/** 推给前端的事件（channel: ep-agent:${projectId}:${episodeId}） */
export type EpAgentEvent =
  | { type: 'stage'; stage: 'deciding' | 'acting' | 'summarizing' }
  | { type: 'action:start'; actionType: EpAgentActionType; label: string }
  | { type: 'action:done'; summary: EpAgentActionSummary }
  | { type: 'reply:start'; summaryEventId: string }
  | { type: 'reply:content'; content: string }
  | { type: 'reply:done'; suggestions: string[] }
  | { type: 'error'; error: string }

// ==================== 生产状态（引擎实时计算，不持久化） ====================

/**
 * 剧集当前生产状态（用于决策上下文 + 前端进度）。
 * 以 episode 为粒度。
 */
export interface EpAgentProductionState {
  episode: {
    id: string | null
    title?: string | null
    episodeNumber?: number | null
    status?: string | null
    hasScript: boolean
    synopsis?: string | null
    scriptContent?: string | null
  }
  scenes: { total: number; countWithBindings: number; locations: string[] }
  storyboards: { total: number; scenesCovered: number; scenesTotal: number }
  assets: {
    characters: { count: number; names: string[] }
    locations: { count: number; names: string[] }
    items: { count: number; names: string[] }
  }
}

// ==================== 动作执行上下文 ====================

export interface EpAgentExecutionContext {
  projectId: string
  episodeId: string
  providerConfigId?: string
  modelId?: string
  db: any
  ai: any
  emit: (event: EpAgentEvent) => void
}

// ==================== 服务结果 ====================

export interface EpAgentSendResult {
  conversationId: string
  /** 已持久化的 assistant 消息（含 metadata） */
  assistantMessage: any
  /** 本轮动作摘要（前端可直接用） */
  actionSummaries: EpAgentActionSummary[]
  /** 下一步建议 chips */
  suggestions: string[]
}

/** 对话历史条目（含可选元数据） */
export interface EpAgentHistoryItem {
  id?: string
  role: string
  content: string
  timestamp: number
  metadata?: string | null
}

// ==================== 对话常量 ====================

/** 对话上下文注入的历史条数上限 */
export const EP_AGENT_HISTORY_LIMIT = 20
/** 生成动作的并发言上限（动作串行执行，此值保留语义） */
export const EP_AGENT_MAX_ACTIONS_PER_TURN = 3

/** 类型占位（避免未使用导入告警）——保持 SceneScript / Storyboard 类型在模块可见 */
export type EpAgentSceneRef = SceneScript
export type EpAgentStoryboardRef = Storyboard
