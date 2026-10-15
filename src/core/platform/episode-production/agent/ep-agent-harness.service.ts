/**
 * EP Agent 宿主（HostKit 直驱，36 号收敛；原 M6.5-a 手工装配迁移）
 * @module platform/episode-production/agent/ep-agent-harness.service
 *
 * 旧「JSON 决策 + 批量动作 + 总结」三段式（ep-agent-workflow.service）→ LoopRunner 多轮循环。
 * 与长文宿主（lw-agent-harness.service）同构，EP 特有：
 * - scopeKey/会话按 project+episode 二维（ep-agent:<projectId>:<episodeId>）
 * - 工具来自共享 registry 的 ep-agent pack（懒注册，见 ep-agent-tools.ts）
 * - **四大能力接线**（35 号 §4 硬性；①②④由 HostKit 内置——36 号）：
 *   ①上下文管理：kit 内置 ContextManager（剧本/分镜大文本必须窗口化）
 *   ②记忆管理：kit 内置装配——scope 分层（L1 用户级恒含；EP 域/项目级记忆入列后自动生效）
 *   ③任务规划 + ④工作流规划：白名单透出 create_task_plan / create_workflow_draft，
 *     是否使用由 agent 按任务复杂度决定（提示词只写判断纪律，不写死必须规划）
 * - 事件面与旧协议对齐（前端零改动）：reply 流式正文走 longwriting:generate:${eventId}
 *   （源码头注的 ep-agent:generate:* 是过时注释——评审 P1-1）；tool-start/end **不**映射
 *   action 事件（动作内 emit 唯一来源，评审 P1-6）
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { createLogger } from '@core/utils/logger'
import { createHostKit, formatStopNote } from '@core/platform/agent-runtime'
import { loadAgentBudget } from '@core/platform/agent-runtime/budget/agent-budget'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolBinding } from '@shared/types/agent.types'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { getMemoryFlywheel } from '@core/platform/workflow/workflow-boot'
import { DbAgentSessionStore } from '@core/platform/agent-runtime/memory/session-store'
import { ApprovalCoordinator } from '@core/platform/agent-runtime/runtime/approval'
import type { PendingApproval } from '@shared/types/agent.types'
import type { ModelMessage } from 'ai'
import type {
  EpAgentActionSummary,
  EpAgentActionType,
  EpAgentProductionState,
  EpAgentSendResult,
} from './ep-agent.types'
import { EP_AGENT_DEFINITION_ID, EP_AGENT_HISTORY_LIMIT } from './ep-agent.types'
import { computeEpProductionState, buildEpSuggestions } from './ep-agent-deps'
import { emitEpAgentEvent, epAgentEventChannel } from './ep-agent-events'
import { epAgentConversationId } from './ep-agent-workflow.service'
import { EP_AGENT_PACK_ID, EP_TOOL_MAX_CALLS, registerEpAgentTools, EP_CONFIRM_CHOICE_TOOL } from './ep-agent-tools'
import type { PromptContext } from '@core/platform/episode-production/prompts/prompt-context'
import { buildPromptContextForEpisode } from '@core/platform/episode-production/prompts/episode-prompt-context.service'

const logger = createLogger('EpAgentHarness')

/** 历史单条注入截断（分级：assistant 4000 保留行动自述 / user 600——对齐 room-session） */
const HISTORY_USER_MAX = 600
const HISTORY_ASSISTANT_MAX = 4000

/** 单类资产名单在快照里展示的条数（三类对齐，超出注"+M 个"） */
const SNAPSHOT_ASSET_NAMES_LIMIT = 8

/** 名单渲染：前 N 名 + 超出计数（§3.1：三类对齐，此前地点/物品只有计数没名字） */
function renderNameList(names: string[] | undefined, limit = SNAPSHOT_ASSET_NAMES_LIMIT): string {
  const list = (names ?? []).filter((n) => typeof n === 'string' && n.trim().length > 0)
  if (list.length === 0) return ''
  const shown = list.slice(0, limit).join('、')
  const rest = list.length - limit
  return rest > 0 ? `${shown} 等 ${list.length} 个（另有 ${rest} 个未列出）` : shown
}

/**
 * 系统提示词：角色 + 纪律（含规划判断纪律——能力透出，使用由 agent 按复杂度决定）。
 *
 * §3.1：纪律里的**数字从常量渲染**（此前"资产生成每轮限 3 次"与 EP_TOOL_MAX_CALLS
 * 是同一约束的两处硬编码，改常量即漂移）；新增破坏性操作确认与中断语义纪律。
 */
export function epAgentSystemPrompt(): string {
  return `你是剧集制作项目的制作助理，可以直接调用工具替用户完成制作任务。你驱动的是一条完整生产流水线：
剧本 → 场景 → 分镜 → 关键帧 → 视频 → 配音 → 合成导出 MP4（配套能力：资产主图、实体增改、外部数据查询）。
当前项目与剧集状态快照会随每轮注入。

纪律：
1. 简单请求直接执行对应工具，不要拆解规划；只有跨集/多环节的复杂目标才考虑 create_task_plan 拆任务树（创建后需用户在「Agent 任务树」页批准才会执行）。
2. 固定可复用的制作流水线才考虑 create_workflow_draft 沉淀为工作流草稿；一次性的需求不要沉淀。
3. 依赖不满足（如未生成分镜就想生成关键帧）时工具会返回暂缓原因，请向用户解释缺什么前置，或先执行前置动作。
4. 成本意识：生成关键帧/视频/资产图/配音都按次计费。资产生成类每轮限 ${EP_TOOL_MAX_CALLS.generate_char_asset} 次且按参数去重——用户要求"给多个角色出图"时，用不同 name 逐个调用（同参数重复调用会被拦截）；关键帧/视频类工具缺省只补缺失项，不要重复生成已有产物。
5. name 必须用状态快照或工具结果里的真实资产名，不要编造；工具找不到该名字时会报错并列出现有名单，请从名单中选择。
6. 资产是项目级共享：跨集制作优先复用既有资产，避免为同一角色/地点重复建卡；生成资产图时沿用项目风格锚点（快照里的「风格」字段），保持全片画风一致。
7. 不要重复调用刚刚成功过的同一工具；工具失败后可换参数重试一次，仍失败就如实告知。
8. 所有动作完成后，用一段话向用户总结：本轮做了什么、结果如何、下一步建议（可参照快照中的生产进度给出缺口）。
9. 用户意图或关键参数不明确时，先调用 ep_confirm_choice 发起选择卡或用一句话确认，不要编造参数。
10. **破坏性操作必须先确认**：删除资产/场景/分镜、force 全量重写（会覆盖既有成果）前，先调用 ep_confirm_choice 说明将影响什么，得到用户确认再执行。
11. 用户可随时中断本轮：若用户表示"停下/取消/先不做了"，立即停止发新工具调用，用一句话汇报当前进度与已完成的部分；用户再次要求继续时，先重算状态（快照是轮初的，可能已过期）再续作。
12. 状态快照是**轮初**快照：工具执行成功后的最新状态以工具返回结果为准。
13. 生成视频/导出 MP4 是分钟级后台任务：工具返回「已启动」即代表成功开始，**不要**为等完成而重复调用同一目标（在途任务会被去重拦截）；回复用户时说明需数分钟、完成后状态会自动更新，可在分镜/合成页查看。`
}

/**
 * 生产状态 → 快照文本（initState 播种/任务 snapshot 用）。
 * 2026-09-16 S-04：注入项目名 + 四阶段就绪粗判 + 用户当前界面（renderer 随消息带的
 * contextHint）。readiness 专项服务（S-01）落地前用现有快照字段推导粗判，不引入新依赖。
 *
 * §3.1（2026-10-06）：补注入风格/画幅/目标集长（纪律 6 要求"沿用项目风格锚点"，
 * 但快照此前不提供风格文本，该纪律空转）+ 三类资产**全名名单**（此前地点/物品
 * 只有计数没名字，纪律 5 对它们不可满足）。
 */
export function epStateToSnapshot(
  state: EpAgentProductionState,
  contextHint?: string,
  ctx?: PromptContext,
): string {
  const ep = state.episode
  const prod = state.production
  const lines = [
    `项目：${state.project?.name ?? '(未知项目)'}`,
    `剧集：${ep.title ?? '(未命名)'} 第${ep.episodeNumber ?? '?'}集（状态：${ep.status ?? '-'}，剧本：${ep.hasScript ? '已有' : '未生成'}）`,
  ]
  if (ep.synopsis) {
    lines.push(`梗概：${ep.synopsis.slice(0, 80)}${ep.synopsis.length > 80 ? '…' : ''}`)
  }
  lines.push(
    `场景：${state.scenes.total} 个（${state.scenes.countWithBindings} 个已绑定地点）`,
    `分镜：${state.storyboards.total} 个，覆盖 ${state.storyboards.scenesCovered}/${state.storyboards.scenesTotal} 场`,
  )
  if (prod) {
    lines.push(
      `生产进度：关键帧 ${prod.storyboardsWithKeyframes}/${state.storyboards.total} 分镜、视频 ${prod.storyboardsWithVideo}/${state.storyboards.total} 分镜、配音 ${prod.scenesWithAudio}/${state.scenes.total} 场景、成片${ep.composedVideoPath ? '已导出' : '未导出'}`,
    )
  }
  lines.push(`阶段就绪：${epReadinessLine(state)}`)

  // §3.1：三类资产全名名单（对齐角色，此前地点/物品只有计数）
  const charNames = renderNameList(state.assets.characters.names)
  const locNames = renderNameList(state.assets.locations.names)
  const itemNames = renderNameList(state.assets.items.names)
  lines.push(
    `资产：角色 ${state.assets.characters.count}${charNames ? `（${charNames}）` : ''}；` +
      `地点 ${state.assets.locations.count}${locNames ? `（${locNames}）` : ''}；` +
      `物品 ${state.assets.items.count}${itemNames ? `（${itemNames}）` : ''}`,
  )

  // §3.1：项目制作参数（风格/画幅/体裁/目标集长/语速）——纪律 6 依赖风格文本
  const settings: string[] = []
  if (ctx?.storyEra) settings.push(`年代：${ctx.storyEra}`)
  if (ctx?.storyRegion) settings.push(`地域：${ctx.storyRegion}`)
  if (ctx?.stylePrompt) settings.push(`风格：${ctx.stylePrompt}`)
  if (ctx?.aspectRatio) settings.push(`画幅：${ctx.aspectRatio}`)
  if (ctx?.genre?.label) settings.push(`体裁：${ctx.genre.label}`)
  if (ctx?.targetEpisodeDurationSec) settings.push(`目标集长：约 ${ctx.targetEpisodeDurationSec} 秒`)
  if (settings.length > 0) {
    lines.push(`制作参数：${settings.join('、')}`)
  }

  if (state.dataSources && state.dataSources.length > 0) {
    lines.push(`候选数据源名单：${state.dataSources.join('、')}`)
  }
  if (contextHint) {
    lines.push(`用户当前界面：${contextHint}（用户说"这个/当前"时优先按此理解）`)
  }
  return lines.join('\n')
}

/** 四阶段就绪粗判（快照字段推导；S-01 readiness service 就位后可替换为其结论） */
function epReadinessLine(state: EpAgentProductionState): string {
  const scriptReady = state.episode.hasScript && state.scenes.total > 0
  const assetCount =
    state.assets.characters.count + state.assets.locations.count + state.assets.items.count
  const sbReady = state.storyboards.total > 0
  const prod = state.production
  const composeText = state.episode.composedVideoPath
    ? '已导出✓'
    : sbReady && prod && prod.storyboardsWithVideo >= state.storyboards.total
      ? '可导出✓'
      : '未就绪✗'
  return (
    `剧本${scriptReady ? '✓' : '✗（缺剧本/场景）'}` +
    ` / 资产${assetCount > 0 ? `✓（${assetCount} 项）` : '✗（未建资产）'}` +
    ` / 分镜${sbReady ? `✓（${state.storyboards.total} 镜）` : '✗'}` +
    ` / 合成${composeText}`
  )
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

/** 飞轮安全获取（子系统未装配时 null——kit 记忆装配降级为仅结构化提供方） */
function safeFlywheel() {
  try {
    return getMemoryFlywheel()
  } catch {
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
    opts: { providerConfigId?: string; modelId?: string; contextHint?: string } = {},
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
    opts: { providerConfigId?: string; modelId?: string; contextHint?: string },
    controller: AbortController,
  ): Promise<EpAgentSendResult> {
    const m = this.manager()
    const conversationId = epAgentConversationId(episodeId)
    const scopeId = `ep-agent:${projectId}:${episodeId}`

    // 动作摘要收集：工具内 ctx.emit 的富 action:done 事件（经事件总线）回流为本轮结果
    const channel = epAgentEventChannel(projectId, episodeId)
    const actionSummaries: EpAgentActionSummary[] = []
    // 生产 emitter 只实现 tapEvents（评审 P0-1：IEventEmitter 无 on/off）；
    // 惰性 tap：try 内首个副作用前调用（getAgentLoopHarness 抛错时订阅不泄漏）
    const tap = { untap: null as (() => void) | null }
    const tapActionDone = (): void => {
      tap.untap = getEventEmitter().tapEvents?.((c, data) => {
        if (c !== channel) return
        const ev = data as { type?: string; summary?: EpAgentActionSummary }
        if (ev?.type === 'action:done' && ev.summary) actionSummaries.push(ev.summary)
      }) ?? null
    }

    // harness 就位 + 模块域工具懒注册（评审 P0-1：pack activate 时 registry 尚不存在）
    const harness = getAgentLoopHarness()
    registerEpAgentTools(harness.registry)

    // 0. 文本模型兜底（实测 P0：默认提供商可能只有 embedding/image 模型——
    // agent 的 LLM 必须是文本对话模型，缺省时取第一个 enabled 提供商的 text 模型）
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
      } catch { /* 解析失败走 resolveModel 默认路径 */ }
    }

    // 0.5 会话归属（干跑实测 P0：lw_design_messages.project_id FK→lw_projects，
    // EP 视频项目需映射回 longWritingProjectId）
    let conversationProjectId = projectId
    try {
      const vp = await m.videoProjects?.getById?.(projectId)
      if (vp?.longWritingProjectId) conversationProjectId = vp.longWritingProjectId
    } catch { /* 保持 projectId 兜底 */ }

    // 1. 历史（保存用户消息前取——当前消息由 initState 播种）
    // 分级截断（2026-09-16 P1-AG5）：assistant 4000 保留行动自述与总结细节，
    // user 600；此前一刀切 600 让多轮制作里 agent 只剩上一轮的压缩残影
    const history = await m.lwDesignMessages.getByConversationId(conversationId)
    const seeded = history
      .filter((h: { role: string }) => h.role === 'user' || h.role === 'assistant')
      .slice(-EP_AGENT_HISTORY_LIMIT)
      .map((h: { role: string; content: unknown }) => ({
        role: h.role as 'user' | 'assistant',
        content: String(h.content ?? '').slice(0, h.role === 'assistant' ? HISTORY_ASSISTANT_MAX : HISTORY_USER_MAX),
      } as ModelMessage))

    // 2. 保存用户消息（UI 历史源不变）
    await m.lwDesignMessages.add(conversationId, { role: 'user', content: message, timestamp: Date.now() }, { projectId: conversationProjectId })

    // 3. 状态快照 + 工具白名单（模块域 pack 全名 + 规划类系统工具）
    const state = await computeEpProductionState(m, projectId, episodeId)
    // 平台预算（agent:budget）：步数用 episode 档；工具上限只认**用户显式覆盖**，
    // 没配就沿用 ep 自己的成本闸门默认（2026-09-13 参数配置化）
    const { budget } = await loadAgentBudget(m.settings)
    const packNames = harness.registry
      .listSpecs({ packId: EP_AGENT_PACK_ID })
      .map((s) => s.name)
    const planningTools = ['create_task_plan', 'create_workflow_draft']
    const bindings: AgentToolBinding[] = [
      ...packNames.map((name) => {
        const short = name.replace(`pack:${EP_AGENT_PACK_ID}:`, '')
        // dedupArgs（2026-09-16 S-04）：maxCalls 放宽到同类 3 次/轮后，按 action+参数
        // 去重防模型对同一目标重复点火（不同资产/分镜各占一次额度）
        return { tool: name, maxCalls: budget.maxCalls.overrides[short] ?? EP_TOOL_MAX_CALLS[short], dedupArgs: true }
      }),
      ...planningTools.map((tool) => ({
        tool,
        ...(budget.maxCalls.overrides[tool] !== undefined ? { maxCalls: budget.maxCalls.overrides[tool] } : {}),
      })),
      // kb_brain_query（T17/M3）：分镜/编剧会话主动查知识大脑（read，无频控上限）
      { tool: 'kb_brain_query', dedupArgs: true },
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

    // 4. 观测面 + 会话持久化（sink/会话存储由 HostKit 承接——36 号）
    const store = getSessionStore()

    // 5. 事件流映射（reply 流式走 longwriting:generate 通道——评审 P1-1）
    let summaryEventId = ''
    let allText = ''
    const newSummaryEvent = () => {
      summaryEventId = `ep-agent-summary-${episodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      emitEpAgentEvent(projectId, episodeId, { type: 'reply:start', summaryEventId })
    }
    const emitStage = (stage: 'deciding' | 'acting') => emitEpAgentEvent(projectId, episodeId, { type: 'stage', stage })

    emitStage('deciding')
    newSummaryEvent()
    tapActionDone()

    // 5b. §3.1：装配统一提示词上下文（风格/画幅/体裁/目标集长/语速）供快照注入——
    //     纪律 6 要求"沿用项目风格锚点"，但优化前快照不提供风格文本，该纪律空转。
    //     （实修 2026-10-14：此处原引用了作用域外的裸 `db`——ReferenceError: db is not defined，
    //     此前被 standalone 项目更早的外键失败掩盖，外键修复后流程推进至此才暴露）
    const promptCtx: PromptContext = await buildPromptContextForEpisode(m.dataSource, episodeId)

    // 6. HostKit 装配（36 号）：脊柱（sink/turn_start/记忆装配/ContextManager/RunRegistry/
    //    abort 桥/AgentHost 骨架）内置；EP 只声明差异面。记忆 stub 在此补齐——
    //    scope 分层召回：L1 用户级恒含，EP 域/项目级记忆入列（蒸馏打标）后自动生效
    const kit = createHostKit<{ input: string }>(
      {
        definitionId: EP_AGENT_DEFINITION_ID,
        scopeKey: () => scopeId,
        tools: () => toolMap,
        resolveModel: (o) => harness.resolveModel({ providerConfigId: o?.providerConfigId, modelId: o?.modelId }),
        systemPrompt: () => epAgentSystemPrompt(),
        snapshot: () => epStateToSnapshot(state, opts.contextHint, promptCtx),
        seededHistory: () => seeded,
        maxSteps: budget.maxSteps.episode,
        // EP 剧本/分镜文本大，32K 起步（保留 EP 专属旋钮，缺省回落全局——评审 P2-3）
        contextWindowTokens:
          Number(process.env.EP_AGENT_CONTEXT_WINDOW ?? process.env.AGENT_CONTEXT_WINDOW ?? 32_768) || 32_768,
        // 审批挂起豁免空闲看门狗（2026-09-16 P1-AG1）：ep_confirm_choice 挂起期间
        // fullStream 无事件，缺省 300s 空闲超时会把「等待用户选择」误判为步超时→
        // 重试→撞单卡断言→晚到的用户选择被静默吞。
        // 0916 晚 review 修正：曾置 0=永久关闭看门狗——审批（30min auto-reject）与
        // 长工具（30min executeTimeout）都有兜底，唯独纯流假死（网络黑洞）无界：
        // runTurn 永不返回、busy Map 锁死。改为 35min：既盖过两类挂起不误伤，
        // 又给真挂死留下限。
        streamIdleTimeoutMs: 2_100_000,
        memory: {
          scope: () => ({ bizModule: 'episode-production', projectId }),
          // 召回语料只用用户消息（story-room 复盘结论：整段快照作语料会让 2-gram
          // 撞上无关全局记忆，构成污染源）
          recallText: () => message,
        },
        requestApproval: (tool, input, call) => approvalCoordinator.request(call.scopeId, tool, input, call.signal),
        onStream: (_t, event) => {
          if (event.kind === 'delta' && summaryEventId) {
            allText += event.text
            getEventEmitter().emit(`longwriting:generate:${summaryEventId}`, { type: 'content', content: event.text })
          }
          if (event.kind === 'tool-start') emitStage('acting')
          // tool-end 不映射 action:done：动作内 ctx.emit 已发富 summary 事件（评审 P1-6）
        },
        onTrajectoryEntry: (_t, entry) => {
          // 步起点：仅当该步调用了工具（后面还有一步）才重置流式气泡——
          // 最后一步（无工具调用）的文本就是总结，重置会把总结清空（review 自查）
          if (entry.kind === 'decision' && entry.name !== 'turn_start') {
            const toolCalls = entry.payload?.toolCalls
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
              emitStage('deciding')
              newSummaryEvent()
            }
          }
        },
        runtimeContext: () => ({
          projectId,
          episodeId,
          // KE 分层打标（37 号）：create_task_plan 据此把 scopeTag 盖进任务树 spec
          memoryScope: { bizModule: 'episode-production', projectId },
          providerConfigId: opts.providerConfigId,
          modelId: opts.modelId,
          catalogPacks: [EP_AGENT_PACK_ID],
        }),
        modelPreference: () => ({ providerConfigId: opts.providerConfigId, modelId: opts.modelId }),
      },
      { trajectoryPort: harness.trajectoryRepo ?? null, sessionStore: store, flywheel: safeFlywheel() },
    )

    try {
      const result = await kit.runTurn({ input: message }, { signal: controller.signal })

      const newState = await computeEpProductionState(m, projectId, episodeId)
      const suggestions = buildEpSuggestions(newState)
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
      }, { projectId: conversationProjectId })
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
        }, { projectId: conversationProjectId })
      } catch { /* 兜底失败仅留日志 */ }
      emitEpAgentEvent(projectId, episodeId, { type: 'error', error: msg })
      throw e
    } finally {
      tap.untap?.()
      this.coordinators.delete(`${projectId}:${episodeId}`)
    }
  }

  async getHistory(episodeId: string) {
    return this.manager().lwDesignMessages.getByConversationId(epAgentConversationId(episodeId))
  }

  async getState(projectId: string, episodeId: string): Promise<EpAgentProductionState> {
    return computeEpProductionState(this.manager(), projectId, episodeId)
  }
}
