/**
 * EP Agent 宿主（harness 直驱，M6.5-a，35 号 subtasks/ep-1）
 * @module platform/episode-production/agent/ep-agent-harness.service
 *
 * 旧「JSON 决策 + 批量动作 + 总结」三段式（ep-agent-workflow.service）→ LoopRunner 多轮循环。
 * 与长文宿主（lw-agent-harness.service）同构，EP 特有：
 * - scopeKey/会话按 project+episode 二维（ep-agent:<projectId>:<episodeId>）
 * - 工具来自共享 registry 的 ep-agent pack（懒注册，见 ep-agent-tools.ts）
 * - **四大能力接线**（35 号 §4 硬性）：
 *   ①上下文管理：loop.deps.context = ContextManager（剧本/分镜大文本必须窗口化）
 *   ②记忆管理：装配/沉淀 stub——KE-2 的 scope 装配就位后在此接 L1/L2/L3（标注 TODO）
 *   ③任务规划 + ④工作流规划：白名单透出 create_task_plan / create_workflow_draft，
 *     是否使用由 agent 按任务复杂度决定（提示词只写判断纪律，不写死必须规划）
 * - 事件面与旧协议对齐（前端零改动）：reply 流式正文走 longwriting:generate:${eventId}
 *   （源码头注的 ep-agent:generate:* 是过时注释——评审 P1-1）；tool-start/end **不**映射
 *   action 事件（动作内 emit 唯一来源，评审 P1-6）
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { createLogger } from '@core/utils/logger'
import type { AgentHost, AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolBinding } from '@shared/types/agent.types'
import { LoopRunner, initState } from '@core/platform/agent-runtime/runtime/loop'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { DbAgentSessionStore } from '@core/platform/agent-runtime/memory/session-store'
import { TrajectorySink } from '@core/platform/agent-runtime/trajectory/sink'
import { ContextManager } from '@core/platform/agent-runtime/context/context-manager'
import { ApprovalCoordinator } from '@core/platform/agent-runtime/runtime/approval'
import type { PendingApproval } from '@shared/types/agent.types'
import type { ModelMessage } from 'ai'
import type {
  EpAgentActionSummary,
  EpAgentActionType,
  EpAgentProductionState,
  EpAgentSendResult,
} from './ep-agent.types'
import { EP_AGENT_DEFINITION_ID, EP_AGENT_HISTORY_LIMIT, EP_AGENT_MAX_STEPS } from './ep-agent.types'
import { computeEpProductionState, buildEpSuggestions } from './ep-agent-deps'
import { emitEpAgentEvent, epAgentEventChannel } from './ep-agent-events'
import { epAgentConversationId } from './ep-agent-workflow.service'
import { EP_AGENT_PACK_ID, EP_TOOL_MAX_CALLS, registerEpAgentTools, EP_CONFIRM_CHOICE_TOOL } from './ep-agent-tools'

const logger = createLogger('EpAgentHarness')

/** 历史单条注入截断 */
const HISTORY_CONTENT_MAX = 600
/** 上下文窗口默认值（env 可调；EP 剧本/分镜文本大，32K 起步） */
const EP_CONTEXT_WINDOW_DEFAULT = 32768

/** 系统提示词：角色 + 纪律（含规划判断纪律——能力透出，使用由 agent 按复杂度决定） */
export function epAgentSystemPrompt(): string {
  return `你是剧集制作项目的制作助理，可以直接调用工具替用户完成制作任务（生成剧本/拆分场景/生成分镜/管理资产/查询外部数据）。当前项目与剧集状态快照会随每轮注入。

纪律：
1. 简单请求直接执行对应工具，不要拆解规划；只有跨集/多环节的复杂目标才考虑 create_task_plan 拆任务树（创建后需用户在「Agent 任务树」页批准才会执行）。
2. 固定可复用的制作流水线才考虑 create_workflow_draft 沉淀为工作流草稿；一次性的需求不要沉淀。
3. 依赖不满足（如未生成剧本就想拆场景）时工具会返回暂缓原因，请向用户解释缺什么前置，或先执行前置动作。
4. 资产生成类操作成本高：name 必须用状态快照里的真实资产名，不要编造。
5. 不要重复调用刚刚成功过的同一工具；工具失败后可换参数重试一次，仍失败就如实告知。
6. 所有动作完成后，用一段话向用户总结：本轮做了什么、结果如何、下一步建议。
7. 用户意图或关键参数不明确时，先用一句话确认，不要编造参数。`
}

/** 生产状态 → 快照文本（initState 播种/任务 snapshot 用） */
function epStateToSnapshot(state: EpAgentProductionState): string {
  const ep = state.episode
  const lines = [
    `剧集：${ep.title ?? '(未命名)'} 第${ep.episodeNumber ?? '?'}集（状态：${ep.status ?? '-'}，剧本：${ep.hasScript ? '已有' : '未生成'}）`,
    `场景：${state.scenes.total} 个（${state.scenes.countWithBindings} 个已绑定地点）`,
    `分镜：${state.storyboards.scenesCovered}/${state.storyboards.scenesTotal} 场已覆盖`,
    `资产：角色 ${state.assets.characters.count}（${state.assets.characters.names.slice(0, 8).join('、')}）；地点 ${state.assets.locations.count}；物品 ${state.assets.items.count}`,
  ]
  return lines.join('\n')
}

/** 会话存储单例（懒建；观测面） */
let sessionStore: DbAgentSessionStore | null = null
function getSessionStore(): DbAgentSessionStore | null {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return null
    if (!sessionStore) sessionStore = new DbAgentSessionStore({ dataSource: db.dataSource })
    return sessionStore
  } catch (e) {
    logger.warn('[ep-agent] 会话存储初始化失败（观测面降级）', e)
    return null
  }
}

export class EpAgentHarnessService {
  private static instance: EpAgentHarnessService | null = null

  private readonly busy = new Map<string, AbortController>()
  /** 进行中的审批协调器（ep_confirm_choice 挂起卡；decide/cancel 用） */
  private readonly coordinators = new Map<string, ApprovalCoordinator>()

  static getInstance(db?: any): EpAgentHarnessService {
    if (!EpAgentHarnessService.instance) {
      EpAgentHarnessService.instance = new EpAgentHarnessService(db)
    }
    return EpAgentHarnessService.instance
  }

  constructor(private db?: any) {}

  private manager(): any {
    return this.db ?? getCoreDatabaseManager()
  }

  cancel(projectId: string, episodeId: string): void {
    const key = `${projectId}:${episodeId}`
    this.busy.get(key)?.abort(new Error('用户取消'))
    this.coordinators.get(key)?.cancelScope(`ep-agent:${projectId}:${episodeId}`)
  }

  /** 审批决定（EP-2）：action='select' 时回传完整 input+selected（approve_with_edit 整体替换语义） */
  decideChoice(
    projectId: string,
    episodeId: string,
    approvalId: string,
    action: 'select' | 'reject',
    selected?: string,
  ): boolean {
    const coordinator = this.coordinators.get(`${projectId}:${episodeId}`)
    if (!coordinator) return false
    if (action === 'reject') return coordinator.decide(approvalId, { action: 'reject', reason: '用户未选择' })
    const pending = coordinator.listPending(`ep-agent:${projectId}:${episodeId}`).find((p) => p.approvalId === approvalId)
    if (!pending) return false
    const baseInput = (pending.input ?? {}) as Record<string, unknown>
    const input = { ...baseInput, selected }
    return coordinator.decide(approvalId, { action: 'approve_with_edit', input })
  }

  /** 挂起中的选择卡（前端恢复用） */
  listPendingChoices(projectId: string, episodeId: string): PendingApproval[] {
    const coordinator = this.coordinators.get(`${projectId}:${episodeId}`)
    if (!coordinator) return []
    return coordinator.listPending(`ep-agent:${projectId}:${episodeId}`).filter((p) => p.toolName === EP_CONFIRM_CHOICE_TOOL)
  }

  async sendMessage(
    projectId: string,
    episodeId: string,
    message: string,
    opts: { providerConfigId?: string; modelId?: string } = {},
  ): Promise<EpAgentSendResult> {
    const key = `${projectId}:${episodeId}`
    if (this.busy.has(key)) {
      throw new Error('上一轮对话仍在处理中，请等待完成或先取消')
    }
    const controller = new AbortController()
    this.busy.set(key, controller)
    try {
      return await this.doSend(projectId, episodeId, message, opts, controller)
    } finally {
      this.busy.delete(key)
    }
  }

  private async doSend(
    projectId: string,
    episodeId: string,
    message: string,
    opts: { providerConfigId?: string; modelId?: string },
    controller: AbortController,
  ): Promise<EpAgentSendResult> {
    const m = this.manager()
    const conversationId = epAgentConversationId(episodeId)
    const scopeId = `ep-agent:${projectId}:${episodeId}`

    // 动作摘要收集：工具内 ctx.emit 的富 action:done 事件（经事件总线）回流为本轮结果
    const channel = epAgentEventChannel(projectId, episodeId)
    const actionSummaries: EpAgentActionSummary[] = []
    const onActionDone = (ev: { type?: string; summary?: EpAgentActionSummary }) => {
      if (ev?.type === 'action:done' && ev.summary) actionSummaries.push(ev.summary)
    }
    ;(getEventEmitter() as unknown as { on: (c: string, fn: (e: unknown) => void) => void }).on(channel, onActionDone as (e: unknown) => void)

    // harness 就位 + 模块域工具懒注册（评审 P0-1：pack activate 时 registry 尚不存在）
    const harness = getAgentLoopHarness()
    registerEpAgentTools(harness.registry)

    // 1. 历史（保存用户消息前取——当前消息由 initState 播种）
    const history = await m.lwDesignMessages.getByConversationId(conversationId)
    const seeded = history
      .filter((h: { role: string }) => h.role === 'user' || h.role === 'assistant')
      .slice(-EP_AGENT_HISTORY_LIMIT)
      .map((h: { role: string; content: unknown }) => ({
        role: h.role as 'user' | 'assistant',
        content: String(h.content ?? '').slice(0, HISTORY_CONTENT_MAX),
      } as ModelMessage))

    // 2. 保存用户消息（UI 历史源不变）
    await m.lwDesignMessages.add(conversationId, { role: 'user', content: message, timestamp: Date.now() })

    // 3. 状态快照 + 工具白名单（模块域 pack 全名 + 规划类系统工具）
    const state = await computeEpProductionState(m, projectId, episodeId)
    const packNames = harness.registry
      .listSpecs({ packId: EP_AGENT_PACK_ID })
      .map((s) => s.name)
    const planningTools = ['create_task_plan', 'create_workflow_draft']
    const bindings: AgentToolBinding[] = [
      ...packNames.map((name) => ({ tool: name, maxCalls: EP_TOOL_MAX_CALLS[name.replace(`pack:${EP_AGENT_PACK_ID}:`, '')] })),
      ...planningTools.map((tool) => ({ tool })),
    ]

    // choice→审批（EP-2）：协调器按轮创建；approval:request 转译为前端 choice:request
    // （带 approvalId+完整 input——前端 decide 回传整体替换 input，评审 P0-2/P1-2/P1-3）
    const approvalCoordinator = new ApprovalCoordinator({
      timeoutMs: Number(process.env.EP_AGENT_APPROVAL_TIMEOUT_MS ?? 30 * 60_000),
      emit: (e) => {
        if (e.type === 'approval:request' && e.toolName === EP_CONFIRM_CHOICE_TOOL) {
          const input = e.input as { actionType: string; param: string; choices: string[]; prompt?: string }
          emitEpAgentEvent(projectId, episodeId, {
            type: 'choice:request',
            choice: { actionType: input.actionType as EpAgentActionType, param: input.param, choices: input.choices, prompt: input.prompt },
            approvalId: e.approvalId,
            pendingInput: e.input as Record<string, unknown>,
          })
          return
        }
        if (e.type === 'approval:resolved') {
          logger.info(`[ep-agent] 审批结案 approvalId=${e.approvalId} action=${e.action}`)
        }
      },
    })
    this.coordinators.set(`${projectId}:${episodeId}`, approvalCoordinator)
    const toolMap: Record<string, AgentToolDef> = harness.registry.buildToolDefs(bindings)

    // 4. 观测面 + 会话持久化
    const sink = new TrajectorySink(harness.trajectoryRepo ?? null, { scope: 'session', scopeKey: scopeId })
    const store = getSessionStore()
    const sessionId = scopeId

    // 5. 事件流映射（reply 流式走 longwriting:generate 通道——评审 P1-1）
    let summaryEventId = ''
    let allText = ''
    const newSummaryEvent = () => {
      summaryEventId = `ep-agent-summary-${episodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      emitEpAgentEvent(projectId, episodeId, { type: 'reply:start', summaryEventId })
    }
    const emitStage = (stage: 'deciding' | 'acting') => emitEpAgentEvent(projectId, episodeId, { type: 'stage', stage })

    const host: AgentHost = {
      signal: controller.signal,
      loadState: async () => {
        const st = initState(
          {
            definitionId: EP_AGENT_DEFINITION_ID,
            scopeId,
            input: message,
            snapshot: epStateToSnapshot(state),
            systemPrompt: epAgentSystemPrompt(),
            tools: toolMap,
            maxSteps: EP_AGENT_MAX_STEPS,
          },
          Date.now(),
        )
        st.messages = [...seeded, { role: 'user', content: message } as ModelMessage]
        return st
      },
      saveState: async (st) => {
        if (store) await store.save(sessionId, st.messages).catch((e) => logger.warn('[ep-agent] 会话持久化失败（观测面）', e))
        await sink.flush()
      },
      suspend: () => Promise.reject(new Error('EP Agent 白名单不含需挂起工具（choice 审批在 EP-2 引入）')),
      emitTrajectory: (entry) => {
        sink.append(entry)
        if (entry.kind === 'decision' && entry.name !== 'turn_start') {
          const toolCalls = entry.payload?.toolCalls
          if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            emitStage('deciding')
            newSummaryEvent()
          }
        }
      },
      emitStream: (event) => {
        if (event.kind === 'delta' && summaryEventId) {
          allText += event.text
          getEventEmitter().emit(`longwriting:generate:${summaryEventId}`, { type: 'content', content: event.text })
        }
        if (event.kind === 'tool-start') emitStage('acting')
        // tool-end 不映射 action:done：动作内 ctx.emit 已发富 summary 事件（评审 P1-6）
      },
    }

    emitStage('deciding')
    newSummaryEvent()

    try {
      // 上下文管理（四大能力①）：assemble 做悬空哨兵修复 + 窗口压缩（纯剪枝；摘要化待评估）
      const context = new ContextManager({
        contextWindowTokens: Number(process.env.EP_AGENT_CONTEXT_WINDOW ?? EP_CONTEXT_WINDOW_DEFAULT) || EP_CONTEXT_WINDOW_DEFAULT,
      })
      // 记忆管理（四大能力②）：装配 stub——KE-2 scope 装配就位后在此接 L1/L2/L3（35 号 §4）
      const memoryLines: string[] = []

      const result = await new LoopRunner({
        resolveModel: (o) => harness.resolveModel({
          providerConfigId: o?.providerConfigId ?? opts.providerConfigId,
          modelId: o?.modelId ?? opts.modelId,
        }),
        context,
        requestApproval: (tool, input, call) => approvalCoordinator.request(call.scopeId, tool, input, call.signal),
      })
        .run(
          {
            definitionId: EP_AGENT_DEFINITION_ID,
            scopeId,
            input: message,
            snapshot: epStateToSnapshot(state),
            systemPrompt: epAgentSystemPrompt() + (memoryLines.length ? `\n\n[相关经验]\n${memoryLines.join('\n')}` : ''),
            tools: toolMap,
            maxSteps: EP_AGENT_MAX_STEPS,
            modelPreference: { providerConfigId: opts.providerConfigId, modelId: opts.modelId },
            runtimeContext: {
              projectId,
              episodeId,
              providerConfigId: opts.providerConfigId,
              modelId: opts.modelId,
              catalogPacks: [EP_AGENT_PACK_ID],
            },
          },
          host,
        )
        .finally(() => sink.flush())

      const newState = await computeEpProductionState(m, projectId, episodeId)
      const suggestions = buildEpSuggestions(newState)
      let content = allText || (result.output ?? '')
      if (result.stopReason === 'max_steps' || result.stopReason === 'stagnant') {
        content += `\n\n[系统] 本轮达到步数/进展护栏（${result.stopReason}）而停止，可继续对话让助理接着做。`
      } else if (result.stopReason === 'aborted') {
        content = content || '（本轮已中断）'
      } else if (result.stopReason === 'error') {
        content = content || `抱歉，我在组织回复时遇到问题：${result.error ?? '未知错误'}`
      }

      const assistantMessage = await m.lwDesignMessages.add(conversationId, {
        role: 'assistant',
        content,
        timestamp: Date.now(),
        metadata: JSON.stringify({ actions: actionSummaries, suggestions }),
      })
      if (result.stopReason === 'error' || result.stopReason === 'aborted') {
        emitEpAgentEvent(projectId, episodeId, { type: 'error', error: result.error ?? (result.stopReason === 'aborted' ? '本轮已中断' : '执行失败') })
      }
      emitEpAgentEvent(projectId, episodeId, { type: 'reply:done', suggestions })

      logger.info(`[ep-agent] 轮次完成 project=${projectId} episode=${episodeId} stop=${result.stopReason} steps=${result.iterations} actions=${actionSummaries.length}`)
      return {
        conversationId,
        assistantMessage: { role: 'assistant', content: assistantMessage.content, metadata: assistantMessage.metadata },
        actionSummaries,
        suggestions,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error(`[ep-agent] 轮次异常 project=${projectId} episode=${episodeId}: ${msg}`)
      try {
        await m.lwDesignMessages.add(conversationId, {
          role: 'assistant',
          content: `抱歉，本轮执行遇到问题：${msg}`,
          timestamp: Date.now(),
        })
      } catch { /* 兜底失败仅留日志 */ }
      emitEpAgentEvent(projectId, episodeId, { type: 'error', error: msg })
      throw e
    } finally {
      ;(getEventEmitter() as unknown as { off: (c: string, fn: (e: unknown) => void) => void }).off(channel, onActionDone as (e: unknown) => void)
      await sink.flush().catch(() => undefined)
    }
  }

  async getHistory(episodeId: string) {
    return this.manager().lwDesignMessages.getByConversationId(epAgentConversationId(episodeId))
  }

  async getState(projectId: string, episodeId: string): Promise<EpAgentProductionState> {
    return computeEpProductionState(this.manager(), projectId, episodeId)
  }
}
