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
import type { ModelMessage } from 'ai'
import type { LanguageModel } from 'ai'
import { createLogger } from '@core/utils/logger'
import type {
  AgentHost,
  AgentLoopState,
  AgentStreamEvent,
} from '@core/platform/agent-runtime/types'
import { LoopRunner, initState } from '@core/platform/agent-runtime/runtime/loop'
import { DbAgentSessionStore } from '@core/platform/agent-runtime/memory/session-store'
import { TrajectorySink } from '@core/platform/agent-runtime/trajectory/sink'
import type { TrajectoryAppendPort } from '@core/platform/agent-runtime/trajectory/sink'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import {
  SYSTEM_AGENT_WHITELIST,
  type SystemAgentTurnRef,
} from '@core/platform/workflow/tools/system-agent-tools'
import type { AgentMessageMeta } from '@shared/types'

const logger = createLogger('SystemAgentChat')

/** 定义 id（轨迹/审计/会话定位用） */
export const SYSTEM_AGENT_DEFINITION_ID = 'system-chat-agent'
/** 每轮最大步数（与任务执行器同量级；多轮对话靠用户消息分轮，不靠大 maxSteps） */
export const SYSTEM_AGENT_MAX_STEPS = 12
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

/** 会话 id 约定（session-store 头注：{definitionId}:{scopeId}） */
export function agentSessionId(dialogId: string): string {
  return `${SYSTEM_AGENT_DEFINITION_ID}:dialog:${dialogId}`
}

/**
 * 会话历史清洗（对抗 review P1：模型流中途失败可把「悬空 tool-call」持久化，
 * 下一轮直发 provider 将 400 且永续；Anthropic 系还要求消息严格交替）。
 * ① 丢弃没有对应 tool-result 的 assistant tool-call 段（全空则丢整条）；
 * ② 合并连续 user 消息（错误轮空历史会形成 [user, user]）。
 */
export function sanitizeSessionHistory(messages: ModelMessage[]): ModelMessage[] {
  const resultIds = new Set<string>()
  for (const m of messages) {
    if (m.role !== 'tool' || !Array.isArray(m.content)) continue
    for (const p of m.content as Array<{ type?: string; toolCallId?: string }>) {
      if (p?.type === 'tool-result' && p.toolCallId) resultIds.add(p.toolCallId)
    }
  }
  const cleaned: ModelMessage[] = []
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const parts = (m.content as Array<{ type?: string; toolCallId?: string }>).filter(
        (p) => p?.type !== 'tool-call' || resultIds.has(p.toolCallId ?? ''),
      )
      if (parts.length === 0) continue
      cleaned.push(parts.length === (m.content as unknown[]).length ? m : ({ ...m, content: parts } as ModelMessage))
      continue
    }
    cleaned.push(m)
  }
  const merged: ModelMessage[] = []
  for (const m of cleaned) {
    const prev = merged[merged.length - 1]
    if (m.role === 'user' && prev?.role === 'user' && typeof prev.content === 'string' && typeof m.content === 'string') {
      merged[merged.length - 1] = { role: 'user', content: `${prev.content}\n\n${m.content}` }
      continue
    }
    merged.push(m)
  }
  return merged
}

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

/** 一轮对话的可注入端口（单测全 fake；生产由 sendMessage 装配） */
export interface AgentChatTurnDeps {
  messages: AgentTurnMessagePort
  sessions: AgentTurnSessionPort
  trajectoryPort: TrajectoryAppendPort | null
  registry: AgentToolRegistry
  resolveModel: (opts?: { providerConfigId?: string; modelId?: string }) => Promise<LanguageModel>
  emit: (event: StreamEvent) => void
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
  const defs = deps.registry.buildToolDefs(SYSTEM_AGENT_WHITELIST.map((tool) => ({ tool })))
  if (!defs['discover_capabilities']) {
    return { success: false, error: '系统 Agent 工具集未注册（workflow-boot 装配失败），Agent 模式不可用', toolCalls: [], refs: [] }
  }

  const scopeId = `dialog:${params.dialogId}`
  const sessionId = agentSessionId(params.dialogId)
  const sink = new TrajectorySink(deps.trajectoryPort, { scope: 'session', scopeKey: scopeId })

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

  const host: AgentHost = {
    signal: params.signal,
    loadState: async (): Promise<AgentLoopState | null> => {
      const history = await deps.sessions.load(sessionId)
      if (!history || history.length === 0) return null // 首轮：initState 以 input 播种
      const state = initState(
        {
          definitionId: SYSTEM_AGENT_DEFINITION_ID,
          scopeId,
          input: params.content,
          systemPrompt: params.systemPrompt,
          tools: defs,
          maxSteps: SYSTEM_AGENT_MAX_STEPS,
        },
        Date.now(),
      )
      // 多轮续聊：既有历史（清洗悬空 tool-call/连续 user）+ 本轮用户消息
      state.messages = [...sanitizeSessionHistory(history), { role: 'user', content: params.content } as ModelMessage]
      return state
    },
    saveState: async (state) => {
      await deps.sessions.save(sessionId, state.messages)
      await sink.flush()
    },
    suspend: () => Promise.reject(new Error('聊天 Agent 模式白名单不含需审批工具')),
    emitTrajectory: (entry) => sink.append(entry),
    emitStream: (event: AgentStreamEvent) => {
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
  }

  try {
    const result = await new LoopRunner({ resolveModel: deps.resolveModel }).run(
      {
        definitionId: SYSTEM_AGENT_DEFINITION_ID,
        scopeId,
        input: params.content,
        systemPrompt: params.systemPrompt,
        tools: defs,
        maxSteps: SYSTEM_AGENT_MAX_STEPS,
        modelPreference: params.modelPreference,
        // turnModel：invoke_skill 等工具内模型与聊天页所选模型一致（对抗 review P2：
        // 无参 resolveModel 会落到全局默认 provider）；turnRefs 供工具收集引用卡片
        runtimeContext: { dialogId: params.dialogId, turnRefs: refs, turnModel: params.modelPreference },
      },
      host,
    )

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
  } finally {
    await sink.flush().catch(() => undefined)
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
      return await runAgentChatTurn(
        {
          messages: dbManager.messages,
          sessions: getSessionStore(),
          trajectoryPort,
          registry,
          resolveModel,
          emit: (event) => getEventEmitter().emit('chat:stream', event),
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
    } finally {
      // 身份校验删除（对抗 review P1：交叠轮曾会误删后一轮的 controller）
      if (activeAgentStreams.get(request.dialogId) === abortController) {
        activeAgentStreams.delete(request.dialogId)
      }
    }
  }

  /** 停止在途 agent 运行（chat:stop 与普通对话同一入口语义） */
  static stopStream(dialogId: string): boolean {
    const controller = activeAgentStreams.get(dialogId)
    if (controller) {
      controller.abort()
      activeAgentStreams.delete(dialogId)
      return true
    }
    return false
  }
}
