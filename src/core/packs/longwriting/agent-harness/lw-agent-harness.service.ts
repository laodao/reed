/**
 * 长文写作 Agent 宿主（HostKit 直驱版，30 号 M6 → 36 号收敛）
 * @module core/packs/longwriting/agent-harness/lw-agent-harness.service
 *
 * 旧「JSON 决策 + 动作 + 总结」两段式协议 → LoopRunner react 循环：
 * 状态快照注入 system，8 个动作以工具形态暴露（lw-agent-tools），工具内部
 * 复用 executeActions（依赖 skipped/富 action 事件原样保留），模型最终文本即总结。
 *
 * 事件面与旧协议逐一对齐（前端 useAgentChat/AgentChatView/AgentWorkspace 零改动）：
 * - stage:deciding：每步起点（onTrajectory decision）
 * - action:start/done：executeActions 内部原样发出（宿主不重复映射 tool 事件）
 * - reply:start{summaryEventId}：每步起点重置流式气泡；正文经
 *   longwriting:generate:${summaryEventId} 的 content 事件流出（前端既有订阅点）
 * - reply:done{suggestions}：终态（buildSuggestions）
 * - error：stopReason=error/aborted
 *
 * 多轮记忆仍以 lw_design_messages 为权威源（每轮取最近 20 条注入），harness 的
 * agent_sessions（scopeKey=lw-agent:<projectId>）仅作运行观测（工作台时间线）。
 * 装配脊柱（sink/turn_start/记忆双通道/ContextManager/RunRegistry）由 HostKit
 * 内置（36 号）——记忆图谱通道A经平台结构化提供方注册表生效。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { createLogger } from '@core/utils/logger'
import { createHostKit, formatStopNote } from '@core/platform/agent-runtime'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { getMemoryFlywheel } from '@core/platform/workflow/workflow-boot'
import { DbAgentSessionStore } from '@core/platform/agent-runtime/memory/session-store'
import { LongWritingAIService } from '@core/platform/services/longwriting-ai.service'
import { emitAgentEvent } from '@core/platform/services/longwriting/agent/agent-events'
import { computeProductionState, buildSuggestions } from '@core/platform/services/longwriting/agent/agent-deps'
import { stateToSummary } from '@core/platform/services/longwriting/agent/agent-context'
import type { AgentActionSummary, AgentProductionState } from '@core/platform/services/longwriting/agent/agent.types'
import type { ModelMessage } from 'ai'
import { registerLwAgentTools, LW_AGENT_PACK_ID } from './lw-agent-tools'
import { installGraphKnowledgeProvider } from '@core/platform/services/longwriting/graph/graph-knowledge-provider'

const logger = createLogger('LwAgentHarness')

export const LW_AGENT_DEFINITION_ID = 'lw-agent'
export const LW_AGENT_MAX_STEPS = 5
/** 每轮注入的历史条数（对齐旧协议 AGENT_HISTORY_LIMIT） */
export const LW_HISTORY_LIMIT = 20
/** 历史单条注入截断（控制上下文；旧决策上下文按 200 字截断，这里放宽到 600） */
const HISTORY_CONTENT_MAX = 600

/** 切换开关（G5）：env LW_AGENT_HARNESS='0' 回退旧 AgentWorkflowService */
export function isLwHarnessEnabled(): boolean {
  return process.env.LW_AGENT_HARNESS !== '0'
}

/** 系统提示词：角色 + 纪律（动作参数说明在工具 description 里） */
export function lwAgentSystemPrompt(): string {
  return `你是长篇写作项目的创作助理，可以直接调用工具替用户完成创作生产任务。当前项目状态快照会随每轮注入。

纪律：
1. 每轮最多执行 3 个动作。依赖不满足（如未生成故事概要就想生成大纲）时工具会返回 skipped，请向用户解释缺少什么前置。
2. 不要重复调用刚刚成功过的同一工具；工具失败后可换参数重试一次，仍失败就如实告知。
3. 所有动作完成后，用一段话向用户总结：本轮做了什么、结果如何、下一步建议。
4. 用户意图或关键参数不明确时，先用一句话确认，不要编造参数。
5. 修改/删除设定前先对照状态快照确认目标存在。`
}

/** 会话存储单例（懒建；观测面，不回读） */
let sessionStore: DbAgentSessionStore | null = null
function getSessionStore(): DbAgentSessionStore | null {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return null
    if (!sessionStore) sessionStore = new DbAgentSessionStore({ dataSource: db.dataSource })
    return sessionStore
  } catch (e) {
    logger.warn('[lw-agent] 会话存储初始化失败（观测面降级）', e)
    return null
  }
}

/** 飞轮安全获取（子系统未装配时 null——kit 记忆装配降级为仅结构化提供方） */
function safeFlywheel() {
  try {
    return getMemoryFlywheel()
  } catch {
    return null
  }
}

export interface LwAgentSendResult {
  conversationId: string
  assistantMessage: { role: 'assistant'; content: string; metadata?: string }
  actionSummaries: AgentActionSummary[]
  suggestions: string[]
  stopReason: string
}

export class LwAgentHarnessService {
  private static instance: LwAgentHarnessService | null = null

  private readonly busy = new Map<string, AbortController>()

  static getInstance(db?: any, ai?: LongWritingAIService | null): LwAgentHarnessService {
    if (!LwAgentHarnessService.instance) {
      LwAgentHarnessService.instance = new LwAgentHarnessService(db, ai ?? undefined)
    }
    return LwAgentHarnessService.instance
  }

  constructor(
    private db?: any,
    private ai?: LongWritingAIService,
  ) {}

  private manager(): any {
    return this.db ?? getCoreDatabaseManager()
  }

  private aiService(): LongWritingAIService {
    return this.ai ?? LongWritingAIService.getInstance()
  }

  /** 旧语义取消：abort 本轮 + 按 eventId 约定打断在途生成 */
  cancel(projectId: string): void {
    this.busy.get(projectId)?.abort(new Error('用户取消'))
    try {
      this.aiService().cancelAllForProject(projectId)
    } catch (e) {
      logger.warn(`[lw-agent] cancelAllForProject 异常（project=${projectId}）`, e)
    }
  }

  async getState(projectId: string): Promise<AgentProductionState> {
    return computeProductionState(this.manager(), projectId)
  }

  async sendMessage(
    projectId: string,
    message: string,
    opts: { providerConfigId?: string; modelId?: string } = {},
  ): Promise<LwAgentSendResult> {
    if (this.busy.has(projectId)) {
      throw new Error('上一轮对话仍在处理中，请等待完成或先取消')
    }
    const controller = new AbortController()
    this.busy.set(projectId, controller)
    try {
      return await this.doSend(projectId, message, opts, controller)
    } finally {
      this.busy.delete(projectId)
    }
  }

  private async doSend(
    projectId: string,
    message: string,
    opts: { providerConfigId?: string; modelId?: string },
    controller: AbortController,
  ): Promise<LwAgentSendResult> {
    const m = this.manager()
    const ai = this.aiService()
    const conversationId = `agent:${projectId}`
    const scopeId = `lw-agent:${projectId}`

    // harness 就位检查（registry/resolveModel 来源）
    const harness = getAgentLoopHarness()

    // 1. 历史（保存用户消息前取——当前消息由 initState 播种，不重复）
    const history = await m.lwDesignMessages.getByConversationId(conversationId)
    const seeded = history
      .filter((h: { role: string }) => h.role === 'user' || h.role === 'assistant')
      .slice(-LW_HISTORY_LIMIT)
      .map((h: { role: string; content: unknown }) => ({
        role: h.role as 'user' | 'assistant',
        content: String(h.content ?? '').slice(0, HISTORY_CONTENT_MAX),
      } as ModelMessage))

    // 2. 保存用户消息（UI 历史源不变）
    await m.lwDesignMessages.add(conversationId, { role: 'user', content: message, timestamp: Date.now() })

    // 3. 状态快照 + 工具（M6.5-d：共享 registry 形态——懒注册 + pack 白名单 + runtimeContext 注入）
    const state = await computeProductionState(m, projectId)
    const actionSummaries: AgentActionSummary[] = []
    registerLwAgentTools(harness.registry)
    // KE-4：安装长文图谱结构化提供方（幂等；章节推导 v1 省略——全时段有效关系）
    installGraphKnowledgeProvider({})
    const bindings = harness.registry
      .listSpecs({ packId: LW_AGENT_PACK_ID })
      .map((s) => ({ tool: s.name }))
    const toolMap: Record<string, AgentToolDef> = harness.registry.buildToolDefs(bindings)

    const counter = { calls: 0 }

    // 4. 观测面（工作台时间线）+ 会话持久化（sink/会话存储由 HostKit 承接——36 号）
    const store = getSessionStore()

    // 5. 事件流映射
    let summaryEventId = ''
    let allText = ''
    const newSummaryEvent = () => {
      summaryEventId = `agent-summary-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      emitAgentEvent(projectId, { type: 'reply:start', summaryEventId } as never)
    }
    const emitStageDeciding = () => emitAgentEvent(projectId, { type: 'stage', stage: 'deciding' } as never)

    // 6. HostKit 装配（36 号）：记忆双通道（通道A 结构化提供方=图谱 + 通道B 飞轮召回）
    //    收敛为 kit 内置装配——LW 只声明 scope 与召回语料，装配行为与平台一致
    const kit = createHostKit<{ input: string }>(
      {
        definitionId: LW_AGENT_DEFINITION_ID,
        scopeKey: () => scopeId,
        tools: () => toolMap,
        resolveModel: (o) => harness.resolveModel({ providerConfigId: o?.providerConfigId, modelId: o?.modelId }),
        systemPrompt: () => lwAgentSystemPrompt(),
        snapshot: () => stateToSummary(state),
        seededHistory: () => seeded,
        maxSteps: LW_AGENT_MAX_STEPS,
        memory: {
          scope: () => ({ bizModule: 'longwriting', projectId }),
          recallText: () => `${message}\n${stateToSummary(state)}`,
          // 通道A topics 只取前 60 字——摘要前缀会污染主题（评审 P1-1：与迁移前
          // 「topics 取用户消息」保真）
          topicsText: () => message,
        },
        onStream: (_t, event) => {
          if (event.kind === 'delta' && summaryEventId) {
            // 前端既有订阅点：longwriting:generate:${summaryEventId} 的 content 事件
            allText += event.text
            getEventEmitter().emit(`longwriting:generate:${summaryEventId}`, { type: 'content', content: event.text })
          }
          // 工具执行阶段提示（review P2-2：write_chapter 900s 期间应显示 acting 而非 thinking）
          if (event.kind === 'tool-start') emitAgentEvent(projectId, { type: 'stage', stage: 'acting' } as never)
          // tool-end 不映射 action:done：executeActions 已发富 summary 事件
        },
        onTrajectoryEntry: (_t, entry) => {
          // 步起点：仅当该步调用了工具（后面还有一步）才重置流式气泡——
          // 最后一步（无工具调用）的文本就是总结，重置会把总结清空（review 自查）
          if (entry.kind === 'decision' && entry.name !== 'turn_start') {
            const toolCalls = entry.payload?.toolCalls
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
              emitStageDeciding()
              newSummaryEvent()
            }
          }
        },
        runtimeContext: () => ({
          projectId,
          turnRefs: [],
          catalogPacks: [LW_AGENT_PACK_ID],
          lwTurn: {
            providerConfigId: opts.providerConfigId,
            modelId: opts.modelId,
            db: m,
            ai,
            emit: (event: unknown) => { emitAgentEvent(projectId, event as never) },
            state,
            // 摘要收集单一出口（emit 的 action:done 与此同源——双路会重复计数）
            onSummary: (summary: AgentActionSummary) => actionSummaries.push(summary),
            counter,
          },
        }),
        modelPreference: () => ({ providerConfigId: opts.providerConfigId, modelId: opts.modelId }),
      },
      { trajectoryPort: harness.trajectoryRepo ?? null, sessionStore: store, flywheel: safeFlywheel() },
    )

    emitStageDeciding()
    newSummaryEvent()

    try {
      const result = await kit.runTurn({ input: message }, { signal: controller.signal })

      // 终态分流（review P0-1：error/aborted 曾走 resolve 且落空消息、reply:done 照发）
      const newState = await computeProductionState(m, projectId)
      const suggestions = buildSuggestions(newState)
      // 落库内容 = 全部步文本（与流式气泡所见一致——review P1-2(a)）
      let content = allText || (result.output ?? '')
      if (result.stopReason === 'max_steps' || result.stopReason === 'stagnant') {
        content += formatStopNote(result.stopReason)
      } else if (result.stopReason === 'aborted') {
        content = content || formatStopNote('aborted')
      } else if (result.stopReason === 'error') {
        content = content || formatStopNote('error', result.error)
      }

      const assistantMessage = await m.lwDesignMessages.add(conversationId, {
        role: 'assistant',
        content,
        timestamp: Date.now(),
        metadata: JSON.stringify({ actions: actionSummaries, suggestions }),
      })
      // 对齐旧协议：assistant 恒落库、reply:done 恒发（前端气泡必有终态）；
      // error/aborted 额外发 error 事件供前端错误提示
      if (result.stopReason === 'error' || result.stopReason === 'aborted') {
        emitAgentEvent(projectId, { type: 'error', error: result.error ?? (result.stopReason === 'aborted' ? '本轮已中断' : '执行失败') } as never)
      }
      emitAgentEvent(projectId, { type: 'reply:done', suggestions } as never)

      logger.info(`[lw-agent] 轮次完成 project=${projectId} stop=${result.stopReason} steps=${result.iterations} actions=${actionSummaries.length}`)
      return {
        conversationId,
        assistantMessage: { role: 'assistant', content: assistantMessage.content, metadata: assistantMessage.metadata },
        actionSummaries,
        suggestions,
        stopReason: result.stopReason,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error(`[lw-agent] 轮次异常 project=${projectId}: ${msg}`)
      // 兜底 assistant（对齐旧协议：前端气泡必有终态，用户消息不悬空）
      try {
        await m.lwDesignMessages.add(conversationId, {
          role: 'assistant',
          content: `抱歉，本轮执行遇到问题：${msg}`,
          timestamp: Date.now(),
        })
      } catch { /* 兜底失败仅留日志 */ }
      emitAgentEvent(projectId, { type: 'error', error: msg } as never)
      throw e
    }
  }

  /** 兼容旧 getState 通道形态 */
  async getHistory(projectId: string) {
    return this.manager().lwDesignMessages.getByConversationId(`agent:${projectId}`)
  }
}
