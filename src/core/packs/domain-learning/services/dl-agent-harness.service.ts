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
import { buildDlBindings, isPlanningSaveRound } from './dl-agent-bindings'
import { getConfirmedLessonSpec, getConfirmedSyllabus } from './dl-plan.service'
import { lessonSpecLock } from '@shared/utils/lesson-spec'
import { DL_ESSENCE_TYPES, lessonTemplateHint } from '@shared/utils/lesson-template'
import { planConceptNames, planSaveBudget } from '../rules/learning-plan.rules'
import { loadAgentBudget } from '@core/platform/agent-runtime/budget/agent-budget'
import {
  buildDlSuggestions,
  buildFocusQuestionLines,
  computeDlSpaceSnapshot,
  dlBootstrapS4Body,
  dlEmptySpaceMission,
  dlResearchSystemPrompt,
  dlSkillBody,
  DL_MAP_COMPLETION_SKILL_ID,
  shouldInjectMapCompletionSkill,
  PLAN_LESSON_CONFIRMED_MARKER,
  PLAN_SYLLABUS_CONFIRMED_MARKER,
  PLAN_UNDERSTANDING_CONFIRMED_MARKER,
  LESSON_QUICK_MODE_MARKER,
  isPlanPhaseMessage,
  lessonAuthoringInstruction,
  lessonPlanProposeInstruction,
  lessonQuickModeHint,
  planSavePhaseInstruction,
  planSyllabusPhaseInstruction,
  planUnderstandingPhaseInstruction,
  formatSyllabusLines,
  formatUnderstandingSummary,
  dlTaskSystemPrompt,
  dlTutorSystemPrompt,
  dlVerifySystemPrompt,
  researchSourceHint,
} from './dl-agent-deps'
import { emitDlAgentEvent, emitDlStream } from './dl-agent-events'
import { dlPublishNotice } from './dl-notice'
import { parseVerifyOutcome } from '../rules/learning-verify.rules'
import type { DlCardVerification } from '@shared/types/domain-learning.types'
import { DlActivityTracker } from './dl-agent-activity'
import {
  DL_AGENT_DEFINITION_ID,
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
    // 平台预算（settings 表 agent:budget；2026-09-13 用户需求：步数/频控/落库额度/上下文窗口
    // 这类参数不再写死）。每轮读一次——一次小键值查询，换来"设置页改完下一轮即生效"。
    const { budget, notes: budgetNotes } = await loadAgentBudget(m.settings)
    if (budgetNotes.length) logger.debug(`[dl-agent] 预算解析说明：${budgetNotes.join('；')}`)
    // 规划落库轮标记：绑定额度、注入阶段指令、以及 runtimeContext（动作层门禁）三处共用，
    // 故在分支外声明（只有带工具的模式才会被赋值 true）
    let planningRound = false
    if (mode === 'research' || mode === 'verify' || mode === 'task') {
      const registered = new Set(harness.registry.listSpecs().map((s) => s.name))
      let webSearchAvailable = false
      try {
        webSearchAvailable = !!(await m.searchEngineConfigs?.getDefault?.())
      } catch (e) {
        logger.debug(`[dl-agent] 默认搜索源探测失败，按无源处理：${e instanceof Error ? e.message : String(e)}`)
        webSearchAvailable = false
      }
      // 规划落库轮（起步研究 / 补全知识地图 / 固定流程的第 2、3 步）
      planningRound = isPlanningSaveRound({
        mode,
        isEmptySpace: snapshot.isEmptySpace,
        // 补图流程的第 2/3 轮文案不含"补全"动词，靠 isPlanPhaseMessage 兜住（否则会掉出规划轮）
        wantsMapCompletion:
          mode === 'task' && (shouldInjectMapCompletionSkill(message) || isPlanPhaseMessage(message)),
        // research 落库轮重试兜底（2026-09-25 P1-7）：已落部分概念后重发【已确认知识体系】时
        // isEmptySpace 已翻转，靠标记保持规划轮语义（阶段指令 + 额度）
        syllabusConfirmed: message.includes(PLAN_SYLLABUS_CONFIRMED_MARKER),
      })
      // 额度：有已确认方案时按方案条目数放宽（用户要求），否则用规划额度兜底
      // （无确认方案时 dl_save_concept 会被门禁拒绝，额度只是兜底不报错）
      const confirmedSyllabus = planningRound ? await getConfirmedSyllabus(m, spaceId) : null
      const saveBudget = confirmedSyllabus
        ? planSaveBudget(confirmedSyllabus, budget.domainLearning.saveBudget, budget.domainLearning.maxSaveBudget)
        : planningRound
          ? budget.domainLearning.saveBudget
          : null
      bindings = buildDlBindings({
        mode,
        availableToolNames: registered,
        webSearchAvailable,
        // 频控与落库额度全部来自平台预算（默认值=改造前写死的那些；设置页可覆盖）
        toolMaxCalls: budget.maxCalls.byTool,
        readMaxCalls: budget.maxCalls.read,
        budgetMax: budget.domainLearning.maxSaveBudget,
        // 默认 12 次概念额度装不下"分支+知识点"（2026-09-13 复盘：金融理财轮 4 分支 + 6 知识点
        // 后用满，「保险与风险转移」「资产配置与分散化」「指数基金与定投」三个被静默拒建）
        ...(saveBudget ? { saveBudget } : {}),
      })
      snapshotText += `\n${researchSourceHint(webSearchAvailable)}`
      // 空空间起步研究：注入「第 1 步：对齐诉求」任务引导
      // （2026-09-13 固定流程：起步研究拆成三轮——诉求理解 → 知识体系 → 按方案落库；
      //  bootstrap 技能正文改在**落库轮**注入，避免这一轮被推着直接建点）
      if (mode === 'research' && snapshot.isEmptySpace) {
        wasEmpty = true
        snapshotText += `\n${dlEmptySpaceMission({
          spaceName: snapshot.spaceName ?? spaceId,
          // 用户诉求（dl_project.description 原话）必须传给模型：只给空间名会让它凭名字猜主题
          description: snapshot.spaceDescription ?? null,
        })}`
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
      // 2026-09-25 C2 互斥：本空间还没有「已确认知识体系」时不注入技能正文——其 S3 会被落库门禁
      // 直接拒绝，且与下方固定流程第 1 步指令（"本轮不要 dl_save_concept"）同轮矛盾；这种空间
      // 先走固定流程把补全清单提交成方案，确认后的下一轮再注入技能正文落库。
      let mapCompletionInjected = false
      if (mode === 'task' && shouldInjectMapCompletionSkill(message) && confirmedSyllabus) {
        const body = dlSkillBody(DL_MAP_COMPLETION_SKILL_ID)
        if (body) {
          mapCompletionInjected = true
          snapshotText +=
            `\n\n【learning-map-completion 技能正文（宿主注入；本空间已有已确认知识体系，` +
            `直接执行 S2 对照缺口规划 → S3 落库 → S4 自检，不必重新提交方案）】\n${body}`
        }
      }

      // ==================== 固定流程三阶段（2026-09-13 用户需求） ====================
      // 阶段判定（优先级从高到低）：
      //   ① 消息带「已确认知识体系」标记 → 第 3 步：按方案落库（此轮门禁放行）
      //   ② 消息带「已确认诉求理解」标记 → 第 2 步：规划知识体系
      //   ③ 规划轮（起步研究 / 补全地图首轮）→ 第 1 步：对齐诉求
      // 阶段指令放在最后注入（最新鲜），门禁在动作层复核，两者互为兜底。
      if (planningRound) {
        if (message.includes(PLAN_SYLLABUS_CONFIRMED_MARKER)) {
          const syllabus = confirmedSyllabus
          snapshotText +=
            '\n' +
            (syllabus
              ? planSavePhaseInstruction({
                  spaceName: snapshot.spaceName ?? spaceId,
                  syllabusLines: formatSyllabusLines(syllabus),
                  conceptCount: planConceptNames(syllabus).length,
                })
              : '【固定流程·第 3 步】已确认知识体系，但系统读不到方案内容——请让用户在弹窗里重新确认一次，或先重发方案。')
          // 落库轮才需要 bootstrap 技能正文——但只注入 S4（讲义产出规范）。
          // 2026-09-25 C1：此前注入全文，其 S2「规划并落库 3-8 个最核心的知识点…先定领域前置」
          // 与本阶段指令「不要重新规划、方案里的知识点要全部落库」同轮矛盾——已确认 20-40 条的
          // 方案会被 3-8 的口径带偏成少落库。S4 截取失败时兜底全文，靠阶段指令里的对冲句压住。
          const bootBody = mode === 'research' ? dlBootstrapS4Body() : null
          if (bootBody) {
            snapshotText += `\n\n【learning-space-bootstrap 技能正文·仅 S4 讲义规范（宿主注入；其 S1-S3 口径本轮不适用）】\n${bootBody}`
          }
        } else if (message.includes(PLAN_UNDERSTANDING_CONFIRMED_MARKER)) {
          const understanding = (await m.dlPlans?.getConfirmed(spaceId, 'understanding')) ?? null
          const parsed = understanding?.payload as
            | import('@shared/types/domain-learning.types').DlPlanUnderstanding
            | undefined
          snapshotText +=
            '\n' +
            (parsed?.goalSummary
              ? planSyllabusPhaseInstruction({
                  spaceName: snapshot.spaceName ?? spaceId,
                  understandingSummary: formatUnderstandingSummary(parsed),
                })
              : '【固定流程·第 2 步】诉求理解已确认，但系统读不到内容——请让用户在弹窗里重新确认一次。')
        } else if (!mapCompletionInjected) {
          // 已注入 map-completion（有确认方案）的轮次不再叠加"第 1 步"指令——两段指令对
          // "本轮能不能 dl_save_concept" 给出相反答案，弱模型会按错误的硬闯门禁（2026-09-25 C2）
          snapshotText += `\n${planUnderstandingPhaseInstruction(snapshot.spaceName ?? spaceId)}`
        }
      }

      // ==================== 讲义流水线（2026-09-14：Plan 规格 → Do 逐区精写 → Check 质检） ====================
      // 只在"研究某个知识点并产出讲义"的轮次里生效（有 conceptId 且非规划落库轮）。
      // - 已有已确认讲义方案 → 注入规格锁 + 逐区精写指令（Do 阶段）；
      // - 消息带【直接产出讲义】→ 快速模式（跳过方案确认，质检照样生效）；
      // - 其它 → 注入"先提交讲义方案"指令（Plan 阶段），用户确认后前端再驱动下一轮。
      if (mode === 'research' && conceptId && !planningRound) {
        const lessonPlan = await getConfirmedLessonSpec(m, spaceId, conceptId)
        const [targetConcept, space] = await Promise.all([
          m.dlConcepts?.getById(conceptId) ?? Promise.resolve(null),
          m.dlProjects?.getById(spaceId) ?? Promise.resolve(null),
        ])
        const conceptName = targetConcept?.name ?? conceptId
        if (lessonPlan) {
          snapshotText += `\n\n${lessonAuthoringInstruction({
            conceptName,
            specLock: lessonSpecLock(lessonPlan.spec, lessonPlan.essenceType),
          })}`
        } else if (message.includes(PLAN_LESSON_CONFIRMED_MARKER)) {
          // 用户点了"确认讲义方案"，但系统读不到已确认规格（如确认被后续提案退位）——
          // 不能默默退化成"自由发挥"，把恢复路径说清楚（与知识体系阶段的兜底同构）
          snapshotText +=
            '\n\n【讲义流水线·Do 阶段】用户已确认讲义方案，但系统读不到方案内容——' +
            '请让用户在弹窗里重新确认一次，或先用 dl_propose_lesson_plan 重发一版方案。'
        } else if (message.includes(LESSON_QUICK_MODE_MARKER)) {
          snapshotText += `\n\n${lessonQuickModeHint()}`
        } else {
          const essenceHint =
            '该概念的本质类型一旦定下，区集与区序就按它走：' +
            DL_ESSENCE_TYPES.map((t) => `${t}：${lessonTemplateHint(t)}`).join('；')
          snapshotText += `\n\n${lessonPlanProposeInstruction({
            conceptName,
            spaceGoal: space?.goal ?? null,
            hasExistingCard: !!targetConcept?.cardId,
          })}\n${essenceHint}`
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

    // 活动行（2026-09-13 用户需求：长任务要滚动显示"系统正在做什么"）：
    // 统一发**空间级通道**（不带 conceptId），空间页一条订阅即可显示任意概念轮的活动；
    // 事件里带 conceptId 供前端区分。失败行（kind='warn'）必须发——被额度拒绝的知识点
    // 以前是无声消失的（见 progress/2026-09-13-domain-learning-m1-fix-first-batch-root-causes.md）。
    // 翻译逻辑在 DlActivityTracker（纯类，已单测）：step 维护步号、tool-start 出 info 行、
    // tool-end 失败出 warn 行并复用主语。
    const activityTracker = new DlActivityTracker()
    const emitActivity = (line: string, kind: 'info' | 'warn' = 'info', tool?: string) => {
      if (suppressUserEvents) return
      emitDlAgentEvent(spaceId, null, {
        type: 'progress',
        mode,
        activity: { line, kind, conceptId: conceptId ?? null, tool },
      })
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
        maxSteps: mode === 'task' ? budget.maxSteps.task : budget.maxSteps.research,
        // 上下文窗口：env 是开发期应急开关（优先级最高），否则用平台预算配置
        contextWindowTokens:
          Number(process.env.AGENT_CONTEXT_WINDOW) || budget.domainLearning.contextWindowTokens,
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
          // 活动行翻译（2026-09-13）：把每一步工具调用翻成一行"正在做什么"推给空间页
          const activity = activityTracker.onStream(event)
          if (activity) emitActivity(activity.line, activity.kind, activity.tool)
        },
        runtimeContext: () => ({
          spaceId,
          mode,
          // KE 分层打标（37 号）：create_task_plan 据此盖 scopeTag——缺此声明蒸馏
          // 全部退化 L1 用户级，跨模块记忆互串（六扇门复盘实证）
          memoryScope: { bizModule: 'domain-learning', projectId: spaceId },
          ...(conceptId ? { conceptId } : {}),
          ...(opts.focusQuestionId ? { questionId: opts.focusQuestionId } : {}),
          // 规划落库轮标记：动作层据此校验"知识体系是否已用户确认"（2026-09-13）
          ...(planningRound ? { planningRound: true } : {}),
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
