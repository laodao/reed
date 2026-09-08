/**
 * 故事研讨室会话服务——主编宿主（v2.1 M2）
 * @module core/packs/longwriting/story-room/room-session
 *
 * 主编（Editor）= HostKit 宿主 `story-room-editor`，零工具（研讨期不产生
 * 结构化动作，纯 chat 轮；结构化只发生在整理器/账本）。装配脊柱（轨迹/
 * 记忆双通道/ContextManager/RunRegistry/缓存断点）由 HostKit 内置。
 *
 * 与旧 lw-agent 的差异（设计文档 §0/§10）：
 * - 每轮就是一次自然语言对话——没有决策 JSON、没有动作执行；
 * - 业务权威历史 = lw_design_messages（conversationId=room:{projectId}），
 *   最近 40 条原生 messages 注入（非文本重放）；
 * - 滚动摘要业务级实现：未摘要轮数超阈值时把最老一段压缩为前情提要，
 *   存 wizard_state.room，经 snapshot 注入（账本记结论，摘要记过程）；
 * - 轮后静默共识提取（fail-soft，见 room-ledger）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import { createHostKit, formatStopNote } from '@core/platform/agent-runtime'
import type { ModelMessage } from 'ai'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { getMemoryFlywheel } from '@core/platform/workflow/workflow-boot'
import { DbAgentSessionStore } from '@core/platform/agent-runtime/memory/session-store'
import { computeProductionState } from '@core/platform/services/longwriting/agent/agent-deps'
import { stateToSummary } from '@core/platform/services/longwriting/agent/agent-context'
import { installGraphKnowledgeProvider } from '@core/platform/services/longwriting/graph/graph-knowledge-provider'
import type { RoomEvent, RoomMessageView, RoomPhaseId, RoomStateView } from '@shared/types/story-room.types'
import { generateRoomText } from './room-llm'
import { emitRoomEvent } from './room-events'
import { getRoomState, patchRoomState } from './room-state'
import { ledgerSnapshotText, silentExtractLedger } from './room-ledger'
import { buildStrategySection, getPhaseDef, loadQuestionBank } from './room-phases'

const logger = createLogger('StoryRoomSession')

export const ROOM_EDITOR_DEFINITION_ID = 'story-room-editor'
export const ROOM_CONVERSATION_PREFIX = 'room:'
/** 每轮注入的历史条数（原生 messages 窗口） */
export const ROOM_HISTORY_LIMIT = 40
/** 历史单条注入截断（上限保护；实际生效窗口由 ContextManager 水位决定，评审 P2-12） */
const HISTORY_CONTENT_MAX = 1200
/** 未摘要轮数达到该值触发滚动摘要 */
export const SUMMARY_THRESHOLD_TURNS = 20
/** 每次滚动摘要压缩的轮数 */
export const SUMMARY_BATCH_TURNS = 10
/** 前情提要总长上限（超出从头丢弃最老分段） */
const SUMMARY_MAX_CHARS = 6000

/** 主编系统提示词：人格 + 纪律 + 阶段策略 + 题材问题库（跨轮稳定段） */
export function editorSystemPrompt(phase: RoomPhaseId, contentTarget: 'novel' | 'script', questionBank: string[]): string {
  return `你是「主编」——故事研讨期内用户唯一的对话者，一位有立场、有判断力的资深故事主编。你正在与作者多轮研讨，逐步收敛故事。

行为准则：
1. 对话是你的全部输出：只说自然语言（markdown），研讨期绝不产出表单、JSON 或结构化字段。
2. 先问后提：信息不足时每轮最多问 1-2 个尖锐的具体问题，禁止问卷式提问。
3. 给选项不给清单：方向不明时给 2-3 个带取舍说明的选项。
4. 有记忆、会翻旧账：引用上下文中的共识账本——被否决的方向不要再推荐；讨论中的共识被违背时指出来。
5. 敢反驳：用户提出俗套或自相矛盾的设定时直接指出，并给替代方案。
6. 每轮发言收在"推进研讨"上：要么抛出下一步该定的问题，要么建议整理成卡片/推进阶段。

${buildStrategySection(phase, contentTarget)}

【题材问题库】（按需取用，不要一次抛出）
${questionBank.map((q) => `- ${q}`).join('\n')}`
}

/** 当轮快照：阶段 + 内容目标 + 故事圣经摘要 + 账本 + 前情提要（注入轮次上下文块） */
export function buildEditorSnapshot(state: {
  phase: RoomPhaseId
  contentTarget: 'novel' | 'script'
  turnNo: number
}, bibleSummary: string, ledgerText: string, summary: string): string {
  const parts: string[] = []
  parts.push(`【研讨进度】第 ${state.turnNo} 轮 · 阶段：${getPhaseDef(state.phase).label} · 内容目标：${state.contentTarget === 'script' ? '短剧剧本' : '长篇小说'}`)
  if (bibleSummary) parts.push(`【故事圣经】\n${bibleSummary}`)
  if (ledgerText) parts.push(ledgerText)
  if (summary) parts.push(`【前情提要】（更早轮次的讨论过程，结论以账本为准）\n${summary}`)
  return parts.join('\n\n')
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
    logger.warn('[story-room] 会话存储初始化失败（观测面降级）', e)
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

/** 圣经上下文（fail-soft）：摘要 + 题材（问题库选择用，评审 P1-2） */
async function safeBibleContext(db: any, projectId: string): Promise<{ summary: string; storyType?: string }> {
  try {
    const ps = await computeProductionState(db, projectId)
    return { summary: stateToSummary(ps), storyType: ps.overview?.storyType ?? undefined }
  } catch (e) {
    logger.warn(`[story-room] 圣经摘要读取失败（降级为空）project=${projectId}`, e)
    return { summary: '' }
  }
}

function parseMeta(metadata?: string): { turnNo?: number; phase?: RoomPhaseId } {
  if (!metadata) return {}
  try {
    return JSON.parse(metadata) || {}
  } catch {
    return {}
  }
}

export interface RoomSendResult {
  conversationId: string
  assistantMessage: RoomMessageView
  ledgerUpdated: boolean
  stopReason: string
}

export class StoryRoomSessionService {
  private static instance: StoryRoomSessionService | null = null

  private readonly busy = new Map<string, AbortController>()

  static getInstance(db?: any): StoryRoomSessionService {
    if (!StoryRoomSessionService.instance) {
      StoryRoomSessionService.instance = new StoryRoomSessionService(db)
    }
    return StoryRoomSessionService.instance
  }

  constructor(
    private db?: any,
    /** 测试注入（原始流水观测面）；生产不传 */
    private testDeps?: { rawTranscript?: { appendBatch(rows: unknown[]): Promise<void>; maxSeq(conversationId: string): Promise<number> } },
  ) {}

  private manager(): any {
    return this.db ?? getCoreDatabaseManager()
  }

  cancel(projectId: string): void {
    this.busy.get(projectId)?.abort(new Error('用户取消'))
  }

  async getHistory(projectId: string): Promise<{ messages: RoomMessageView[]; state: RoomStateView }> {
    const m = this.manager()
    const conversationId = `${ROOM_CONVERSATION_PREFIX}${projectId}`
    const rows = await m.lwDesignMessages.getByConversationId(conversationId)
    const state = await getRoomState(m, projectId)
    return {
      messages: rows.map((r: any) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        timestamp: r.timestamp,
        metadata: r.metadata,
      })),
      state: this.toStateView(projectId, state),
    }
  }

  async getState(projectId: string): Promise<RoomStateView> {
    const state = await getRoomState(this.manager(), projectId)
    return this.toStateView(projectId, state)
  }

  /** 手动切阶段（非阻塞，随时跳转/回退；门建议流程在阶段门整编里） */
  async setPhase(projectId: string, phase: RoomPhaseId): Promise<RoomStateView> {
    const next = await patchRoomState(this.manager(), projectId, { phase })
    emitRoomEvent(projectId, { type: 'phase:changed', phase } as RoomEvent)
    return this.toStateView(projectId, next)
  }

  private toStateView(projectId: string, state: any): RoomStateView {
    return {
      projectId,
      phase: state.phase,
      contentTarget: state.contentTarget,
      ledger: state.ledger,
      summary: state.summary,
      turnNo: state.turnNo,
      pendingCards: state.pendingCards,
    }
  }

  async sendMessage(
    projectId: string,
    message: string,
    opts: { providerConfigId?: string; modelId?: string } = {},
  ): Promise<RoomSendResult> {
    if (this.busy.has(projectId)) {
      throw new Error('主编还在回复上一条，请等待完成或先取消')
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
  ): Promise<RoomSendResult> {
    const m = this.manager()
    const conversationId = `${ROOM_CONVERSATION_PREFIX}${projectId}`
    const scopeId = `story-room:${projectId}`
    const harness = getAgentLoopHarness()

    // 1. 房间状态（阶段/账本/摘要/轮号）
    const roomState = await getRoomState(m, projectId)
    const turnNo = roomState.turnNo + 1

    // 2. 历史（保存用户消息前取——当前消息由 initState 播种，不重复）
    const history = await m.lwDesignMessages.getByConversationId(conversationId)
    const seeded: ModelMessage[] = history
      .filter((h: { role: string }) => h.role === 'user' || h.role === 'assistant')
      .slice(-ROOM_HISTORY_LIMIT)
      .map((h: { role: string; content: unknown }) => ({
        role: h.role as 'user' | 'assistant',
        content: String(h.content ?? '').slice(0, HISTORY_CONTENT_MAX),
      } as ModelMessage))

    // 3. 保存用户消息（UI 权威历史；metadata 带轮次/阶段供 provenance）
    const meta = JSON.stringify({ turnNo, phase: roomState.phase })
    await m.lwDesignMessages.add(conversationId, {
      role: 'user', content: message, timestamp: Date.now(), metadata: meta,
    }, { projectId })

    // 4. 上下文组装：圣经摘要 + 账本 + 前情提要 + 题材问题库（按项目题材选）
    const bible = await safeBibleContext(m, projectId)
    const questionBank = await loadQuestionBank(m, bible.storyType)
    const snapshot = buildEditorSnapshot(
      { phase: roomState.phase, contentTarget: roomState.contentTarget, turnNo },
      bible.summary,
      ledgerSnapshotText(roomState.ledger),
      roomState.summary,
    )
    const systemPrompt = editorSystemPrompt(roomState.phase, roomState.contentTarget, questionBank)

    // 5. 图谱结构化提供方（通道A，幂等）
    try {
      installGraphKnowledgeProvider({})
    } catch { /* 注册失败仅降级 */ }

    // 7. 跑轮（delta 累积 + 转发事件通道）
    let allText = ''
    // assistant 是否已落库——落库后发生的异常只发 error 事件，不再补道歉气泡（评审 P2-5）
    let assistantSaved = false
    const kit = createHostKit<{ input: string }>(
      {
        definitionId: ROOM_EDITOR_DEFINITION_ID,
        scopeKey: () => scopeId,
        tools: () => ({}),
        resolveModel: (o) => harness.resolveModel({ providerConfigId: o?.providerConfigId, modelId: o?.modelId }),
        systemPrompt: () => systemPrompt,
        snapshot: () => snapshot,
        seededHistory: () => seeded,
        maxSteps: 2,
        memory: {
          scope: () => ({ bizModule: 'longwriting', projectId }),
          recallText: () => `${message}\n${snapshot}`,
          topicsText: () => message,
        },
        onStream: (_t, event) => {
          if (event.kind === 'delta' && event.text) {
            allText += event.text
            emitRoomEvent(projectId, { type: 'message:delta', text: event.text })
          }
        },
        modelPreference: () => ({ providerConfigId: opts.providerConfigId, modelId: opts.modelId }),
      },
      {
        trajectoryPort: harness.trajectoryRepo ?? null,
        sessionStore: getSessionStore(),
        flywheel: safeFlywheel(),
        rawTranscript: (this.testDeps?.rawTranscript ?? null) as never,
      },
    )

    try {
      const result = await kit.runTurn({ input: message }, { signal: controller.signal })

      // 终态分流（对齐 LW 宿主：max_steps/stagnant/aborted/error 加尾注）
      let content = allText || (result.output ?? '')
      if (result.stopReason === 'max_steps' || result.stopReason === 'stagnant') {
        content += formatStopNote(result.stopReason)
      } else if (result.stopReason === 'aborted') {
        content = (content ? content : '') + formatStopNote('aborted')
      } else if (result.stopReason === 'error') {
        content = content || formatStopNote('error', result.error)
      }

      // 8. assistant 落库 + message:done（主编发言对齐轮次/阶段 metadata）
      const saved = await m.lwDesignMessages.add(conversationId, {
        role: 'assistant', content, timestamp: Date.now(), metadata: meta,
      }, { projectId })
      assistantSaved = true

      const assistantView: RoomMessageView = {
        id: saved.id, role: 'assistant', content: saved.content, timestamp: saved.timestamp, metadata: meta,
      }
      emitRoomEvent(projectId, { type: 'message:done', message: assistantView })

      // 9. 轮后静默任务（fail-soft：失败只留日志，不影响本轮结果）
      const nextTurnNo = turnNo
      const ledger = await silentExtractLedger(m, projectId, {
        userText: message,
        assistantText: content,
        turnNo: nextTurnNo,
        llmOpts: opts,
      }, controller.signal)
      let ledgerUpdated = false
      if (ledger) {
        emitRoomEvent(projectId, { type: 'ledger:update', ledger })
        ledgerUpdated = true
      }
      await this.maybeRollingSummary(m, projectId, { ...roomState, turnNo: nextTurnNo }, history, opts, controller.signal)

      await patchRoomState(m, projectId, { turnNo: nextTurnNo })

      logger.info(`[story-room] 轮次完成 project=${projectId} turn=${nextTurnNo} stop=${result.stopReason} chars=${content.length}`)
      return {
        conversationId,
        assistantMessage: assistantView,
        ledgerUpdated,
        stopReason: result.stopReason,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error(`[story-room] 轮次异常 project=${projectId}: ${msg}`)
      if (assistantSaved) {
        // 主回复已落库：只发错误事件（前端 toast），不再追加道歉气泡
        emitRoomEvent(projectId, { type: 'error', error: msg })
        return {
          conversationId,
          assistantMessage: { role: 'assistant', content: allText, timestamp: Date.now(), metadata: meta },
          ledgerUpdated: false,
          stopReason: 'error',
        }
      }
      // 兜底 assistant（前端气泡必有终态，用户消息不悬空）
      try {
        const saved = await m.lwDesignMessages.add(conversationId, {
          role: 'assistant', content: `抱歉，本轮研讨遇到问题：${msg}`, timestamp: Date.now(), metadata: meta,
        }, { projectId })
        emitRoomEvent(projectId, {
          type: 'message:done',
          message: { id: saved.id, role: 'assistant', content: saved.content, timestamp: saved.timestamp, metadata: meta },
        })
      } catch { /* 兜底失败仅留日志 */ }
      emitRoomEvent(projectId, { type: 'error', error: msg })
      throw e
    }
  }

  /**
   * 滚动摘要：未摘要轮数 ≥ 阈值时把最老一段（BATCH 轮）压缩为前情提要增量。
   * fail-soft：任何失败保持现状（下轮重试）。
   */
  async maybeRollingSummary(
    m: any,
    projectId: string,
    state: { summary: string; summarizedTurn: number; turnNo: number },
    history: any[],
    opts: { providerConfigId?: string; modelId?: string },
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      if (state.turnNo - state.summarizedTurn < SUMMARY_THRESHOLD_TURNS) return
      const from = state.summarizedTurn + 1
      const to = state.summarizedTurn + SUMMARY_BATCH_TURNS
      const block = history
        .filter((h) => {
          const t = parseMeta(h.metadata).turnNo ?? 0
          return t >= from && t <= to
        })
      if (block.length === 0) {
        // 该区间无消息（异常/老数据）：仅推进水位，避免死循环
        await patchRoomState(m, projectId, { summarizedTurn: to })
        return
      }
      const transcript = block
        .map((h) => `${h.role === 'user' ? '用户' : '主编'}：${String(h.content ?? '').slice(0, 600)}`)
        .join('\n')
      const digest = await generateRoomText(
        'rolling-summary',
        {
          system: '你是研讨记录员。把这段创作研讨对话压缩为「前情提要」增量：讨论了什么方向、提出了哪些方案、定了什么、否了什么。只记过程要点，300 字以内，条目式。',
          user: `【既有前情提要】\n${state.summary || '（空）'}\n\n【第 ${from}~${to} 轮对话】\n${transcript}`,
          maxTokens: 800,
        },
        opts,
        signal,
      )
      const section = `\n--- 第 ${from}~${to} 轮 ---\n${digest.trim()}`
      let summary = (state.summary + section).trim()
      // 总长超限：从最老分段开始丢
      if (summary.length > SUMMARY_MAX_CHARS) {
        const sections = summary.split('\n--- ')
        while (sections.length > 1 && sections.join('\n--- ').length > SUMMARY_MAX_CHARS) sections.shift()
        summary = sections.join('\n--- ').replace(/^\n--- /, '')
      }
      await patchRoomState(m, projectId, { summary, summarizedTurn: to })
      logger.info(`[story-room] 滚动摘要 第${from}~${to}轮 project=${projectId}`)
    } catch (e) {
      logger.warn(`[story-room] 滚动摘要失败（下轮重试）project=${projectId}`, e)
    }
  }
}
