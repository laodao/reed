/**
 * 对话式工作流 Agent 类型定义
 * @module core/platform/services/longwriting/agent/agent.types
 *
 * 协议：用户消息 → AI 决策（JSON: reply + actions）→ 引擎执行动作（调现有生成方法→落库）
 *       → AI 总结（流式回复）。工作流 = 依赖规则 + 生产状态，顺序由 AI 推进。
 */

import type { DesignMessage } from '@shared/types/longwriting.types'

// ==================== 生产动作 ====================

/** 生产动作类型（映射现有生成/落库能力） */
export type AgentActionType =
  | 'generate_overview'     // 生成/重做故事概要
  | 'generate_characters'   // 生成/补充人物
  | 'generate_world'        // 生成世界设定（背景/地点/势力/技能/物品）
  | 'generate_plots'        // 生成/补充故事线
  | 'generate_outline'      // 生成大纲（structureLevel: 1|2|3）
  | 'write_chapter'         // 写章节（outlineId?/targetWords?）
  | 'update_entity'         // 修改已有实体（type/id/patch）
  | 'delete_entity'         // 删除已有实体（type/id）

export interface AgentAction {
  type: AgentActionType
  params?: Record<string, any>
}

/** AI 决策输出（system prompt 约束为纯 JSON） */
export interface AgentDecision {
  reply?: string
  actions?: AgentAction[]
}

// ==================== 执行摘要 / 事件 ====================

export type AgentActionStatus = 'ok' | 'error' | 'skipped'

/** 单个动作执行摘要（喂给总结调用 + 写入对话 metadata） */
export interface AgentActionSummary {
  type: AgentActionType
  status: AgentActionStatus
  /** 人类可读结果（如"新增角色：苏婉儿（女二号）、林锋（反派）"） */
  message: string
  /** 变更分区（前端数据面板刷新用） */
  changed?: AgentPanelSection[]
  /** 预览数据（前端对话内嵌预览卡用） */
  data?: any
  /** 失败原因（status=error 时） */
  error?: string
}

/** 数据面板分区（Tab + 事件 changed） */
export type AgentPanelSection =
  | 'overview'
  | 'characters'
  | 'world'
  | 'plots'
  | 'outline'
  | 'chapters'

/** 推给前端的事件（channel: longwriting:agent:${projectId}） */
export type AgentEvent =
  | { type: 'stage'; stage: 'deciding' | 'acting' | 'summarizing' }
  | { type: 'action:start'; actionType: AgentActionType; label: string }
  | { type: 'action:done'; summary: AgentActionSummary }
  | { type: 'reply:start'; summaryEventId: string }
  | { type: 'reply:content'; content: string }
  | { type: 'reply:done'; suggestions: string[] }
  | { type: 'error'; error: string }

// ==================== 生产状态（引擎实时计算，不持久化） ====================

export interface AgentProductionState {
  overview: {
    exists: boolean
    title?: string
    storyType?: string
    coreIdea?: string
    summary?: string
    coreConflict?: string
    estimatedChapters?: number
    enabledFeatures?: string[]
  }
  characters: { count: number; names: string[] }
  world: { background: boolean; locations: number; factions: number; skills: number; items: number }
  plots: { count: number; titles: string[] }
  outline: { total: number; written: number; unwrittenLeaves: number; nextUnwritten?: { id: string; name: string } }
  chapters: { written: number; totalWords: number }
}

// ==================== 动作执行上下文 ====================

export interface AgentExecutionContext {
  projectId: string
  providerConfigId?: string
  modelId?: string
  db: any
  ai: any
  emit: (event: AgentEvent) => void
}

// ==================== 服务结果 ====================

export interface AgentSendResult {
  conversationId: string
  /** 已持久化的 assistant 消息（含 metadata） */
  assistantMessage: DesignMessage
  /** 本轮动作摘要（前端可直接用） */
  actionSummaries: AgentActionSummary[]
  /** 下一步建议 chips */
  suggestions: string[]
}

/** 对话历史条目（含可选元数据） */
export interface AgentHistoryItem extends DesignMessage {
  id?: string
}

// ==================== 对话常量 ====================

/** 对话上下文注入的历史条数上限 */
export const AGENT_HISTORY_LIMIT = 20
/** 生成动作的并发上限（动作串行执行，此值保留语义） */
export const AGENT_MAX_ACTIONS_PER_TURN = 3
