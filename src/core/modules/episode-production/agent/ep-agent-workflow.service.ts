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
  EpAgentActionSummary,
  EpAgentChoice,
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
  'query_database',
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

    // 1.2 数据源名单（供 query_database 规则 choice + 决策上下文注入）
    let dataSources: Array<{ id: string; name: string }> = []
    try {
      const { getDataSourceService } = await import('@core/modules/workflow/datasource/datasource.service')
      const list = await getDataSourceService().listEligible()
      dataSources = list.map((s) => ({ id: s.id, name: s.name }))
    } catch {
      dataSources = []
    }

    // 1.5 规则型多轮确认：用户想给资产生成"图"，但没点名字 → 引擎直接发候选 choice，
    //     保证生成哪个由用户从项目真实资产里选，不依赖 AI 临场判断。
    const ruleChoice =
      detectChoiceForAssetImage(userMsg, state) ??
      detectChoiceForDatabase(userMsg, dataSources.map((d) => d.name))
    if (ruleChoice) {
      this.emit(projectId, episodeId, { type: 'choice:request', choice: ruleChoice })
      const prompt = ruleChoice.prompt || `请选择要生成${assetLabelFor(ruleChoice.actionType)}：`
      const assistantMsg = await m.lwDesignMessages.add(conversationId, {
        role: 'assistant',
        content: `${prompt}\n候选：${ruleChoice.choices.join('、')}`,
        timestamp: Date.now(),
        metadata: JSON.stringify({ choice: ruleChoice }),
      })
      return { conversationId, assistantMessage: assistantMsg, actionSummaries: [], suggestions: [], choice: ruleChoice }
    }

    // 2. AI 决策
    this.emit(projectId, episodeId, { type: 'stage', stage: 'deciding' })
    const history = await m.lwDesignMessages.getByConversationId(conversationId)
    const decCtx = buildEpDecisionContext(userMsg, state, history, { dataSources })
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

// ==================== 规则型多轮确认（引擎主动构造 choice） ====================

/** 生成某类资产的 action 映射（供 prompt 文案） */
function assetLabelFor(actionType: EpAgentActionType): string {
  switch (actionType) {
    case 'generate_char_asset': return '角色定妆图'
    case 'generate_location_asset': return '地点主图'
    case 'generate_item_asset': return '物品主图'
    default: return '资产图'
  }
}

/**
 * 检测"用户想给资产生成图但没说具体哪个"的意图，能命中则用项目真实资产名构造 choice。
 * 规则（确定性，不依赖 AI 临场发挥）：
 *   - 消息含"定妆/主图/生成...图"等生成图意图；
 *   - 消息里出现了某个现有资产名 → 返回 null（让引擎走 AI，用户已点名）；
 *   - 否则按消息提及的类别（角色/地点/物品）取候选名，构造 choice。
 */
export function detectChoiceForAssetImage(
  msg: string,
  state: EpAgentProductionState,
): EpAgentChoice | null {
  const lower = msg || ''
  // 疑问 / 否定 / 咨询句式不拦截：这类消息应交给 AI 正常回答，否则
  // 「定妆图为什么没生成出来？」「先别生成主图」会被关键词正则劫持成选资产流程。
  if (/[？?]|吗|呢|怎么|为什么|啥|什么|哪个|哪张|别|不|没有|无需|先别|暂时/.test(lower)) return null
  // 判断是否"生成图"意图
  const wantsImage = /定妆|主图|生成.+图|角色图|人物图|形象图/.test(lower)
  if (!wantsImage) return null

  // 用户已点名某个现有资产？→ 交回 AI 正常执行
  const allNames = [
    ...state.assets.characters.names,
    ...state.assets.locations.names,
    ...state.assets.items.names,
  ]
  if (allNames.some((n) => n && lower.includes(n))) return null

  // 按类别判断：消息里含"角色/人"→ 角色；"地点" → 地点；"物品" → 物品；默认角色
  const isLocation = /地点|场景|外景|地点图/.test(lower)
  const isItem = /物品|道具|物件/.test(lower)
  let actionType: EpAgentActionType
  let candidates: string[]
  let prompt: string
  if (isLocation) {
    actionType = 'generate_location_asset'; candidates = state.assets.locations.names; prompt = '请选择要生成主图的地点'
  } else if (isItem) {
    actionType = 'generate_item_asset'; candidates = state.assets.items.names; prompt = '请选择要生成主图的物品'
  } else {
    actionType = 'generate_char_asset'; candidates = state.assets.characters.names; prompt = '请选择要生成定妆图的角色'
  }

  const choices = (candidates || []).filter(Boolean)
  if (choices.length === 0) return null // 无候选 → 交回 AI（可能需先建资产）
  return { actionType, param: 'name', choices, prompt }
}

/**
 * 检测"用户想查外部数据库但没说哪个数据源"的意图 → 用已配置数据源名单构造 choice。
 * 规则（确定性）：
 *   - 消息含明确的外部数据词：数据库 / 订单 / 库存 / 用户表 / 报表 / 数据源 / "查一下订单" 等；
 *   - 纯剧集内部查询（查剧本/场景/分镜）不触发；
 *   - 已配置数据源名单非空 → 构造 query_database choice（param=dataSourceId）；
 *   - 名单为空 → 返回 null（让 AI 建议先去设置里添加数据源）。
 */
export function detectChoiceForDatabase(
  msg: string,
  dataSourceNames: string[],
): EpAgentChoice | null {
  const lower = msg || ''
  // 触发词：明确指向"外部数据库/业务数据"的表达。避免误伤剧集内部查询。
  const wantsQuery = /(查|看).{0,6}(订单|库存|报表|用户表|销售|财务|数据|记录)|查询数据库|数据库.*(查|看)|数据源|查表/.test(lower)
  if (!wantsQuery) return null

  // 用户已点名某个数据源？→ 交回 AI 正常执行
  if (dataSourceNames.some((n) => n && lower.includes(n))) return null

  const choices = (dataSourceNames || []).filter(Boolean)
  if (choices.length === 0) return null // 无数据源 → 交回 AI（建议先配置）
  return {
    actionType: 'query_database',
    param: 'dataSourceId',
    choices,
    prompt: '请选择要查询的数据源',
  }
}
