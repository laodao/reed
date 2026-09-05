/**
 * Agent 运行时共享类型
 * @module core/agent/types
 *
 * 事件协议对齐现有 AgentEvent 形态（longwriting/agent/agent.types.ts），
 * 迁移期通过 runtime/event-bridge 做双向映射，保证前端零改动。
 */

import type { z } from 'zod'

// ==================== 工具 ====================

/** 业务工具定义：schema + 执行体 + 审批标记（对应提案卡） */
export interface AgentToolDef<TInput = unknown, TOutput = unknown> {
  /** 工具名（模型可见，英文 snake_case，如 save_story_entity） */
  name: string
  /** 工具描述（模型可见，中文，写清"何时该用"） */
  description: string
  /** 入参 schema（zod v4，经 standard-schema 供 ai@6 使用） */
  inputSchema: z.ZodType<TInput>
  /**
   * 执行体。ctx 提供 ALS 用户上下文与 rawInput（用户当轮原话，供工具落"来源"字段）。
   * 返回值必须可 JSON 序列化（进入模型观察上下文）。
   */
  execute: (input: TInput, ctx: AgentToolContext) => Promise<TOutput>
  /**
   * 是否需要人工审批（提案卡）。true 时执行前挂起等待 runtime/approval 协调；
   * open-harness 契约：approve 回调返回 false → 工具不执行、发 tool.error、对话继续。
   */
  requiresApproval?: boolean
  /** 审批卡片展示信息（前端渲染提案卡用） */
  approvalCard?: { title: string; summary?: (input: TInput) => string }
}

/** 工具执行上下文 */
export interface AgentToolContext {
  /** 业务 scope（长文=projectId，EP=episodeId，故事研讨室=projectId） */
  scopeId: string
  /** 用户当轮原话（工具落"来源/提议上下文"字段用） */
  rawInput: string
  /** 中断信号（贯穿到业务 IO） */
  signal?: AbortSignal
}

// ==================== Agent 定义 ====================

/**
 * 业务 agent 声明：业务方提供"身份 + 工具 + 状态快照"，
 * 循环/上下文/记忆/审批/事件全部由本运行时接管。
 */
export interface AgentDefinition {
  /** 全局唯一 id，如 'longwriting' / 'ep' / 'story-room' */
  id: string
  /** 系统提示词（人设+规则；静态部分） */
  systemPrompt: string
  /** 工具组（键为工具名） */
  tools: Record<string, AgentToolDef>
  /**
   * 业务状态快照（→ durable memory 层，注入 system）。
   * 关键原则：快照由工具落库后的数据重建，不由 AI 复述（一致性保证，见调研方案 ①）。
   */
  buildStateSnapshot: (scopeId: string) => Promise<string>
  /** 会话标题生成（可选，用于会话列表） */
  summarizeTitle?: (firstUserMessage: string) => Promise<string>
  /** 模型选择覆盖（缺省走 provider-adapter 的全局 fallback 链） */
  modelPreference?: { providerConfigId?: string; modelId?: string }
}

// ==================== 会话 ====================

/** 一轮对话的返回（对齐旧 AgentSendResult 形态，迁移期保持前端兼容） */
export interface AgentSendResult {
  conversationId: string
  /** assistant 回复全文（流式结束后） */
  reply: string
  /** 本轮执行的工具摘要（前端时间线用） */
  actionSummaries: Array<{ type: string; params: unknown; ok: boolean; brief: string }>
  /** 建议 chips */
  suggestions: string[]
}

// ==================== 长期记忆（设计借 happyclaw memory-service，MIT） ====================

/** 记忆条目类型 */
export type MemoryKind = 'fact' | 'decision' | 'lesson' | 'open_loop'
/**
 * 记忆状态机：
 *   proposed → active          （提案卡采纳 / 用户确认）
 *   proposed → deleted         （提案卡忽略）
 *   active   → superseded      （被新条目替换，如「换一版」）
 *   active   → conflicted      （与既有条目矛盾，待用户裁决）
 */
export type MemoryStatus = 'active' | 'proposed' | 'conflicted' | 'superseded' | 'deleted'

/** 记忆来源（对应前端"来源"徽标：对话/手动/初始） */
export type MemorySource = 'agent_runtime' | 'user' | 'seed' | 'migration'

/** 项目级长期记忆条目（落 agent_memories 表，schema 见 memory/migrations.ts） */
export interface MemoryItem {
  id: string
  /** 业务 scope：projectId / episodeId */
  scopeId: string
  kind: MemoryKind
  status: MemoryStatus
  /** 稳定键（同名实体去重/替换定位，如 "character:林晓:motive"） */
  canonicalKey: string
  title: string
  content: string
  source: MemorySource
  /** 版本链：被替换时指向新条目 */
  supersededBy?: string
  createdAt: number
  updatedAt: number
}
