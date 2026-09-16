/**
 * 系统 Agent 聊天宿主（28 号 M5 批2）
 * @module core/packs/chat/services/system-agent/system-agent.service
 *
 * 对话框开启 Agent 模式后，sendMessage 分流到这里：不再走单趟 chatStream，
 * 而是驱动 harness 的 LoopRunner（系统工具集白名单）完成一轮对话——
 * 中间步文本/工具事件照实流入 chat:stream，最终回复落 messages 表（UI 数据源），
 * 工作记忆（含工具调用中间态）落 agent_sessions（多轮续聊），轨迹落
 * agent_trajectories。与任务树执行器同一运行时、同一持久化面（架构红线：
 * 这不是第四个野生 agent）。
 *
 * 多轮语义：每条用户消息触发一次 run；loadState 返回既有历史并追加本轮输入，
 * 模型可自然地在回复里反问澄清（下一轮用户消息接续同一 state）。
 *
 * 可测性：轮次主体 runAgentChatTurn 的全部端口（仓储/会话存储/registry/模型/
 * 流出口）注入——生产薄壳 sendMessage 只做单例装配。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import type {
  Dialog,
  SendMessageRequest,
  StreamEvent,
  MessageMetadata,
} from '@shared/types'
import type { ModelMessage, LanguageModel } from 'ai'
import { createLogger } from '@core/utils/logger'
import type {
  TrajectoryEntry,
} from '@core/platform/agent-runtime/types'
import { createHostKit } from '@core/platform/agent-runtime'
import { loadAgentBudget } from '@core/platform/agent-runtime/budget/agent-budget'
import { DbAgentSessionStore } from '@core/platform/agent-runtime/memory/session-store'
import type { TrajectoryAppendPort } from '@core/platform/agent-runtime/trajectory/sink'
import { getMemoryFlywheel } from '@core/platform/workflow/workflow-boot'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import {
  SYSTEM_AGENT_WHITELIST,
  type SystemAgentTurnRef,
} from '@core/platform/workflow/tools/system-agent-tools'
import type { AgentMessageMeta } from '@shared/types'
import { AGENT_BUDGET_DEFAULTS } from '@shared/types/agent-budget.types'

const logger = createLogger('SystemAgentChat')

/** 定义 id（轨迹/审计/会话定位用） */
export const SYSTEM_AGENT_DEFINITION_ID = 'system-chat-agent'
/**
 * 每轮最大步数的**内置默认值**（真正的生效值从 `agent:budget.maxSteps.systemAgent` 读，
 * 设置页「参数设置 → 系统助手」可调）。这里只作为默认来源登记，业务代码不再直接引它。
 */
export const SYSTEM_AGENT_DEFAULT_MAX_STEPS = AGENT_BUDGET_DEFAULTS.maxSteps.systemAgent
/** 工具入参摘要上限（流式 chips 展示） */
export const AGENT_ARGS_DIGEST_MAX = 120

/**
 * 系统提示词（路由纪律，28 号 §4）：识别需求 → 选能力 → 执行或澄清。
 * 追加对话设定的位置在 buildSystemPrompt（保留角色人设）。
 */
export const SYSTEM_AGENT_CHAT_PROMPT = `你是本系统的智能助手，可以直接调用系统能力完成用户的任务，而不只是给建议。

选择能力的纪律（按序判断）：
1. 闲聊/常识/创作类问题：直接回答，不用工具。
2. 需要外部实时信息：用 web_search / wf_web_extract / http_get 等工具查证后再答（给出来源）。
3. 用户的任务匹配系统里已有的工作流或技能：先 discover_capabilities 查目录，命中就用 run_workflow / invoke_skill 执行，不要手工重复实现工作流已有的能力。
4. 复杂的多步目标（需要分解、自主执行、逐任务验收）：用 create_task_plan 创建任务树，并明确告知用户到「Agent 任务树」页批准后才会执行。
4b. 用户想要一个可复用的自动化流程（描述了固定的处理步骤）：用 create_workflow_draft 生成工作流草稿，并告知用户到工作流编辑器检查发布后才能运行。一次性的任务用任务树，可复用的流程用工作流。
5. 需求信息不全（如运行工作流缺必填参数、目标含歧义）：用自然语言一次性问清所有缺失项，不要猜、不要编造参数，也不要发明系统里不存在的能力。

其他纪律：
- 目录里没有匹配能力时如实告知，可给替代方案（直连工具/创建任务树），绝不虚构工作流或技能。
- 工具失败时如实转述原因，可换路重试，不掩盖。
- 执行类操作完成后，把结果要点汇报给用户（引用产出的关键内容，而不是只说"完成了"）。`

/** 系统提示词 + 用户对话人设（角色 systemPrompt 保留，路由纪律在前） */
export function buildSystemPrompt(dialogSystemPrompt?: string): string {
  const persona = dialogSystemPrompt?.trim()
  return persona ? `${SYSTEM_AGENT_CHAT_PROMPT}\n\n[对话设定（用户自定义）]\n${persona}` : SYSTEM_AGENT_CHAT_PROMPT
}

/** 工具入参摘要（流式 chips；超长截断） */
export function digestAgentArgs(args: unknown, max = AGENT_ARGS_DIGEST_MAX): string | undefined {
  if (args === undefined || args === null) return undefined
  let s: string
  try {
    s = typeof args === 'string' ? args : JSON.stringify(args)
  } catch {
    return undefined
  }
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

/** 轨迹条目的广播瘦身：仅收窄 payload.args，entry 本体字段（kind/name/iteration…）必须原样保留
 * （33 号长程实测 P1：曾错展开 payload 顶层——tool_call 广播后 kind 丢失，时间线沦为无名孤儿卡） */
export function slimTrajectoryForBroadcast(entry: TrajectoryEntry): TrajectoryEntry {
  const payload = entry.payload
  if (!payload || !('args' in payload)) return entry
  return {
    ...entry,
    payload: { ...payload, args: digestAgentArgs((payload as { args?: unknown }).args, 2000) },
  }
}

/** 会话 id 约定（session-store 头注：{definitionId}:{scopeId}） */
export function agentSessionId(dialogId: string): string {
  return `${SYSTEM_AGENT_DEFINITION_ID}:dialog:${dialogId}`
}

/** 飞轮安全获取（子系统未装配时 null——kit 记忆装配降级为仅 L0 行） */
function safeFlywheel() {
  try {
    return getMemoryFlywheel()
  } catch {
    return null
  }
}

/** 会话历史清洗已上移 agent-runtime/runtime/session-sanitize（总收口：多宿主共用） */
import { sanitizeSessionHistory } from '@core/platform/agent-runtime/runtime/session-sanitize'
export { sanitizeSessionHistory }
/** 轮次消息持久化端口（db.messages 的消费子集；attachments 用宿主原始形态） */
export interface AgentTurnMessagePort {
  create(m: { dialogId: string; role: 'user' | 'assistant'; content: string; modelId?: string; attachments?: import('@shared/types').Attachment[] }): Promise<{ id: string }>
  updateContent(id: string, content: string): Promise<void>
  updateMetadata(id: string, metadata: MessageMetadata): Promise<void>
  updateTokensUsed(id: string, tokens: number): Promise<void>
}

/** 轮次会话存储端口（DbAgentSessionStore 的消费子集） */
export interface AgentTurnSessionPort {
  load(sessionId: string): Promise<ModelMessage[] | undefined>
  save(sessionId: string, messages: ModelMessage[]): Promise<void>
}

/** 轨迹逐条外推回调（29 号 M5.5 工作台实时时间线；fire-and-forget） */
export type OnTrajectoryEntry = (scopeKey: string, entry: import('@core/platform/agent-runtime/types').TrajectoryEntry) => void

/** 一轮对话的可注入端口（单测全 fake；生产由 sendMessage 装配） */
export interface AgentChatTurnDeps {
  messages: AgentTurnMessagePort
  sessions: AgentTurnSessionPort
  trajectoryPort: TrajectoryAppendPort | null
  registry: AgentToolRegistry
  resolveModel: (opts?: { providerConfigId?: string; modelId?: string }) => Promise<LanguageModel>
  emit: (event: StreamEvent) => void
  /** 轨迹逐条外推（工作台实时时间线；可选——缺省不推） */
  onTrajectoryEntry?: OnTrajectoryEntry
  /**
   * settings 读取端口（平台预算 `agent:budget`；可选——缺省用内置默认预算）。
   * 生产由 sendMessage 装配真实 settings；单测可省。
   */
  settings?: import('@core/platform/agent-runtime/budget/agent-budget').AgentBudgetSettingsPort | null
}

export interface AgentChatTurnResult {
  success: boolean
  error?: string
  stopReason?: string
  toolCalls: AgentMessageMeta['toolCalls']
  refs: SystemAgentTurnRef[]
}

/**
 * 跑一轮 Agent 对话（用户消息已由调用方落库；本函数负责 AI 消息全生命周期：
 * 创建占位 → 流式透传 → 终稿/元数据落库 → done/error 事件）。
 * 调用方负责 abort 信号与在途登记。
 */
export async function runAgentChatTurn(
  deps: AgentChatTurnDeps,
  params: {
    dialogId: string
    content: string
    systemPrompt: string
    modelPreference: { providerConfigId?: string; modelId?: string }
    signal: AbortSignal
    /** 用户消息 id（token 回写） */
    userMessageId?: string
  },
): Promise<AgentChatTurnResult> {
  // 写类工具每轮频控（总收口 C-P1-2：免审批 write 工具曾零频控——12 步×N 个
  // run_workflow 的成本放大面；读类不限）。2026-09-13 参数配置化：用户可在设置页按工具名覆盖，
  // 没配就用这里的默认（**只认用户显式覆盖**，避免读到别的宿主对同名工具的默认）
  const { budget } = await loadAgentBudget(deps.settings)
  const WRITE_CALL_CAPS: Record<string, number> = {
    run_workflow: 2,
    create_task_plan: 1,
    create_workflow_draft: 1,
    invoke_skill: 3,
  }
  const defs = deps.registry.buildToolDefs(
    SYSTEM_AGENT_WHITELIST.map((tool) => {
      const maxCalls = budget.maxCalls.overrides[tool] ?? WRITE_CALL_CAPS[tool]
      return { tool, ...(maxCalls !== undefined ? { maxCalls } : {}) }
    }),
  )
  if (!defs['discover_capabilities']) {
    return { success: false, error: '系统 Agent 工具集未注册（workflow-boot 装配失败），Agent 模式不可用', stopReason: 'error', toolCalls: [], refs: [] }
  }

  const scopeId = `dialog:${params.dialogId}`
  // 轨迹 sink / turn_start 轮次标记 / 记忆装配留痕 / RunRegistry 登记由 HostKit 内置（36 号）；
  // 会话存储键保留旧键（system-chat-agent:dialog:<id>——工作台会话列表与「查看上下文」的解析约定）
  const refs: SystemAgentTurnRef[] = []
  const toolCalls: AgentMessageMeta['toolCalls'] = []

  const aiMessage = await deps.messages.create({
    dialogId: params.dialogId,
    role: 'assistant',
    content: '',
    modelId: params.modelPreference.modelId,
  })
  deps.emit({ type: 'start', messageId: aiMessage.id, dialogId: params.dialogId })

  let streamedText = ''
  let lastEventKind: string | null = null
  /** 流式期 pending 工具（toolCallId → 名称/入参摘要），tool-end 时合流成完整记录 */
  const pendingCalls = new Map<string, { name: string; argsDigest?: string }>()

  // HostKit 装配（36 号）：脊柱内置——聊天侧保留面 = 消息生命周期（占位/流式/终稿/
  // metadata/token 回写）与 chat:stream 事件包装。ContextManager 此前缺位，由 kit 补齐
  const kit = createHostKit<{ input: string }>(
    {
      definitionId: SYSTEM_AGENT_DEFINITION_ID,
      scopeKey: () => scopeId,
      sessionKey: () => agentSessionId(params.dialogId),
      tools: () => defs,
      resolveModel: deps.resolveModel,
      systemPrompt: () => params.systemPrompt,
      maxSteps: budget.maxSteps.systemAgent,
      // 记忆装配（原 sendMessage 层 L0+L1）收敛 kit 内置 + memory_assembly 统一留痕
      memory: {
        scope: null,
        systemLine:
          '[系统能力] 可用工具/工作流/技能以 discover_capabilities 目录为准；复杂多步目标可用 create_task_plan 拆解为任务树。',
      },
      // 会话存储=多轮续聊权威源（保存失败上抛——静默丢历史会破坏下一轮记忆）
      sessionStoreCritical: true,
      onStream: (_t, event) => {
        const emit = (e: StreamEvent) => deps.emit({ ...e, messageId: aiMessage.id, dialogId: params.dialogId })
        if (event.kind === 'delta') {
          // 步间分隔（对抗 review P2：多步文本无分隔会粘连成一段）
          if (lastEventKind !== null && lastEventKind !== 'delta') streamedText += '\n\n'
          streamedText += event.text
          emit({ type: 'delta', content: event.text })
        } else if (event.kind === 'tool-start') {
          const digest = digestAgentArgs(event.args)
          pendingCalls.set(event.toolCallId, { name: event.toolName, argsDigest: digest })
          emit({ type: 'tool-start', toolName: event.toolName, toolCallId: event.toolCallId, argsDigest: digest })
        } else if (event.kind === 'tool-end') {
          const pending = pendingCalls.get(event.toolCallId)
          pendingCalls.delete(event.toolCallId)
          toolCalls.push({ name: event.toolName, ok: event.ok, toolCallId: event.toolCallId, argsDigest: pending?.argsDigest })
          emit({ type: 'tool-end', toolName: event.toolName, toolCallId: event.toolCallId, ok: event.ok })
        }
        // kind==='step'（续跑提示）无聊天 UI 映射，忽略
        lastEventKind = event.kind
      },
      runtimeContext: () => ({
        dialogId: params.dialogId,
        sessionKey: scopeId,
        turnRefs: refs,
        turnModel: params.modelPreference,
      }),
      modelPreference: () => params.modelPreference,
    },
    {
      trajectoryPort: deps.trajectoryPort,
      sessionStore: deps.sessions,
      flywheel: safeFlywheel(),
      onEntry: deps.onTrajectoryEntry,
    },
  )

  try {
    const result = await kit.runTurn({ input: params.content }, { signal: params.signal })

    let content = streamedText
    if (result.stopReason === 'max_steps' || result.stopReason === 'stagnant') {
      content += `\n\n[系统] 本轮达到步数/进展护栏（${result.stopReason}）而停止，可继续追问让助手接着做。`
    } else if (result.stopReason === 'error') {
      logger.error(`[system-agent] 轮次失败 dialog=${params.dialogId}: ${result.error}`)
      if (!content) {
        // 无任何输出的失败轮：错误文案落库（防空气泡），metadata 照落（refs 不丢——
        // run_workflow 可能已真实启动），错误事件收尾
        await deps.messages
          .updateContent(aiMessage.id, `[系统] 本轮执行失败：${result.error ?? '未知错误'}。`)
          .catch(() => undefined)
        await deps.messages
          .updateMetadata(aiMessage.id, { agent: { toolCalls, refs: [...refs] } })
          .catch(() => undefined)
        deps.emit({ type: 'error', messageId: aiMessage.id, dialogId: params.dialogId, error: result.error ?? 'Agent 执行失败' })
        return { success: false, error: result.error ?? 'Agent 执行失败', stopReason: result.stopReason, toolCalls, refs }
      }
      content += `\n\n[系统] 本轮中途失败：${result.error ?? '未知错误'}（以上为失败前的部分输出）。`
      deps.emit({ type: 'error', messageId: aiMessage.id, dialogId: params.dialogId, error: result.error ?? 'Agent 执行失败' })
    }

    const metadata: MessageMetadata = { agent: { toolCalls, refs: [...refs] } }
    await deps.messages.updateContent(aiMessage.id, content)
    await deps.messages.updateMetadata(aiMessage.id, metadata)
    if (params.userMessageId && (result.usage.promptTokens || result.usage.completionTokens)) {
      await deps.messages.updateTokensUsed(aiMessage.id, result.usage.completionTokens)
      await deps.messages.updateTokensUsed(params.userMessageId, result.usage.promptTokens)
    }
    deps.emit({
      type: 'done',
      messageId: aiMessage.id,
      dialogId: params.dialogId,
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.promptTokens + result.usage.completionTokens,
      },
      ...(result.stopReason === 'aborted' ? { interrupted: true } : {}),
    })
    logger.info(
      `[system-agent] 轮次完成 dialog=${params.dialogId} stop=${result.stopReason} steps=${result.iterations} tools=${toolCalls.length} refs=${refs.length}`,
    )
    return { success: true, stopReason: result.stopReason, toolCalls, refs }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`[system-agent] 轮次异常 dialog=${params.dialogId}`, error)
    // 异常路径同样落 metadata（对抗 review P2：refs/toolCalls 可能已收集、已推流）
    await deps.messages
      .updateMetadata(aiMessage.id, { agent: { toolCalls, refs: [...refs] } })
      .catch(() => undefined)
    if (streamedText) {
      await deps.messages.updateContent(aiMessage.id, `${streamedText}\n\n[系统] 本轮中途异常：${message}`).catch(() => undefined)
    }
    deps.emit({ type: 'error', messageId: aiMessage.id, dialogId: params.dialogId, error: message })
    return { success: false, error: message, toolCalls, refs }
  }
}

/** 在途 agent 运行（chat:stop 复用同一中止语义） */
const activeAgentStreams = new Map<string, AbortController>()

/** 会话存储单例（懒建；同一 dataSource） */
let sessionStore: DbAgentSessionStore | null = null
function getSessionStore(): DbAgentSessionStore {
  if (!sessionStore) {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    sessionStore = new DbAgentSessionStore({ dataSource: db.dataSource })
  }
  return sessionStore
}

export class SystemAgentChatService {
  /**
   * Agent 模式发消息（ChatService 检测 dialog.agentEnabled 后分流到这里）。
   * 返回值与 ChatService.sendMessage 同形。
   */
  static async sendMessage(request: SendMessageRequest): Promise<{ success: boolean; error?: string }> {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.dialogs || !dbManager.messages) {
      return { success: false, error: '数据库未初始化' }
    }
    const dialog: Dialog | null = await dbManager.dialogs.getById(request.dialogId)
    if (!dialog) return { success: false, error: '对话不存在' }

    // 同对话互斥（对抗 review P1）：交叠双轮会 last-writer-wins 覆盖 session 历史
    // （整轮对话从模型记忆消失）并互踩在途 controller；UI 的 disabled 挡不住
    // 「停止后立即重发」窗口与 Web 直调
    if (activeAgentStreams.has(request.dialogId)) {
      return { success: false, error: '当前对话的上一轮 Agent 任务仍在执行中，请等待完成或先停止' }
    }

    // Agent 模式附件显式拒绝（对抗 review P1）：附件不会进入模型上下文——
    // 静默丢弃等于"盲聊"，宁可报错（多模态接入后续里程碑）
    if (request.attachments && request.attachments.length > 0) {
      return { success: false, error: 'Agent 模式暂不支持附件，请移除附件后发送' }
    }

    // harness 就位检查（未装配=工具白名单为空，明确报错而非静默裸聊）
    let registry: AgentToolRegistry
    let trajectoryPort: TrajectoryAppendPort | null
    let resolveModel: AgentChatTurnDeps['resolveModel']
    try {
      const harness = getAgentLoopHarness()
      registry = harness.registry
      trajectoryPort = harness.trajectoryRepo ?? null
      resolveModel = harness.resolveModel
    } catch (e) {
      return { success: false, error: `Agent 运行时未装配：${e instanceof Error ? e.message : String(e)}` }
    }

    const userMessage = await dbManager.messages.create({
      dialogId: request.dialogId,
      role: 'user',
      content: request.content,
    })

    const abortController = new AbortController()
    activeAgentStreams.set(request.dialogId, abortController)

    try {
      // 记忆装配已收敛 HostKit 内置（36 号）：runAgentChatTurn 经 kit memory 配置
      // （L0 系统能力行 + L1 用户级召回），并统一 memory_assembly 留痕
      const result = await runAgentChatTurn(
        {
          messages: dbManager.messages,
          sessions: getSessionStore(),
          trajectoryPort,
          registry,
          resolveModel,
          // 平台预算（agent:budget）：步数与写类工具频控可由设置页调整（2026-09-13）
          settings: dbManager.settings ?? null,
          emit: (event) => getEventEmitter().emit('chat:stream', event),
          onTrajectoryEntry: (scopeKey, entry) => {
            try {
              getEventEmitter().emit('ac:trajectory', { scopeKey, entry: slimTrajectoryForBroadcast(entry) })
            } catch { /* 广播失败不影响主链路 */ }
          },
        },
        {
          dialogId: request.dialogId,
          content: request.content,
          systemPrompt: buildSystemPrompt(dialog.systemPrompt),
          modelPreference: {
            providerConfigId: request.providerConfigId || dialog.providerConfigId,
            modelId: request.modelId || dialog.modelId,
          },
          signal: abortController.signal,
          userMessageId: userMessage.id,
        },
      )
      // RunRegistry 登记/结算由 kit 接管（36 号）——工作台徽标/停止语义不变
      return result
    } finally {
      // 身份校验删除（对抗 review P1：交叠轮曾会误删后一轮的 controller）
      if (activeAgentStreams.get(request.dialogId) === abortController) {
        activeAgentStreams.delete(request.dialogId)
      }
    }
  }

  /** 停止在途 agent 运行（chat:stop 与普通对话同一入口语义）。
   *  只 abort 不删 Map：结算（finally 身份校验删除）前保持互斥占位——
   *  「停止→立即重发」的旧轮补偿 saveState 与新轮 loadState 曾有 last-writer-wins
   *  踩踏窗口（总收口 B-P2-1）。 */
  static stopStream(dialogId: string): boolean {
    const controller = activeAgentStreams.get(dialogId)
    if (controller) {
      controller.abort()
      return true
    }
    return false
  }
}
