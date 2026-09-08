/**
 * 领域学习 Agent 宿主（HostKit 直驱，基于 agent-harness）
 * @module packs/domain-learning/services/dl-agent-harness.service
 *
 * 与 EP/LW 宿主同构；dl 特有：
 * - 两种模式（research / tutor）共用同一宿主，差异面 = scopeKey/systemPrompt/工具白名单/快照：
 *   - research：对概念/未解问题跑研究（invoke_skill 产出 → dl_save_concept/relation/card 落草稿）；
 *   - tutor：追问答疑——问题先落 dl_question(open)，答上经 dl_answer_question 存档，
 *     答不上保持 open = 未解队列（设计与 UI 追问历史一体化）。
 * - 产出落库均为草稿态，人审在界面（IPC confirm）完成——agent 不自封"地图定稿/讲义发布"。
 * - 工具懒注册（pack activate 早于 workflow boot）；事件：reply 流式走 dl:generate:<eventId>，
 *   action:done 富事件经 tapEvents 回流为 actionSummaries。
 *
 * M1 取舍（如实记录）：答疑引证 = 当前概念讲义全文 + 图关系随快照注入（每轮实时重建），
 * StructuredKnowledgeProvider（记忆通道 A 持久注册）与长会话续聊（agent_sessions 权威源）
 * 留 M2——M1 追问以 dl_question 为历史源（answered 成对回灌 seededHistory）。
 */

import { createLogger } from '@core/utils/logger'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createHostKit, formatStopNote } from '@core/platform/agent-runtime'
import type { ModelMessage } from 'ai'
import type { AgentToolBinding } from '@shared/types/agent.types'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { getMemoryFlywheel } from '@core/platform/workflow/workflow-boot'
import { registerDlAgentTools, dlToolMaxCalls, dlAgentToolNames } from './dl-agent-tools'
import {
  buildDlSuggestions,
  computeDlSpaceSnapshot,
  dlResearchSystemPrompt,
  dlTutorSystemPrompt,
} from './dl-agent-deps'
import { emitDlAgentEvent, emitDlStream } from './dl-agent-events'
import {
  DL_AGENT_DEFINITION_ID,
  DL_AGENT_MAX_STEPS,
  DL_HISTORY_LIMIT,
  DL_HISTORY_CONTENT_MAX,
  DL_TOOL_DISCOVER,
  DL_TOOL_INVOKE_SKILL,
  dlScopeKey,
  type DlAgentMode,
  type DlAgentSendResult,
  type DlAgentActionSummary,
  type DlScopeRef,
} from './dl-agent.types'

const logger = createLogger('DlAgentHarness')

/** 规划/技能透出（系统工具，裸名；dl 动作工具已由 registerDlAgentTools 注册为 pack:dl-agent:*） */
const SYSTEM_PASSTHROUGH = [DL_TOOL_DISCOVER, DL_TOOL_INVOKE_SKILL]

function systemPromptOf(mode: DlAgentMode): string {
  return mode === 'research' ? dlResearchSystemPrompt() : dlTutorSystemPrompt()
}

export class DlAgentHarnessService {
  private static instance: DlAgentHarnessService | null = null

  /** 进行中的轮次（scopeKey → AbortController） */
  private readonly busy = new Map<string, AbortController>()

  static getInstance(): DlAgentHarnessService {
    if (!DlAgentHarnessService.instance) {
      DlAgentHarnessService.instance = new DlAgentHarnessService()
    }
    return DlAgentHarnessService.instance
  }

  cancel(mode: DlAgentMode, scope: DlScopeRef): void {
    const key = dlScopeKey(mode, scope)
    this.busy.get(key)?.abort(new Error('用户取消'))
  }

  isBusy(mode: DlAgentMode, scope: DlScopeRef): boolean {
    return this.busy.has(dlScopeKey(mode, scope))
  }

  /** 发送一轮（research：研究推进；tutor：追问）。整轮 await 到落库返回。 */
  async sendMessage(
    mode: DlAgentMode,
    scope: DlScopeRef,
    message: string,
    opts: { providerConfigId?: string; modelId?: string } = {},
  ): Promise<DlAgentSendResult> {
    const key = dlScopeKey(mode, scope)
    if (this.busy.has(key)) {
      throw new Error('上一轮对话仍在处理中，请等待完成或先取消')
    }
    const controller = new AbortController()
    this.busy.set(key, controller)
    try {
      return await this.doSend(mode, scope, message, opts, controller)
    } finally {
      this.busy.delete(key)
    }
  }

  private async doSend(
    mode: DlAgentMode,
    scope: DlScopeRef,
    message: string,
    opts: { providerConfigId?: string; modelId?: string },
    controller: AbortController,
  ): Promise<DlAgentSendResult> {
    const m = getCoreDatabaseManager()
    const { spaceId, conceptId } = scope
    const scopeId = dlScopeKey(mode, scope)
    const conceptForEvent = conceptId ?? undefined

    // 动作摘要收集：工具内 ctx.emit 的 action:done 富事件回流汇总
    const channelEvent = conceptId ? `dl:agent:${spaceId}:${conceptId}` : `dl:agent:${spaceId}`
    const actionSummaries: DlAgentActionSummary[] = []
    const tap = { untap: null as (() => void) | null }
    const tapActionDone = (): void => {
      tap.untap = getEventEmitter().tapEvents?.((c, data) => {
        if (c !== channelEvent) return
        const ev = data as { type?: string; summary?: DlAgentActionSummary }
        if (ev?.type === 'action:done' && ev.summary) actionSummaries.push(ev.summary)
      }) ?? null
    }

    // harness + 工具懒注册（首用；activate 早于 workflow boot）
    const harness = getAgentLoopHarness()
    registerDlAgentTools(harness.registry)

    // 文本模型兜底（默认提供商可能无 text 模型）
    if (!opts.providerConfigId || !opts.modelId) {
      try {
        const cfgs = await m.providerConfigs?.getEnabled?.()
        for (const c of cfgs ?? []) {
          const textModel = (c.models ?? []).find((mm: { type?: string }) => mm.type === 'text')
          if (textModel?.id) {
            opts = {
              ...opts,
              providerConfigId: opts.providerConfigId ?? c.id,
              modelId: opts.modelId ?? textModel.id,
            }
            break
          }
        }
      } catch { /* resolveModel 默认路径 */ }
    }

    // tutor：用户问题先落 dl_question(open)；research 不落对话
    let questionId: string | null = null
    if (mode === 'tutor') {
      const q = await m.dlQuestions!.create({
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId: spaceId,
        conceptId: conceptId ?? null,
        question: message,
      })
      questionId = q.id
      emitDlAgentEvent(spaceId, conceptForEvent, { type: 'question:open', questionId })
    }

    // 快照 + 白名单（dl 动作工具裸名 + 系统技能/规划透出）
    const snapshot = await computeDlSpaceSnapshot(m, spaceId, conceptId)
    const bindings: AgentToolBinding[] = [
      ...dlAgentToolNames().map((name) => ({ tool: name, maxCalls: dlToolMaxCalls(name) })),
      ...SYSTEM_PASSTHROUGH.map((tool) => ({ tool })),
    ]

    // seededHistory：tutor 用该空间/概念最近的 answered 问答对（dl_question 历史源）
    let seeded: ModelMessage[] = []
    if (mode === 'tutor') {
      const recent = await m.dlQuestions!.listByProject(spaceId)
      const rows = recent
        .filter((r) => (!conceptId || r.conceptId === conceptId) && r.status === 'answered' && r.answerMd)
        .slice(0, DL_HISTORY_LIMIT)
        .reverse()
      seeded = rows.flatMap((r): ModelMessage[] => [
        { role: 'user', content: r.question.slice(0, DL_HISTORY_CONTENT_MAX) },
        { role: 'assistant', content: r.answerMd!.slice(0, DL_HISTORY_CONTENT_MAX) },
      ])
    }

    // 事件流
    let summaryEventId = ''
    let allText = ''
    const newSummaryEvent = () => {
      summaryEventId = `dl-agent-summary-${spaceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      emitDlAgentEvent(spaceId, conceptForEvent, { type: 'reply:start', summaryEventId })
    }
    const emitStage = (stage: 'deciding' | 'acting') =>
      emitDlAgentEvent(spaceId, conceptForEvent, { type: 'stage', stage })

    emitStage('deciding')
    newSummaryEvent()
    tapActionDone()

    const flywheel = (() => {
      try {
        return getMemoryFlywheel()
      } catch {
        return null
      }
    })()

    // HostKit 装配（脊柱内置：sink/turn_start/记忆装配/ContextManager/RunRegistry/abort）
    const kit = createHostKit<{ input: string }>(
      {
        definitionId: DL_AGENT_DEFINITION_ID,
        scopeKey: () => scopeId,
        tools: () => {
          const map = harness.registry.buildToolDefs(bindings)
          return map
        },
        resolveModel: (o) => harness.resolveModel({ providerConfigId: o?.providerConfigId, modelId: o?.modelId }),
        systemPrompt: () => systemPromptOf(mode),
        snapshot: () => snapshot.text,
        seededHistory: () => seeded,
        maxSteps: DL_AGENT_MAX_STEPS,
        contextWindowTokens: Number(process.env.AGENT_CONTEXT_WINDOW ?? 24_000) || 24_000,
        memory: {
          scope: () => ({ bizModule: 'domain-learning', projectId: spaceId }),
          recallText: () => `${message}\n${snapshot.text}`,
        },
        onStream: (_t, event) => {
          if (event.kind === 'delta' && summaryEventId) {
            allText += event.text
            emitDlStream(summaryEventId, event.text)
          }
          if (event.kind === 'tool-start') emitStage('acting')
        },
        runtimeContext: () => ({
          spaceId,
          ...(conceptId ? { conceptId } : {}),
          providerConfigId: opts.providerConfigId,
          modelId: opts.modelId,
        }),
        modelPreference: () => ({ providerConfigId: opts.providerConfigId, modelId: opts.modelId }),
      },
      { trajectoryPort: harness.trajectoryRepo ?? null, flywheel },
    )

    try {
      const result = await kit.runTurn({ input: message }, { signal: controller.signal })

      const newSnapshot = await computeDlSpaceSnapshot(m, spaceId, conceptId)
      const suggestions = buildDlSuggestions(newSnapshot)
      let content = allText || (result.output ?? '')
      if (result.stopReason === 'max_steps' || result.stopReason === 'stagnant') {
        content += formatStopNote(result.stopReason)
      } else if (result.stopReason === 'aborted') {
        content = content || formatStopNote('aborted')
      } else if (result.stopReason === 'error') {
        content = content || formatStopNote('error', result.error)
      }

      if (result.stopReason === 'error' || result.stopReason === 'aborted') {
        emitDlAgentEvent(spaceId, conceptForEvent, {
          type: 'error',
          error: result.error ?? (result.stopReason === 'aborted' ? '本轮已中断' : '执行失败'),
        })
      }
      emitDlAgentEvent(spaceId, conceptForEvent, { type: 'reply:done', suggestions })

      logger.info(`[dl-agent] 轮次完成 mode=${mode} space=${spaceId} concept=${conceptId ?? '-'} stop=${result.stopReason} steps=${result.iterations}`)
      return { actionSummaries, content, questionId, suggestions }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error(`[dl-agent] 轮次异常 mode=${mode} space=${spaceId}: ${msg}`)
      emitDlAgentEvent(spaceId, conceptForEvent, { type: 'error', error: msg })
      throw e
    } finally {
      tap.untap?.()
    }
  }
}
