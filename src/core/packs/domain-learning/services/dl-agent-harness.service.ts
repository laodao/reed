/**
 * 领域学习 Agent 宿主（HostKit 直驱，基于 agent-harness）
 * @module packs/domain-learning/services/dl-agent-harness.service
 *
 * 与 EP/LW 宿主同构；dl 特有：
 * - 四种模式（research / tutor / task / verify）共用同一宿主，差异面 = scopeKey/systemPrompt/工具白名单/快照：
 *   - research：对概念/未解问题跑研究（invoke_skill 产出 → dl_save_concept/relation/card 落草稿）；
 *   - tutor：追问答疑——问题先落 dl_question(open)，答上经 dl_answer_question 存档，
 *     答不上保持 open = 未解队列（设计与 UI 追问历史一体化）；
 *   - task：任务会话（routeDlIntent 路由）——规划并执行多步任务，dl_task_progress 上报进度；
 *   - verify：卡片自动核验（内部会话，事件不上用户通道）。
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
import { registerDlAgentTools } from './dl-agent-tools'
import { buildDlBindings } from './dl-agent-bindings'
import {
  buildDlSuggestions,
  buildFocusQuestionLines,
  computeDlSpaceSnapshot,
  dlBootstrapSkillBody,
  dlEmptySpaceMission,
  dlResearchSystemPrompt,
  dlSkillBody,
  DL_MAP_COMPLETION_SKILL_ID,
  shouldInjectMapCompletionSkill,
  dlTaskSystemPrompt,
  dlTutorSystemPrompt,
  dlVerifySystemPrompt,
  researchSourceHint,
} from './dl-agent-deps'
import { emitDlAgentEvent, emitDlStream } from './dl-agent-events'
import { dlPublishNotice } from './dl-notice'
import { parseVerifyOutcome } from '../rules/learning-verify.rules'
import type { DlCardVerification } from '@shared/types/domain-learning.types'
import {
  DL_AGENT_DEFINITION_ID,
  DL_AGENT_MAX_STEPS,
  DL_TASK_MAX_STEPS,
  DL_HISTORY_LIMIT,
  DL_HISTORY_CONTENT_MAX,
  dlScopeKey,
  type DlAgentMode,
  type DlAgentSendResult,
  type DlAgentActionSummary,
  type DlScopeRef,
} from './dl-agent.types'

const logger = createLogger('DlAgentHarness')

function systemPromptOf(mode: DlAgentMode): string {
  if (mode === 'research') return dlResearchSystemPrompt()
  if (mode === 'verify') return dlVerifySystemPrompt()
  if (mode === 'task') return dlTaskSystemPrompt()
  return dlTutorSystemPrompt()
}

export class DlAgentHarnessService {
  private static instance: DlAgentHarnessService | null = null

  /** 进行中的轮次（scopeKey → AbortController） */
  private readonly busy = new Map<string, AbortController>()
  /** verify 串行链（同 space+concept 排队核验；见 verifyCard 注释） */
  private readonly verifyChain = new Map<string, Promise<unknown>>()

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

  /** 发送一轮（research：研究推进/未解问题开子研究；tutor：追问）。整轮 await 到落库返回。 */
  async sendMessage(
    mode: DlAgentMode,
    scope: DlScopeRef,
    message: string,
    opts: { providerConfigId?: string; modelId?: string; focusQuestionId?: string } = {},
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
    opts: { providerConfigId?: string; modelId?: string; focusQuestionId?: string },
    controller: AbortController,
  ): Promise<DlAgentSendResult> {
    const m = getCoreDatabaseManager()
    const { spaceId, conceptId } = scope
    const scopeId = dlScopeKey(mode, scope)
    const conceptForEvent = conceptId ?? undefined
    /** 本轮是否为空空间起步研究（research + 尚无知识概念叶；收尾做产物断言） */
    let wasEmpty = false

    // 动作摘要收集：工具内 ctx.emit 的 action:done 富事件回流汇总
    const channelEvent = conceptId ? `dl:agent:${spaceId}:${conceptId}` : `dl:agent:${spaceId}`
    const actionSummaries: DlAgentActionSummary[] = []
    const tap = { untap: null as (() => void) | null }
    const tapActionDone = (): void => {
      tap.untap = getEventEmitter().tapEvents?.((c, data) => {
        if (c !== channelEvent) return
        const ev = data as { type?: string; mode?: DlAgentMode; summary?: DlAgentActionSummary }
        // 只收本轮 mode 的动作摘要（跨 mode 并发时同通道事件互不串收；老事件无 mode 字段则照收）
        if (ev?.type === 'action:done' && ev.summary && (!ev.mode || ev.mode === mode)) {
          actionSummaries.push(ev.summary)
        }
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
      } catch (e) {
        logger.debug(`[dl-agent] 模型兜底探测不可用（走 resolveModel 默认路径）：${e instanceof Error ? e.message : String(e)}`)
      }
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
      emitDlAgentEvent(spaceId, conceptForEvent, { type: 'question:open', mode, questionId })
    }

    // 快照 + 白名单（research/verify 带读工具：KB/网页/API + 有默认搜索源才 web_search；
    // tutor 不带读工具——答疑引证 = 快照注入讲义/图，M1 口径不变）
    const snapshot = await computeDlSpaceSnapshot(m, spaceId, conceptId)
    let snapshotText = snapshot.text
    let bindings: AgentToolBinding[] = []
    if (mode === 'research' || mode === 'verify' || mode === 'task') {
      const registered = new Set(harness.registry.listSpecs().map((s) => s.name))
      let webSearchAvailable = false
      try {
        webSearchAvailable = !!(await m.searchEngineConfigs?.getDefault?.())
      } catch (e) {
        logger.debug(`[dl-agent] 默认搜索源探测失败，按无源处理：${e instanceof Error ? e.message : String(e)}`)
        webSearchAvailable = false
      }
      bindings = buildDlBindings({ mode, availableToolNames: registered, webSearchAvailable })
      snapshotText += `\n${researchSourceHint(webSearchAvailable)}`
      // 空空间起步研究：注入「先骨架后讲义」任务引导 + bootstrap 技能正文
      // （2026-09-09 复盘：bootstrap 为过程型技能，invoke_skill 内层无工具会假完成——
      //  这里直接把技能正文注入本会话，由带工具的外层模型真执行 S1~S5；wasEmpty 供收尾产物断言）
      if (mode === 'research' && snapshot.isEmptySpace) {
        wasEmpty = true
        const bootBody = dlBootstrapSkillBody()
        let mission = dlEmptySpaceMission({ spaceName: snapshot.spaceName ?? spaceId })
        if (bootBody) {
          mission += `\n\n【learning-space-bootstrap 技能正文（宿主注入，直接按其执行）】\n${bootBody}`
        }
        snapshotText += `\n${mission}`
      }
      if (mode === 'research' && opts.focusQuestionId) {
        const focus = (await m.dlQuestions?.getById(opts.focusQuestionId)) ?? null
        if (focus && focus.projectId === spaceId) {
          const focusConcept = focus.conceptId ? ((await m.dlConcepts?.getById(focus.conceptId)) ?? null) : null
          snapshotText += `\n${buildFocusQuestionLines({
            question: focus.question,
            questionId: focus.id,
            conceptName: focusConcept?.name ?? null,
          })}`
        }
      }
      // 知识体系补全（2026-09-12）：任务消息带「补全知识地图」标记时，注入 learning-map-completion 技能正文
      // （与 bootstrap 同构：过程型技能由宿主注入 + 外层带工具模型真执行，不走 invoke_skill 的无工具内层）
      if (mode === 'task' && shouldInjectMapCompletionSkill(message)) {
        const body = dlSkillBody(DL_MAP_COMPLETION_SKILL_ID)
        if (body) {
          snapshotText += `\n\n【learning-map-completion 技能正文（宿主注入，直接按其四阶段执行）】\n${body}`
        }
      }
    } else {
      bindings = buildDlBindings({ mode, webSearchAvailable: false })
    }

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

    // 事件流（2026-09-09 复盘：verify=内部核验会话，事件只回宿主侧、不上用户可见通道，
    // 避免核验 JSON/阶段流被前端当助手回复展示；research/tutor/task 照常广播）
    const suppressUserEvents = mode === 'verify'
    let summaryEventId = ''
    let allText = ''
    const newSummaryEvent = () => {
      summaryEventId = `dl-agent-summary-${spaceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      if (!suppressUserEvents) emitDlAgentEvent(spaceId, conceptForEvent, { type: 'reply:start', mode, summaryEventId })
    }
    const emitStage = (stage: 'deciding' | 'acting') => {
      if (suppressUserEvents) return
      emitDlAgentEvent(spaceId, conceptForEvent, { type: 'stage', mode, stage })
    }

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
        snapshot: () => snapshotText,
        seededHistory: () => seeded,
        maxSteps: mode === 'task' ? DL_TASK_MAX_STEPS : DL_AGENT_MAX_STEPS,
        contextWindowTokens: Number(process.env.AGENT_CONTEXT_WINDOW ?? 24_000) || 24_000,
        memory: {
          scope: () => ({ bizModule: 'domain-learning', projectId: spaceId }),
          recallText: () => `${message}\n${snapshot.text}`,
        },
        onStream: (_t, event) => {
          if (event.kind === 'delta' && summaryEventId) {
            allText += event.text
            if (!suppressUserEvents) emitDlStream(summaryEventId, event.text)
          }
          if (event.kind === 'tool-start') emitStage('acting')
        },
        runtimeContext: () => ({
          spaceId,
          mode,
          ...(conceptId ? { conceptId } : {}),
          ...(opts.focusQuestionId ? { questionId: opts.focusQuestionId } : {}),
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
        if (!suppressUserEvents) {
          emitDlAgentEvent(spaceId, conceptForEvent, {
            type: 'error',
            mode,
            error: result.error ?? (result.stopReason === 'aborted' ? '本轮已中断' : '执行失败'),
          })
        }
      }
      if (!suppressUserEvents) emitDlAgentEvent(spaceId, conceptForEvent, { type: 'reply:done', mode, suggestions })

      logger.info(`[dl-agent] 轮次完成 mode=${mode} space=${spaceId} concept=${conceptId ?? '-'} stop=${result.stopReason} steps=${result.iterations}`)

      // M4-UX2：研究产出讲义卡后自动触发内部核验（异步，失败仅记日志，不影响主流程）。
      // （2026-09-09 复盘：空空间起步研究 conceptId=null 也可能落首卡——按卡自带 conceptId
      //   逐个核验并发 card-ready 通知，不再要求本轮 scope 必须有 conceptId）
      if (mode === 'research') {
        const savedCards = actionSummaries.filter((a) => a.tool === 'dl_save_card' && a.status === 'ok')
        if (savedCards.length > 0) {
          const spaceName = (await m.dlProjects?.getById(spaceId))?.name ?? undefined
          const firstCard = savedCards[0]
          const firstConceptId = (firstCard.data as { conceptId?: string } | undefined)?.conceptId
          const conceptName = firstConceptId ? (await m.dlConcepts?.getById(firstConceptId))?.name : undefined
          void dlPublishNotice('dl:card-ready', { spaceId, spaceName, conceptName })
        }
        for (const s of savedCards) {
          const cardId = (s.data as { cardId?: string } | undefined)?.cardId
          const cardConceptId = (s.data as { conceptId?: string } | undefined)?.conceptId
          if (!cardId || !cardConceptId) continue
          void this.verifyCard(spaceId, cardConceptId, cardId, { providerConfigId: opts.providerConfigId, modelId: opts.modelId }).catch((e) =>
            logger.warn(`[dl-agent] 自动核验失败 card=${cardId}：${e instanceof Error ? e.message : String(e)}`),
          )
        }
      }

      // 空空间起步研究收尾产物断言（2026-09-09 复盘）：
      // 起步任务结束空间仍无概念叶且本轮无任何 dl_* 成功动作 → 明确告知零产出，不静默"成功"
      if (wasEmpty) {
        const stillEmpty = newSnapshot.isEmptySpace
        const savedAny = actionSummaries.some((a) => a.status === 'ok')
        if (stillEmpty && !savedAny) {
          content += `\n\n⚠️ 本轮起步研究未能产生任何落库产出（空间仍无知识概念）。可能原因：资料源不可达 / 采集工具失败 / 本轮被中断。建议检查绑定知识库与网络后重试，或直接下达具体任务（如"先建 3-6 个核心概念"）。`
          logger.warn(`[dl-agent] 空空间起步研究零产出 space=${spaceId} stop=${result.stopReason}`)
        }
      }

      return { actionSummaries, content, questionId, suggestions }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error(`[dl-agent] 轮次异常 mode=${mode} space=${spaceId}: ${msg}`)
      if (!suppressUserEvents) emitDlAgentEvent(spaceId, conceptForEvent, { type: 'error', mode, error: msg })
      if (mode === 'research') {
        void dlPublishNotice('dl:research-failed', { spaceId, conceptName: conceptId ?? undefined })
      }
      throw e
    } finally {
      tap.untap?.()
    }
  }

  /**
   * 内部自动核验（M4-UX2）：只读核验会话对讲义卡交叉检查（KB/联网），
   * 结果写 dl_card.verification；用户不可见、不阻塞主流程。
   *
   * 2026-09-09 复盘：同概念多卡并发核验会撞 busy 键（scopeKey 无 cardId，
   * 第二个必抛"上一轮仍在处理"并被吞）——按 space+concept 串行排队执行。
   */
  async verifyCard(
    spaceId: string,
    conceptId: string,
    cardId: string,
    opts: { providerConfigId?: string; modelId?: string } = {},
  ): Promise<DlCardVerification | null> {
    const key = `verify:${spaceId}:${conceptId}`
    const prev = this.verifyChain.get(key) ?? Promise.resolve()
    const run = prev.catch(() => undefined).then(() => this.verifyOne(spaceId, conceptId, cardId, opts))
    this.verifyChain.set(key, run)
    try {
      return await run
    } finally {
      if (this.verifyChain.get(key) === run) this.verifyChain.delete(key)
    }
  }

  private async verifyOne(
    spaceId: string,
    conceptId: string,
    cardId: string,
    opts: { providerConfigId?: string; modelId?: string },
  ): Promise<DlCardVerification | null> {
    const m = getCoreDatabaseManager()
    const row = await m.dlCards?.getById(cardId)
    const concept = conceptId ? ((await m.dlConcepts?.getById(conceptId)) ?? null) : null
    if (!row || row.projectId !== spaceId) return null

    const sectionsText = row.sections
      .slice(0, 30)
      .map((s) => `### ${s.title ?? s.key}\n${s.md}`)
      .join('\n\n')
    const evidenceText = (row.evidenceSources ?? [])
      .map((e) => `- ${e.kind}「${e.title}」${e.url ? `(${e.url})` : ''}${e.kbDocId ? ` kbDocId=${e.kbDocId}` : ''}`)
      .join('\n')
    const message = `核验对象（概念「${concept?.name ?? conceptId}」，讲义 v${row.version}）：\n\n${sectionsText}\n\n【证据来源】\n${evidenceText}`

    const res = await this.sendMessage('verify', { spaceId, conceptId }, message, opts)
    const outcome = parseVerifyOutcome(res.content)
    if (outcome) {
      await m.dlCards!.patch(cardId, { verification: outcome })
      logger.info(`[dl-agent] 核验完成 card=${cardId} status=${outcome.status} issues=${outcome.issues.length}`)
    } else {
      // 解析失败：保持未核验并记录（不误标 verified）
      logger.warn(`[dl-agent] 核验结果无法解析 card=${cardId}，保持未核验`)
      await m.dlCards!.patch(cardId, { verification: null })
    }
    return outcome
  }
}
