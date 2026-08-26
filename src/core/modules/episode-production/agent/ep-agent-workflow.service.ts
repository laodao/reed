/**
 * 剧集制作 Agent 工作流服务（对话式制作辅助）
 * @module modules/episode-production/agent/ep-agent-workflow.service
 *
 * 一轮对话：存用户消息 → 计算生产状态 → AI 决策（JSON）→ 执行动作（生成/落库）
 *          → AI 总结（流式回复）→ 持久化对话 → 事件推送。
 * 工作流 = 依赖规则 + 生产状态；顺序由 AI 推进，引擎只保证最小前置依赖。
 *
 * 事件通道：ep-agent:${projectId}:${episodeId}（stage/action/reply:start/reply:done/error）
 * 总结流式正文：ep-agent:generate:${summaryEventId}（由 AI 底层 push，前端订阅）。
 *
 * 对话历史存储：复用 lw_design_messages 表，conversationId 约定 `ep-agent:${episodeId}`。
 * 用户/剧集 scope：Repository 的 scoped 自动按 ALS getCurrentUserId() 过滤。
 *
 * AI 底层：复用 LongWritingAIService.agentDecide / agentSummarize（通用系统+用户提示词调用）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { LongWritingAIService } from '@core/services/longwriting-ai.service'
import type {
  EpAgentAction,
  EpAgentActionSummary,
  EpAgentDecision,
  EpAgentEvent,
  EpAgentSendResult,
  EpAgentProductionState,
} from './ep-agent.types'
import { EP_AGENT_HISTORY_LIMIT, EP_AGENT_MAX_ACTIONS_PER_TURN } from './ep-agent.types'
import { emitEpAgentEvent } from './ep-agent-events'
import { computeEpProductionState, buildEpSuggestions } from './ep-agent-deps'
import { buildEpDecisionContext, buildEpSummaryContext } from './ep-agent-context'
import { executeEpActions, extractJsonObject } from './ep-agent-actions'
import type { EpAgentActionType } from './ep-agent.types'

/** 合法动作类型白名单（未知类型丢弃，防止 AI 幻觉动作） */
const VALID_ACTION_TYPES = new Set<EpAgentActionType>([
  'generate_script',
  'split_scenes',
  'generate_storyboards',
  'generate_char_asset',
  'generate_location_asset',
  'generate_item_asset',
  'update_entity',
  'delete_entity',
])

/** 对话消息的 conversationId 约定：ep-agent:${episodeId} */
export function epAgentConversationId(episodeId: string): string {
  return `ep-agent:${episodeId}`
}

/** 归一化决策输出：容错解析 + 过滤未知动作 + 限数 */
export function normalizeEpDecision(raw: string): EpAgentDecision {
  const obj = extractJsonObject(raw)
  if (!obj || typeof obj !== 'object') return { actions: [] }

  const rawActions = Array.isArray(obj.actions) ? obj.actions : []
  const actions = rawActions
    .filter((a: any) => a && typeof a === 'object' && typeof a.type === 'string' && VALID_ACTION_TYPES.has(a.type as EpAgentActionType))
    .slice(0, EP_AGENT_MAX_ACTIONS_PER_TURN)
    .map((a: any) => ({
      type: a.type as EpAgentActionType,
      params: a.params && typeof a.params === 'object' ? a.params : {},
    }))

  // 多轮确认：需要用户先选一个候选再执行动作
  let choice: EpAgentDecision['choice']
  if (obj.choice && typeof obj.choice === 'object') {
    const c = obj.choice
    if (
      typeof c.actionType === 'string' &&
      VALID_ACTION_TYPES.has(c.actionType as EpAgentActionType) &&
      typeof c.param === 'string' &&
      Array.isArray(c.choices) &&
      c.choices.length > 0
    ) {
      choice = {
        actionType: c.actionType as EpAgentActionType,
        param: c.param,
        choices: c.choices.map((x: any) => String(x)).filter(Boolean),
        prompt: typeof c.prompt === 'string' ? c.prompt : undefined,
      }
    }
  }

  return {
    reply: typeof obj.reply === 'string' ? obj.reply : undefined,
    actions,
    choice,
  }
}

export class EpisodeProductionAgentService {
  private static instance: EpisodeProductionAgentService | null = null
  private readonly db: any
  private readonly ai: LongWritingAIService | null

  /** 进行中的总结 eventId（cancel 用） */
  private readonly activeSummaryEventIds = new Map<string, string>()

  private constructor(db?: any, ai?: LongWritingAIService | null) {
    this.db = db ?? null
    this.ai = ai ?? null
  }

  static getInstance(db?: any, ai?: LongWritingAIService | null): EpisodeProductionAgentService {
    if (!EpisodeProductionAgentService.instance) {
      EpisodeProductionAgentService.instance = new EpisodeProductionAgentService(db, ai)
    }
    return EpisodeProductionAgentService.instance
  }

  /** 测试用：重建实例（注入 fake db/ai） */
  static resetInstance(): void {
    EpisodeProductionAgentService.instance = null
  }

  private manager(): any {
    return this.db ?? getCoreDatabaseManager()
  }

  private aiService(): LongWritingAIService {
    return this.ai ?? LongWritingAIService.getInstance()
  }

  private emit(projectId: string, episodeId: string, event: EpAgentEvent): void {
    emitEpAgentEvent(projectId, episodeId, event)
  }

  /** 获取对话历史（最近 N 条） */
  async getHistory(episodeId: string, limit: number = EP_AGENT_HISTORY_LIMIT): Promise<any[]> {
    const m = this.manager()
    if (!m?.lwDesignMessages) return []
    const all = await m.lwDesignMessages.getByConversationId(epAgentConversationId(episodeId))
    return all.slice(-limit)
  }

  /** 获取生产状态（面板概览 + 进度） */
  getState(projectId: string, episodeId: string): Promise<EpAgentProductionState> {
    return computeEpProductionState(this.manager(), projectId, episodeId)
  }

  /** 中断当前轮的总结生成 */
  cancel(projectId: string, episodeId: string): void {
    const key = this.activeKey(episodeId)
    const eventId = this.activeSummaryEventIds.get(key)
    if (eventId) {
      this.aiService().cancelGeneration(eventId)
    }
  }

  private activeKey(episodeId: string): string {
    return episodeId
  }

  /**
   * 发起一轮 agent 循环。
   * 事件流推送全程（stage / action:start / action:done / reply:start / reply:content / reply:done / error）。
   */
  async sendMessage(
    projectId: string,
    episodeId: string,
    message: string,
    opts?: { providerConfigId?: string; modelId?: string },
  ): Promise<EpAgentSendResult> {
    const m = this.manager()
    if (!m?.lwDesignMessages) {
      throw new Error('数据库未初始化')
    }
    const ai = this.aiService()
    const conversationId = epAgentConversationId(episodeId)
    const { providerConfigId, modelId } = opts || {}

    // 0. 持久化用户消息
    const userMsg = message.trim()
    await m.lwDesignMessages.add(conversationId, { role: 'user', content: userMsg, timestamp: Date.now() })

    // 1. 生产状态（决策前快照）
    let state = await computeEpProductionState(m, projectId, episodeId)

    // 2. AI 决策
    this.emit(projectId, episodeId, { type: 'stage', stage: 'deciding' })
    const history = await m.lwDesignMessages.getByConversationId(conversationId)
    const decCtx = buildEpDecisionContext(userMsg, state, history)
    let decision: EpAgentDecision = { actions: [] }
    try {
      const raw = await ai.agentDecide(decCtx, providerConfigId, modelId)
      decision = normalizeEpDecision(raw)
      console.log(`[EpAgent] 决策: ${JSON.stringify(decision).slice(0, 300)}`)
    } catch (e: any) {
      console.error('[EpAgent] 决策调用失败，降级为纯对话:', e?.message || e)
      decision = { actions: [] }
    }

    // 2.5 多轮确认：AI 需要用户先选一个候选（如"为哪个角色生成定妆图"）
    if (decision.choice) {
      const choice = decision.choice
      this.emit(projectId, episodeId, { type: 'choice:request', choice })
      const prompt = choice.prompt || `请选择${choice.param === 'name' ? '一个名称' : choice.param}：`
      const assistantMsg = await m.lwDesignMessages.add(conversationId, {
        role: 'assistant',
        content: `${prompt}\n候选：${choice.choices.join('、')}`,
        timestamp: Date.now(),
        metadata: JSON.stringify({ choice }),
      })
      return { conversationId, assistantMessage: assistantMsg, actionSummaries: [], suggestions: [], choice }
    }

    // 3. 执行动作
    const actionSummaries: EpAgentActionSummary[] = []
    if (decision.actions && decision.actions.length > 0) {
      this.emit(projectId, episodeId, { type: 'stage', stage: 'acting' })
      const summaries = await executeEpActions(
        {
          projectId,
          episodeId,
          providerConfigId,
          modelId,
          db: m,
          ai,
          emit: (e) => this.emit(projectId, episodeId, e),
        },
        decision.actions,
        state,
      )
      actionSummaries.push(...summaries)
      state = await computeEpProductionState(m, projectId, episodeId)
    }

    // 4. AI 总结（流式：正文走 ep-agent:generate:${summaryEventId}）
    this.emit(projectId, episodeId, { type: 'stage', stage: 'summarizing' })
    const summaryEventId = `ep-agent-summary-${episodeId}-${Date.now()}`
    this.activeSummaryEventIds.set(this.activeKey(episodeId), summaryEventId)
    this.emit(projectId, episodeId, { type: 'reply:start', summaryEventId })

    let reply = ''
    try {
      const sumCtx = buildEpSummaryContext(userMsg, decision.reply, actionSummaries, state)
      reply = await ai.agentSummarize(summaryEventId, sumCtx, providerConfigId, modelId)
    } catch (e: any) {
      console.error('[EpAgent] 总结调用失败:', e?.message || e)
      reply = `抱歉，我在组织回复时遇到问题（${e?.message || '未知错误'}）。你可以再说一次，或让我换个方式帮你。`
      this.emit(projectId, episodeId, { type: 'error', error: e?.message || '总结失败' })
    } finally {
      this.activeSummaryEventIds.delete(this.activeKey(episodeId))
    }

    // 5. 持久化 assistant 消息（含动作摘要/建议元数据）
    const suggestions = buildEpSuggestions(state)
    const assistantMessage = await m.lwDesignMessages.add(conversationId, {
      role: 'assistant',
      content: reply,
      timestamp: Date.now(),
      metadata: JSON.stringify({ actions: actionSummaries, suggestions }),
    })

    // 6. 完成事件（chips）
    this.emit(projectId, episodeId, { type: 'reply:done', suggestions })

    return { conversationId, assistantMessage, actionSummaries, suggestions }
  }
}
