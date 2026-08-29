/**
 * Agent 工作流服务（对话式长文写作）
 * @module core/services/longwriting/agent/agent-workflow.service
 *
 * 一轮对话：存用户消息 → 计算生产状态 → AI 决策（JSON）→ 执行动作（生成/落库）
 *          → AI 总结（流式回复）→ 持久化对话 → 事件推送。
 * 工作流 = 依赖规则 + 生产状态；顺序由 AI 推进，引擎只保证最小前置依赖。
 *
 * 事件通道：longwriting:agent:${projectId}（stage/action/reply:start/reply:done/error）
 * 总结流式正文：longwriting:generate:${summaryEventId}（复用现有生成事件链路，reply:start 携带 summaryEventId）
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { LongWritingAIService } from '@core/services/longwriting-ai.service'
import type {
  AgentActionSummary,
  AgentDecision,
  AgentEvent,
  AgentSendResult,
  AgentProductionState,
} from './agent.types'
import { AGENT_MAX_ACTIONS_PER_TURN, AGENT_HISTORY_LIMIT } from './agent.types'
import { emitAgentEvent } from './agent-events'
import { computeProductionState, buildSuggestions } from './agent-deps'
import { buildDecisionContext, buildSummaryContext } from './agent-context'
import { executeActions, extractJsonObject } from './agent-actions'
import type { AgentActionType } from './agent.types'

/** 合法动作类型白名单（未知类型丢弃，防止 AI 幻觉动作） */
const VALID_ACTION_TYPES = new Set<AgentActionType>([
  'generate_overview',
  'generate_characters',
  'generate_world',
  'generate_plots',
  'generate_outline',
  'write_chapter',
  'update_entity',
  'delete_entity',
])

/** 对话消息的 conversationId 约定：agent:${projectId}（lw_design_messages.conversation_id） */
export function agentConversationId(projectId: string): string {
  return `agent:${projectId}`
}

/** 归一化决策输出：容错解析 + 过滤未知动作 + 限数 */
export function normalizeDecision(raw: string): AgentDecision {
  const obj = extractJsonObject(raw)
  if (!obj || typeof obj !== 'object') return { actions: [] }

  const rawActions = Array.isArray(obj.actions) ? obj.actions : []
  const actions = rawActions
    .filter((a: any) => a && typeof a === 'object' && typeof a.type === 'string' && VALID_ACTION_TYPES.has(a.type as AgentActionType))
    .slice(0, AGENT_MAX_ACTIONS_PER_TURN)
    .map((a: any) => ({
      type: a.type as AgentActionType,
      params: a.params && typeof a.params === 'object' ? a.params : {},
    }))

  return {
    reply: typeof obj.reply === 'string' ? obj.reply : undefined,
    actions,
  }
}

export class AgentWorkflowService {
  private static instance: AgentWorkflowService | null = null
  private readonly db: any
  private readonly ai: LongWritingAIService | null

  /** 进行中的总结 eventId（兼容保留；cancel 已升级为按项目全量取消） */
  private readonly activeSummaryEventIds = new Map<string, string>()
  /** 项目级互斥（评审 #42）：同项目上一轮未结束时拒绝新消息，防 eventId 互相覆盖 */
  private readonly busyProjects = new Set<string>()

  private constructor(db?: any, ai?: LongWritingAIService | null) {
    this.db = db ?? null
    this.ai = ai ?? null
  }

  static getInstance(db?: any, ai?: LongWritingAIService | null): AgentWorkflowService {
    if (!AgentWorkflowService.instance) {
      AgentWorkflowService.instance = new AgentWorkflowService(db, ai)
    }
    return AgentWorkflowService.instance
  }

  /** 测试用：重建实例（注入 fake db/ai） */
  static resetInstance(): void {
    AgentWorkflowService.instance = null
  }

  private manager(): any {
    return this.db ?? getCoreDatabaseManager()
  }

  private aiService(): LongWritingAIService {
    return this.ai ?? LongWritingAIService.getInstance()
  }

  private emit(projectId: string, event: AgentEvent): void {
    emitAgentEvent(projectId, event)
  }

  /** 获取对话历史（最近 N 条） */
  async getHistory(projectId: string, limit: number = AGENT_HISTORY_LIMIT): Promise<any[]> {
    const m = this.manager()
    if (!m?.lwDesignMessages) return []
    const all = await m.lwDesignMessages.getByConversationId(agentConversationId(projectId))
    return all.slice(-limit)
  }

  /** 获取生产状态（面板概览 + 进度带） */
  getState(projectId: string): Promise<AgentProductionState> {
    return computeProductionState(this.manager(), projectId)
  }

  /**
   * 中断当前轮的 AI 生成（评审 #43：决策/动作/总结统一可打断——
   * 三类调用都登记在同项目前缀的 AbortController 下）
   */
  cancel(projectId: string): void {
    this.aiService().cancelAllForProject(projectId)
  }

  /**
   * 发起一轮 agent 循环。
   * 事件流推送全程（stage / action:start / action:done / reply:start / reply:content / reply:done / error）。
   */
  async sendMessage(projectId: string, message: string, opts?: { providerConfigId?: string; modelId?: string }): Promise<AgentSendResult> {
    // 评审 #42：同项目串行——并发第二轮会覆盖 eventId 且互相污染上下文
    if (this.busyProjects.has(projectId)) {
      throw new Error('上一轮对话仍在处理中，请等待完成或点击打断后再发送')
    }
    this.busyProjects.add(projectId)
    try {
      return await this.doSendMessage(projectId, message, opts)
    } finally {
      this.busyProjects.delete(projectId)
    }
  }

  private async doSendMessage(projectId: string, message: string, opts?: { providerConfigId?: string; modelId?: string }): Promise<AgentSendResult> {
    const m = this.manager()
    if (!m?.lwDesignMessages) {
      throw new Error('数据库未初始化')
    }
    const ai = this.aiService()
    const conversationId = agentConversationId(projectId)
    const { providerConfigId, modelId } = opts || {}

    // 0. 持久化用户消息
    const userMsg = message.trim()
    await m.lwDesignMessages.add(conversationId, { role: 'user', content: userMsg, timestamp: Date.now() })

    // 1. 生产状态（决策前快照）
    let state = await computeProductionState(m, projectId)

    // 2. AI 决策
    this.emit(projectId, { type: 'stage', stage: 'deciding' })
    const history = await m.lwDesignMessages.getByConversationId(conversationId)
    const decCtx = buildDecisionContext(userMsg, state, history)
    let decision: AgentDecision = { actions: [] }
    // 评审 #43：决策调用登记 eventId，可被 cancel(projectId) 打断
    const decideEventId = `agent-decide-${projectId}-${Date.now()}`
    try {
      const raw = await ai.agentDecide(decCtx, providerConfigId, modelId, decideEventId)
      decision = normalizeDecision(raw)
      console.log(`[AgentWorkflow] 决策: ${JSON.stringify(decision).slice(0, 300)}`)
    } catch (e: any) {
      // 决策失败降级为纯对话（actions 为空）
      console.error('[AgentWorkflow] 决策调用失败，降级为纯对话:', e?.message || e)
      decision = { actions: [] }
    }

    // 3. 执行动作
    const actionSummaries: AgentActionSummary[] = []
    if (decision.actions && decision.actions.length > 0) {
      this.emit(projectId, { type: 'stage', stage: 'acting' })
      const summaries = await executeActions(
        {
          projectId,
          providerConfigId,
          modelId,
          db: m,
          ai,
          emit: (e) => this.emit(projectId, e),
        },
        decision.actions,
        state,
      )
      actionSummaries.push(...summaries)
      // 刷新状态（动作可能改了数据）
      state = await computeProductionState(m, projectId)
    }

    // 4. AI 总结（流式：正文走 longwriting:generate:${summaryEventId}）
    this.emit(projectId, { type: 'stage', stage: 'summarizing' })
    const summaryEventId = `agent-summary-${projectId}-${Date.now()}`
    this.activeSummaryEventIds.set(projectId, summaryEventId)
    this.emit(projectId, { type: 'reply:start', summaryEventId })

    let reply = ''
    try {
      const sumCtx = buildSummaryContext(userMsg, decision.reply, actionSummaries, state)
      reply = await ai.agentSummarize(summaryEventId, sumCtx, providerConfigId, modelId)
    } catch (e: any) {
      console.error('[AgentWorkflow] 总结调用失败:', e?.message || e)
      reply = `抱歉，我在组织回复时遇到问题（${e?.message || '未知错误'}）。你可以再说一次，或让我换个方式帮你。`
      this.emit(projectId, { type: 'error', error: e?.message || '总结失败' })
    } finally {
      this.activeSummaryEventIds.delete(projectId)
    }

    // 5. 持久化 assistant 消息（含动作摘要/建议元数据）
    const suggestions = buildSuggestions(state)
    const assistantMessage = await m.lwDesignMessages.add(conversationId, {
      role: 'assistant',
      content: reply,
      timestamp: Date.now(),
      metadata: JSON.stringify({ actions: actionSummaries, suggestions }),
    })

    // 6. 完成事件（chips）
    this.emit(projectId, { type: 'reply:done', suggestions })

    return { conversationId, assistantMessage, actionSummaries, suggestions }
  }
}
