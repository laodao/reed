/**
 * Agent 运行时门面（harness 对外唯一入口，独立宿主装配）
 * @module core/platform/agent-runtime/runtime/agent-service
 *
 * 契约：tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md §1（AgentRuntime）。
 * 装配：LoopRunner（循环）+ ApprovalCoordinator（提案卡）+ EventBridge（双路径事件）
 * + AgentSessionStore（历史落盘）——四件在此收口，业务只见本门面。
 *
 * 关键语义：
 * - per-(definitionId,scopeId) 互斥：busy 时按 opts.mode（reject/queue/interrupt，
 *   24 号 steer）；queue 在当前轮边界合流为下一轮输入（FIFO）
 * - 会话 LRU 驻留（缺省 32 / TTL 30min；busy/有订阅/有挂起卡/有排队者不驱逐）
 * - ALS 红线：sendMessage 入口同步捕获 userId，整轮 runWithUserAsync 包裹
 *   （排队轮从 Promise 续链发起，ALS 已丢——用排队时刻的捕获值）
 * - 审批恢复：init 时扫 store 残留挂起行按「忽略」哨兵清理（12 号；进程重启后
 *   挂起 Promise 已不存在，新轮从落盘历史重放）
 * - 事件顺序（23 号 §0-7）：同 scope 按发生序经 dispatch 单点分发（订阅者 → 桥），
 *   跨重连恢复靠 getHistory + listPendingApprovals 重建，不靠事件重放
 */

import { createLogger } from '@core/utils/logger'
import { getCurrentUserId, runWithUser, runWithUserAsync } from '@core/context/user-context'
import { TrajectorySink } from '../trajectory/sink'
import type { LanguageModel, ModelMessage } from 'ai'
import type {
  AgentEvent,
  AgentHistoryMessage,
  AgentLoopMode,
  AgentSendResult,
  ApprovalDecision,
  PendingApproval,
  SendMessageOptions,
} from '@shared/types/agent.types'
import type {
  AgentDefinition,
  AgentHost,
  AgentLoopState,
  AgentTask,
  AgentStreamEvent,
  TrajectoryEntry,
} from '../types'
import { LoopRunner, initState } from './loop'
import {
  ApprovalCoordinator,
  InMemoryApprovalStore,
  type ApprovalStore,
} from './approval'
import { EventBridge, type PlatformBusPort } from './event-bridge'
import type { AgentSessionStore } from '../memory/session-store'
import { AgentMessageTooLargeError, MAX_MESSAGE_BYTES } from '../memory/session-store'
import { truncateTranscriptContent } from '../memory/transcript-store'
import { isTurnContextMessage } from '../context/turn-context'
import { createGetToolResultTool } from '../tools/artifact-lookup'
import type { ResolveModelOptions } from '../provider/provider-adapter'
import { ContextManager } from '../context/context-manager'
import { DEFAULT_SUMMARY_PROMPT } from '../runtime/vendor/compaction'

const logger = createLogger('AgentRuntime')

// ==================== 类型化错误（23 号 §9） ====================

/** 同 scope 已有轮在跑（mode='reject' 缺省路径） */
export class AgentBusyError extends Error {
  readonly code = 'AGENT_BUSY'
  readonly scopeKey: string
  constructor(scopeKey: string) {
    super(`该会话已有任务进行中（${scopeKey}）。可稍后重试或使用 mode='queue'/'interrupt'。`)
    this.name = 'AgentBusyError'
    this.scopeKey = scopeKey
  }
}

/** 注册定义 id 冲突 */
export class AgentDefinitionConflictError extends Error {
  readonly code = 'AGENT_DEFINITION_CONFLICT'
  constructor(definitionId: string) {
    super(`Agent 定义已注册：${definitionId}（重复注册请先 unregister 或升 version）`)
    this.name = 'AgentDefinitionConflictError'
  }
}

/** 引用未注册的定义 */
export class AgentDefinitionNotFoundError extends Error {
  readonly code = 'AGENT_DEFINITION_NOT_FOUND'
  constructor(definitionId: string) {
    super(`Agent 定义未注册：${definitionId}`)
    this.name = 'AgentDefinitionNotFoundError'
  }
}

/** getAgentRuntime 未初始化 */
export class AgentRuntimeNotInitializedError extends Error {
  readonly code = 'AGENT_RUNTIME_NOT_INITIALIZED'
  constructor() {
    super('Agent 运行时未初始化——请先 await initAgentRuntime(deps)')
    this.name = 'AgentRuntimeNotInitializedError'
  }
}

/** 会话被重置（排队中的消息被拒绝） */
export class AgentSessionResetError extends Error {
  readonly code = 'AGENT_SESSION_RESET'
  constructor(scopeKey: string) {
    super(`会话已重置，排队消息被拒绝（${scopeKey}）`)
    this.name = 'AgentSessionResetError'
  }
}

/** 跨租户访问同一 scope（平台层不依赖 scopeId 全局唯一，属主不匹配 fail-fast） */
export class AgentScopeOwnerMismatchError extends Error {
  readonly code = 'AGENT_SCOPE_OWNER_MISMATCH'
  constructor(scopeKey: string) {
    super(`会话 ${scopeKey} 属于其他用户（scopeId 需在定义内保证租户内唯一）`)
    this.name = 'AgentScopeOwnerMismatchError'
  }
}

/** 运行时已关停（排队中的消息被拒绝；区别于 busy——不可重试） */
export class AgentRuntimeDisposedError extends Error {
  readonly code = 'AGENT_RUNTIME_DISPOSED'
  constructor(scopeKey: string) {
    super(`Agent 运行时已关停，排队消息被拒绝（${scopeKey}）`)
    this.name = 'AgentRuntimeDisposedError'
  }
}

// ==================== 门面契约 ====================

export interface AgentRuntime {
  registerDefinition(def: AgentDefinition): void
  unregisterDefinition(definitionId: string): void
  listDefinitions(): Array<{ id: string; version: number; toolCount: number; loopMode: AgentLoopMode }>

  sendMessage(definitionId: string, scopeId: string, message: string, opts?: SendMessageOptions): Promise<AgentSendResult>
  cancel(definitionId: string, scopeId: string): boolean
  getHistory(definitionId: string, scopeId: string, limit?: number): Promise<AgentHistoryMessage[]>
  resetSession(definitionId: string, scopeId: string): Promise<void>

  decideApproval(approvalId: string, decision: ApprovalDecision): boolean
  listPendingApprovals(definitionId: string, scopeId: string): PendingApproval[]

  subscribe(definitionId: string, scopeId: string, cb: (e: AgentEvent) => void): () => void

  health(): { activeSessions: number; busyScopes: string[]; pendingApprovals: number }
}

export interface AgentRuntimeDeps {
  resolveModel: (opts?: ResolveModelOptions) => Promise<LanguageModel>
  sessionStore: AgentSessionStore
  /** 直推出口（IEventEmitter.emit 包装）；缺省=无直推（仅订阅者 + 总线） */
  eventEmitter?: { emit(channel: string, payload: unknown): void }
  /** 平台总线；null/缺省=仅直推（23 号 §7 双路径） */
  eventBus?: PlatformBusPort | null
  /** 挂起审批落库（重启恢复）；缺省内存 */
  approvalStore?: ApprovalStore
  clock?: () => number
  /** 审批超时扫描周期 ms（缺省 30s；0=禁用） */
  sweeperIntervalMs?: number
  /** 会话 LRU 容量 / 驻留 TTL（缺省 32 / 30min） */
  sessionCacheCapacity?: number
  sessionTtlMs?: number
  /** 轨迹落库端口（25 号 M2 批1；缺省=不落库——观测面降级不阻断会话） */
  trajectoryRepo?: import('@core/platform/agent-runtime/trajectory/sink').TrajectoryAppendPort | null
  /** 原始流水端口（39 号 P0-2；缺省=不落流水） */
  transcriptRepo?: import('@core/platform/agent-runtime/memory/transcript-store').RawTranscriptPort | null
  /** 工具产物归档（39 号 P1-1；缺省=不归档、不注入 get_tool_result） */
  artifacts?: import('@core/platform/agent-runtime/tools/artifacts').ToolArtifactPort | null
}

interface SteerQueueItem {
  message: string
  opts?: SendMessageOptions
  /** 排队时刻捕获的租户（续链发起时 ALS 已丢） */
  userId: string | null
  resolve: (r: AgentSendResult) => void
  reject: (e: unknown) => void
}

/** 排队上限（mode=queue 失控客户端防线；超限 fail-fast） */
/** resetting 让步上限（复位中的宏任务等待轮数；防标记泄漏时空转烧 CPU） */
const RESET_YIELD_LIMIT = 10_000

export const MAX_STEER_QUEUE = 8

/** 关停时等待在途轮 settle 的时限（ms）——防僵尸轮补偿写覆盖新实例历史 */
const DISPOSE_SETTLE_TIMEOUT_MS = 3_000

/** 动作摘要 brief 裁剪上限（观测面常量） */
const ACTION_BRIEF_MAX_CHARS = 120

/** 驻留会话（LRU 条目） */
interface SessionEntry {
  scopeKey: string
  definitionId: string
  scopeId: string
  /** 首个触达者捕获的租户（跨租户同 scope fail-fast；Electron 单用户为 null） */
  ownerUserId: string | null
  busy: boolean
  controller: AbortController | null
  currentTurn: Promise<AgentSendResult> | null
  steerQueue: SteerQueueItem[]
  subs: Set<(e: AgentEvent) => void>
  coordinator: ApprovalCoordinator
  lastUsedAt: number
  /** resetSession 进行中：轮结束不再续链排队者（由 reset 统一拒绝） */
  resetting?: boolean
}

// ==================== 实现 ====================

export class AgentRuntimeImpl implements AgentRuntime {
  private readonly definitions = new Map<string, AgentDefinition>()
  private readonly entries = new Map<string, SessionEntry>() // scopeKey → entry
  /** 桥缓存（definitionId → { def, bridge }）：注销后保留给在途轮终态；
   *  重新注册同名定义（def 引用变化）时重建——通道命名随新定义 */
  private readonly bridges = new Map<string, { def: AgentDefinition | undefined; bridge: EventBridge }>()
  private readonly deps: Required<Pick<AgentRuntimeDeps, 'resolveModel' | 'sessionStore' | 'sweeperIntervalMs' | 'sessionCacheCapacity' | 'sessionTtlMs'>> & {
    eventEmitter: { emit(channel: string, payload: unknown): void } | null
    eventBus: PlatformBusPort | null
    approvalStore: ApprovalStore
    clock: () => number
    trajectoryRepo: import('@core/platform/agent-runtime/trajectory/sink').TrajectoryAppendPort | null
    transcriptRepo: import('@core/platform/agent-runtime/memory/transcript-store').RawTranscriptPort | null
    artifacts: import('@core/platform/agent-runtime/tools/artifacts').ToolArtifactPort | null
  }
  private sweeper: ReturnType<typeof setInterval> | null = null

  constructor(deps: AgentRuntimeDeps) {
    this.deps = {
      resolveModel: deps.resolveModel,
      sessionStore: deps.sessionStore,
      eventEmitter: deps.eventEmitter ?? null,
      eventBus: deps.eventBus ?? null,
      approvalStore: deps.approvalStore ?? new InMemoryApprovalStore(),
      clock: deps.clock ?? (() => Date.now()),
      sweeperIntervalMs: deps.sweeperIntervalMs ?? 30_000,
      sessionCacheCapacity: deps.sessionCacheCapacity ?? 32,
      sessionTtlMs: deps.sessionTtlMs ?? 30 * 60_000,
      trajectoryRepo: deps.trajectoryRepo ?? null,
      transcriptRepo: deps.transcriptRepo ?? null,
      artifacts: deps.artifacts ?? null,
    }
    void this.recoverOrphanApprovals()
    if (this.deps.sweeperIntervalMs > 0) {
      this.sweeper = setInterval(() => this.onSweepTick(), this.deps.sweeperIntervalMs)
      this.sweeper.unref?.()
    }
  }

  /**
   * 关停：中断全部轮并**限时等待在途轮 settle**（深度 review P2-5：不等待则僵尸轮
   * 的补偿 saveState 可全量覆盖新实例已落盘的历史），拒绝排队者、清订阅与定时器、
   * 冲刷总线链。限时（3s）兜底防死等；超时仍有残余轮则 error 留痕。
   */
  async dispose(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper)
    this.sweeper = null
    const inFlight: Array<Promise<unknown>> = []
    for (const entry of this.entries.values()) {
      entry.controller?.abort()
      if (entry.currentTurn) inFlight.push(entry.currentTurn.catch(() => undefined))
      for (const item of entry.steerQueue) item.reject(new AgentRuntimeDisposedError(entry.scopeKey))
      entry.steerQueue = []
      entry.subs.clear()
    }
    let allSettledDone = false
    const allSettled = Promise.allSettled(inFlight).then((r) => {
      allSettledDone = true
      return r
    })
    await Promise.race([
      allSettled,
      new Promise<void>((res) => {
        const t = setTimeout(res, DISPOSE_SETTLE_TIMEOUT_MS)
        t.unref?.()
      }),
    ])
    // 超时仍有残余轮：error 留痕（docblock 承诺曾未兑现——总收口 review P3）
    if (!allSettledDone) {
      logger.error(`[agent-runtime] dispose 超时后仍有 ${inFlight.length} 个在途轮未收敛（条目已清除，其后续落库/事件将被丢弃）`)
    }
    for (const { bridge } of this.bridges.values()) {
      void bridge.flush().catch((e) => logger.warn('[agent-runtime] 关停冲刷总线链失败', e))
    }
    this.entries.clear()
    this.definitions.clear()
    this.bridges.clear()
  }

  // —— 定义注册 ——

  registerDefinition(def: AgentDefinition): void {
    if (this.definitions.has(def.id)) throw new AgentDefinitionConflictError(def.id)
    this.definitions.set(def.id, def)
    logger.info(`[agent-runtime] 注册定义 id=${def.id} v${def.version} tools=${Object.keys(def.tools).length}`)
  }

  unregisterDefinition(definitionId: string): void {
    if (!this.definitions.has(definitionId)) return
    logger.info(`[agent-runtime] 注销定义 id=${definitionId}（挂起轮取消）`)
    for (const entry of this.entries.values()) {
      if (entry.definitionId !== definitionId) continue
      entry.controller?.abort() // 挂起轮先取消
      for (const item of entry.steerQueue) item.reject(new AgentDefinitionNotFoundError(definitionId))
      entry.steerQueue = []
    }
    this.definitions.delete(definitionId)
    // 桥保留（review P2）：在途轮的终态事件仍走业务通道（§7b 终态必达）；
    // bridgeFor 已缓存实例不依赖 definitions 在册——仅 dispose 时统一清理
  }

  listDefinitions(): Array<{ id: string; version: number; toolCount: number; loopMode: AgentLoopMode }> {
    return [...this.definitions.values()].map((d) => ({
      id: d.id,
      version: d.version,
      toolCount: Object.keys(d.tools).length,
      loopMode: d.loopMode,
    }))
  }

  // —— 一轮对话 ——

  async sendMessage(
    definitionId: string,
    scopeId: string,
    message: string,
    opts?: SendMessageOptions,
  ): Promise<AgentSendResult> {
    const def = this.definitions.get(definitionId)
    if (!def) throw new AgentDefinitionNotFoundError(definitionId)
    // ALS 红线：入口同步捕获（排队/续链后 ALS 已丢）
    const userId = getCurrentUserId()
    // 入口体量门（深度 review P2：原实现 10MB 消息可直穿 LLM+驻留，落库才炸）——
    // 与单条落库上限同一限额，fail-fast 拒收
    if (Buffer.byteLength(message, 'utf8') > MAX_MESSAGE_BYTES) {
      throw new AgentMessageTooLargeError(`${definitionId}:${scopeId}`, 0, 'user', Buffer.byteLength(message, 'utf8'))
    }

    // 可重入互斥：interrupt 等待期间状态可能被续链/并发 interrupt/复位改变，
    // 每轮循环重取条目并复查（批 4 review P1/P2：恢复后不复查 = 双轮并发/复活已重置会话）
    let interruptedOnce = false
    let resetYields = 0
    for (;;) {
      const entry = this.touchEntry(def, scopeId) // 复位后条目被删 → 此处重建
      if (!entry.busy && !entry.resetting) {
        return this.runTurn(entry, def, message, opts, userId)
      }
      const mode = opts?.mode ?? 'reject'
      if (mode === 'reject') throw new AgentBusyError(entry.scopeKey)
      if (entry.resetting) {
        // 复位进行中（先删库再删条目——深度 review P2-4）：宏任务让步等待，
        // store.delete 完成条目被删后重取到干净条目。让步次数封顶（防御：
        // resetting 标记若因异常泄漏，曾退化为每秒百万次空转打满单核）
        if (++resetYields > RESET_YIELD_LIMIT) {
          throw new AgentBusyError(entry.scopeKey)
        }
        await new Promise<void>((res) => setImmediate(res))
        continue
      }
      if (mode === 'interrupt' && !interruptedOnce) {
        interruptedOnce = true // 只取消一次；后续与 queue 同序公平等待
        this.cancel(definitionId, scopeId)
        if (entry.currentTurn) await entry.currentTurn.catch(() => undefined)
        continue
      }
      // queue（含 interrupt 的等待段）：排队至轮边界，逐条整轮执行（FIFO）
      if (entry.steerQueue.length >= MAX_STEER_QUEUE) {
        throw new AgentBusyError(entry.scopeKey) // 排队已满：fail-fast 防失控堆积
      }
      return new Promise<AgentSendResult>((resolve, reject) => {
        entry.steerQueue.push({ message, opts, userId, resolve, reject })
      })
    }
  }

  cancel(definitionId: string, scopeId: string): boolean {
    const entry = this.requireOwnedEntry(definitionId, scopeId)
    if (!entry || !entry.controller || !entry.busy) return false
    logger.info(`[agent-runtime] 取消轮 def=${definitionId} scope=${scopeId}`)
    entry.controller.abort()
    entry.coordinator.cancelScope(entry.scopeKey) // 审批挂起同步拒绝（signal 监听为双保险）
    return true
  }

  async getHistory(definitionId: string, scopeId: string, limit?: number): Promise<AgentHistoryMessage[]> {
    // 驻留条目存在时校验属主（深度 review P2：InMemory 降级存储下跨租户可读全量对话；
    // DB 存储由 ALS scoped WHERE 隔离，双保险）
    this.requireOwnedEntry(definitionId, scopeId)
    const messages = (await this.deps.sessionStore.load(scopeKeyOf(definitionId, scopeId))) ?? []
    const out: AgentHistoryMessage[] = []
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      if (m.role !== 'user' && m.role !== 'assistant') continue
      if (isTurnContextMessage(m)) continue // 轮次上下文块是系统注入状态（39 号 P0-1），不进前端历史
      const text = messageText(m)
      if (!text) continue // 纯工具调用载体消息（无正文）不进前端历史
      out.push({
        role: m.role,
        content: text,
        // 全量替换存储模型下的近似值（最近一次落盘时刻）；顺序以 seq 为准
        timestamp: this.deps.clock(),
      })
    }
    return typeof limit === 'number' && limit > 0 ? out.slice(-limit) : out
  }

  async resetSession(definitionId: string, scopeId: string): Promise<void> {
    const key = scopeKeyOf(definitionId, scopeId)
    const entry = this.requireOwnedEntry(definitionId, scopeId)
    if (!entry) {
      await this.deps.sessionStore.delete(key)
      this.deleteTrajectories(`session:${key}`) // fire-and-forget（观测面级联）
      logger.info(`[agent-runtime] 会话重置 def=${definitionId} scope=${scopeId}`)
      return
    }
    entry.resetting = true // 拦截续链与新轮（sendMessage 等 store.delete 完成后再开）
    try {
      if (entry.busy) {
        this.cancel(definitionId, scopeId)
        if (entry.currentTurn) await entry.currentTurn.catch(() => undefined)
      }
      // 先删库再删条目（深度 review P2-4：原顺序在 delete 在途窗口内新轮可读到
      // 复活旧历史，随后又被 delete 抹掉新史——双重失效）
      await this.deps.sessionStore.delete(key)
      this.deleteTrajectories(`session:${key}`)
    } catch (e) {
      // 删库失败：回滚拦截标记（总收口 review P1——曾无回滚，resetting 永真，
      // 该会话 queue/interrupt 消息陷入 setImmediate 无限自旋打满单核直到进程重启）
      entry.resetting = false
      throw e
    }
    for (const item of entry.steerQueue) item.reject(new AgentSessionResetError(key))
    entry.steerQueue = []
    entry.coordinator.cancelScope(key)
    // 丢弃驻留条目（连同 Amendment 会话缓存）；订阅闭包变 no-op，重订阅会重建
    this.entries.delete(key)
    logger.info(`[agent-runtime] 会话重置 def=${definitionId} scope=${scopeId}`)
  }

  // —— 提案卡 ——

  decideApproval(approvalId: string, decision: ApprovalDecision): boolean {
    for (const entry of this.entries.values()) {
      if (entry.coordinator.listPending(entry.scopeKey).some((p) => p.approvalId === approvalId)) {
        // 属主校验（深度 review P0：跨租户批准他人审批卡 = 提权写类工具）
        if (entry.ownerUserId !== getCurrentUserId()) throw new AgentScopeOwnerMismatchError(entry.scopeKey)
        return entry.coordinator.decide(approvalId, decision)
      }
    }
    return false
  }

  listPendingApprovals(definitionId: string, scopeId: string): PendingApproval[] {
    const key = scopeKeyOf(definitionId, scopeId)
    const entry = this.requireOwnedEntry(definitionId, scopeId)
    return entry?.coordinator.listPending(key) ?? []
  }

  // —— 事件 ——

  subscribe(definitionId: string, scopeId: string, cb: (e: AgentEvent) => void): () => void {
    const def = this.definitions.get(definitionId)
    if (!def) throw new AgentDefinitionNotFoundError(definitionId)
    const entry = this.touchEntry(def, scopeId)
    entry.subs.add(cb)
    return () => entry.subs.delete(cb)
  }

  // —— 运维 ——

  health(): { activeSessions: number; busyScopes: string[]; pendingApprovals: number } {
    const busyScopes: string[] = []
    let pending = 0
    for (const entry of this.entries.values()) {
      if (entry.busy) busyScopes.push(entry.scopeKey)
      pending += entry.coordinator.pendingCount
    }
    return { activeSessions: this.entries.size, busyScopes, pendingApprovals: pending }
  }

  // ==================== 内部：轮执行 ====================

  private async runTurn(
    entry: SessionEntry,
    def: AgentDefinition,
    message: string,
    opts: SendMessageOptions | undefined,
    userId: string | null,
  ): Promise<AgentSendResult> {
    entry.busy = true
    entry.lastUsedAt = this.deps.clock()
    const controller = new AbortController()
    entry.controller = controller
    const clock = this.deps.clock
    const summaryEventId = `reply-${entry.scopeId}-${clock()}`

    const exec = async (): Promise<AgentSendResult> => {
      const systemPrompt =
        typeof def.systemPrompt === 'function' ? await def.systemPrompt(entry.scopeId) : def.systemPrompt
      const snapshot = await def.buildStateSnapshot(entry.scopeId)
      const modelPreference = {
        providerConfigId: opts?.providerConfigId ?? def.modelPreference?.providerConfigId,
        modelId: opts?.modelId ?? def.modelPreference?.modelId,
      }
      const task: AgentTask = {
        definitionId: def.id,
        scopeId: entry.scopeId,
        input: message,
        systemPrompt,
        // 产物回查工具（39 号 P1-1）：归档装配时自动注入（占位指引才有对应能力）
        tools: this.deps.artifacts
          ? ({ ...def.tools, get_tool_result: createGetToolResultTool(this.deps.artifacts) } as typeof def.tools)
          : def.tools,
        maxSteps: def.maxSteps ?? (def.loopMode === 'react' ? 6 : 2),
        modelPreference,
        snapshot,
      }
      const host = new IndependentHost(
        {
          store: this.deps.sessionStore,
          clock: this.deps.clock,
          dispatch: (e, ev) => this.dispatch(e, ev),
          trajectoryRepo: this.deps.trajectoryRepo ?? null,
          transcriptRepo: this.deps.transcriptRepo,
        },
        entry,
        def,
        controller,
        task,
        summaryEventId,
      )
      this.dispatch(entry, { type: 'stage', stage: 'deciding' })

      // 上下文管理（definition.contextWindowTokens 声明即启用——23 号 §5 / 12 号 R6）：
      // 装配/压缩守恒归 ContextManager；摘要经 resolveModel 动态 generateText；
      // compaction 事件走门面单点分发（bridge 仅对 phase=done 发总线）
      // 上下文管理总是装配（批 6 review P2-3：悬空哨兵修复是正确性语义，不随压缩
      // 门控）；窗口未声明 = 0 → 仅装配模式（maybeCompact 直通 null）
      const summarize = async (conversationText: string, signal?: AbortSignal): Promise<string> => {
        const { generateText } = await import('ai')
        const model = await this.deps.resolveModel(modelPreference) // 与本轮主模型一致（review P3）
        const result = await generateText({
          model,
          system: DEFAULT_SUMMARY_PROMPT, // vendor 常量单一事实源（review P2-4，勿内联复本）
          messages: [{ role: 'user', content: conversationText }],
          abortSignal: signal,
        })
        return result.text
      }
      const context = new ContextManager({
        contextWindowTokens: def.contextWindowTokens ?? 0,
        summarize,
        emit: (e) => this.dispatch(entry, e),
      })

      // 循环（审批回调：requiresApproval 工具 → 本会话协调器）
      const runner = new LoopRunner({
        resolveModel: this.deps.resolveModel,
        requestApproval: (tool, input, call) =>
          entry.coordinator.request(entry.scopeKey, tool, input, call.signal),
        context,
        ...(this.deps.artifacts ? { artifacts: this.deps.artifacts } : {}),
      })
      const result = await runner.run(task, host).finally(() => host.flushTrajectories())
      // 只算一次：二次调用若抛错会在 reply:done 已发后再发 error（双终态，review P3）
      const suggestions = result.stopReason === 'error' ? [] : def.buildSuggestions?.(snapshot) ?? []

      // 终态必达三选一（23 号 §7b）：error 轮发 error 不发 reply:done
      if (result.stopReason === 'error') {
        this.dispatch(entry, { type: 'error', error: result.error ?? '未知错误' })
      } else {
        this.dispatch(entry, { type: 'reply:done', suggestions })
        // onTurnEnd 钩子（fire-and-forget，失败仅告警；Promise.resolve 兜底同步实现）
        if (def.onTurnEnd) {
          void Promise.resolve(
            def.onTurnEnd({
              scopeId: entry.scopeId,
              userMessage: message,
              reply: result.output,
              toolCalls: host.actionSummaries.map((a) => ({ name: a.type, input: a.params, ok: a.ok })),
            }),
          ).catch((e) => logger.warn(`[agent-runtime] onTurnEnd 失败 def=${def.id}`, e))
        }
      }

      return {
        conversationId: entry.scopeKey,
        reply: result.output,
        actionSummaries: host.actionSummaries,
        suggestions,
        usage: {
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          totalTokens: result.usage.promptTokens + result.usage.completionTokens,
        },
        stopReason: result.stopReason,
      }
    }

    const onSettled = (): void => {
      entry.busy = false
      entry.controller = null
      entry.currentTurn = null
      entry.lastUsedAt = clock()
      this.evictExpiredEntries()
      // queue 续链：reset 进行中不续链（由 resetSession 统一拒绝排队者）
      const next = entry.resetting ? undefined : entry.steerQueue.shift()
      if (next) {
        void this.runTurn(entry, def, next.message, next.opts, next.userId).then(next.resolve, next.reject)
      }
    }

    // 轮级运维日志（开始/结束各一条；失败 error 级另记）
    const turnStart = clock()
    logger.info(`[agent-runtime] 轮开始 def=${def.id} scope=${entry.scopeId}`)

    // 异常（provider 未配置/快照失败等）：发 error 终态事件后原样上抛。
    // rejection handler 运行在 .then 挂载点上下文（ALS 已丢）——dispatch 用捕获租户
    // 同步包裹（review P2：queue 续链下错误分发曾落在错误租户上下文）
    const emitError = (e: unknown): void => {
      const dispatch = (): void =>
        this.dispatch(entry, { type: 'error', error: e instanceof Error ? e.message : String(e) })
      if (userId) runWithUser(userId, dispatch)
      else dispatch()
    }
    const turn = (userId ? runWithUserAsync(userId, exec) : exec()).then(
      (r) => {
        logger.info(
          `[agent-runtime] 轮完成 def=${def.id} scope=${entry.scopeId} stop=${r.stopReason}` +
            ` ${r.usage?.totalTokens ?? 0}tok ${clock() - turnStart}ms`
        )
        onSettled()
        return r
      },
      (e) => {
        logger.error(
          `[agent-runtime] 轮异常 def=${def.id} scope=${entry.scopeId}`,
          e instanceof Error ? e.message : e,
        )
        emitError(e)
        onSettled()
        throw e
      },
    )
    entry.currentTurn = turn
    return turn
  }

  // ==================== 内部：会话/事件/清理 ====================

  /** 轨迹级联删除（fire-and-forget；scoped 过滤租户 + 失败只 warn——review A1：
   *  resetSession 空条目分支无属主校验，raw 删会跨租户清他人轨迹，改 scoped 版） */
  private deleteTrajectories(scopeKey: string): void {
    void this.deps.trajectoryRepo?.deleteByScope?.(scopeKey).catch((e: unknown) =>
      logger.warn(`[agent-runtime] 会话轨迹清理失败（${scopeKey}）`, e),
    )
    // 原始流水/产物归档随会话重置级联（39 号 P0-2/P1-1；scoped 过滤同上）
    void this.deps.transcriptRepo?.deleteByConversation?.(scopeKey).catch((e: unknown) =>
      logger.warn(`[agent-runtime] 会话原始流水清理失败（${scopeKey}）`, e),
    )
    void this.deps.artifacts?.deleteByScope(scopeKey).catch((e: unknown) =>
      logger.warn(`[agent-runtime] 工具产物清理失败（${scopeKey}）`, e),
    )
  }

  /**
   * 取条目并校验属主（跨租户读写统一收口——深度 review P0/P1：cancel/resetSession/
   * decideApproval/listPendingApprovals/getHistory 原绕过 touchEntry 直取条目）。
   * 条目不存在返回 null（无内存态可保护；数据面由存储层 ALS 隔离）。
   */
  private requireOwnedEntry(definitionId: string, scopeId: string): SessionEntry | null {
    const entry: SessionEntry | undefined = this.entries.get(scopeKeyOf(definitionId, scopeId))
    if (entry && entry.ownerUserId !== getCurrentUserId()) {
      throw new AgentScopeOwnerMismatchError(entry.scopeKey)
    }
    return entry ?? null
  }

  private touchEntry(def: AgentDefinition, scopeId: string): SessionEntry {
    const key = scopeKeyOf(def.id, scopeId)
    let entry: SessionEntry | null = this.requireOwnedEntry(def.id, scopeId)
    if (!entry) {
      // 先驱逐再插入：新条目尚未在册，不会被误驱逐（否则本轮刚建的会话即被清出，
      // health/cancel 找不到它——批 4 单测实证）
      this.evictIdleEntries()
      entry = {
        scopeKey: key,
        definitionId: def.id,
        scopeId,
        ownerUserId: getCurrentUserId(),
        busy: false,
        controller: null,
        currentTurn: null,
        steerQueue: [],
        subs: new Set(),
        coordinator: new ApprovalCoordinator({
          emit: (e) => this.dispatch(this.entries.get(key)!, e),
          store: this.deps.approvalStore,
          clock: this.deps.clock,
          timeoutMs: def.approvalTimeoutMs,
        }),
        lastUsedAt: this.deps.clock(),
      }
      this.entries.set(key, entry)
    }
    entry.lastUsedAt = this.deps.clock()
    return entry
  }

  /** 事件单点分发：订阅者（同步）→ 桥（直推+总线）——同 scope 发生序 */
  private dispatch(entry: SessionEntry, event: AgentEvent): void {
    for (const cb of entry.subs) {
      try {
        cb(event)
      } catch (e) {
        logger.warn('[agent-runtime] 订阅者回调异常（不影响分发）', e)
      }
    }
    this.bridgeFor(entry.definitionId).emit(entry.scopeId, event)
  }

  private bridgeFor(definitionId: string): EventBridge {
    const def = this.definitions.get(definitionId)
    let cached = this.bridges.get(definitionId)
    // 注销后（def=undefined）保留旧桥给在途轮终态；仅在"新定义注册"（引用变化）时重建
    if (!cached || (def !== undefined && cached.def !== def)) {
      cached = {
        def,
        bridge: new EventBridge({
          emitDirect: (channel, event) => this.deps.eventEmitter?.emit(channel, event),
          definitionId,
          eventChannel: (scopeId) => def?.eventChannel(scopeId) ?? `agent:${definitionId}:${scopeId}`,
          streamChannel: def?.streamChannel,
          bus: this.deps.eventBus,
        }),
      }
      this.bridges.set(definitionId, cached)
    }
    return cached.bridge
  }

  private onSweepTick(): void {
    // setInterval 回调内抛错会击穿进程——防御性包裹 + error 留痕（吞异常纪律）
    try {
      for (const entry of [...this.entries.values()]) {
        entry.coordinator.sweep()
      }
      this.evictExpiredEntries()
    } catch (e) {
      logger.error('[agent-runtime] 审批超时扫描异常（不影响后续 tick）', e)
    }
  }

  /** 容量驱逐：为新会话腾位（touchEntry 插入前调用；本条目尚未在册不会被误驱逐） */
  private evictIdleEntries(): void {
    for (const [key, entry] of [...this.entries]) {
      if (this.entries.size < this.deps.sessionCacheCapacity) break
      if (this.isEntryPinned(entry)) continue
      this.entries.delete(key)
    }
  }

  /** TTL 驱逐：空闲超时会话（sweeper 周期 + 轮结束时） */
  private evictExpiredEntries(): void {
    const now = this.deps.clock()
    for (const [key, entry] of [...this.entries]) {
      if (now - entry.lastUsedAt <= this.deps.sessionTtlMs) continue
      if (this.isEntryPinned(entry)) continue
      this.entries.delete(key)
    }
  }

  private isEntryPinned(entry: SessionEntry): boolean {
    return (
      entry.busy ||
      entry.steerQueue.length > 0 ||
      entry.subs.size > 0 ||
      entry.coordinator.pendingCount > 0 ||
      entry.resetting === true
    )
  }

  /** 重启恢复：残留挂起行按「忽略」哨兵清理（12 号；Promise 已随进程消亡）。
   *  只清构造时刻之前的行（fire-and-forget 窗口内新建的挂起卡不清——review P3）。 */
  private async recoverOrphanApprovals(): Promise<void> {
    const store = this.deps.approvalStore as ApprovalStore & { listAll?: () => Promise<PendingApproval[]> }
    if (!store.listAll) return
    const bootAt = this.deps.clock()
    try {
      const orphans = (await store.listAll()).filter((p) => p.createdAt <= bootAt)
      for (const p of orphans) await store.clear(p.approvalId)
      if (orphans.length > 0) {
        logger.info(`[agent-runtime] 重启恢复：清理 ${orphans.length} 条残留挂起审批（忽略哨兵）`)
      }
    } catch (e) {
      logger.warn('[agent-runtime] 残留审批清理失败（不影响启动）', e)
    }
  }
}

// ==================== 独立宿主（AgentHost 实现；循环只认识契约） ====================

/** 独立宿主的注入面（不触达门面内部） */
interface HostPorts {
  store: AgentSessionStore
  clock: () => number
  dispatch: (entry: SessionEntry, event: AgentEvent) => void
  trajectoryRepo?: import('@core/platform/agent-runtime/trajectory/sink').TrajectoryAppendPort | null
  transcriptRepo?: import('@core/platform/agent-runtime/memory/transcript-store').RawTranscriptPort | null
}

class IndependentHost implements AgentHost {
  /** 轨迹两列（tool_call 步末发、tool_result 执行点发；同序 1:1，读取时拉链配对） */
  private readonly callRows: Array<{ type: string; params: unknown; brief: string }> = []
  private readonly resultRows: Array<{ ok: boolean; brief: string }> = []
  private replyStarted = false
  /** 轨迹落库缓冲（25 号 M2 批1；flush 点 = saveState 搭车 + turn 终态） */
  private readonly trajectorySink: TrajectorySink

  /** 本轮动作摘要（AgentSendResult.actionSummaries；轮结束后读取） */
  get actionSummaries(): AgentSendResult['actionSummaries'] {
    const n = Math.min(this.callRows.length, this.resultRows.length)
    const out: AgentSendResult['actionSummaries'] = []
    for (let i = 0; i < n; i++) {
      out.push({
        type: this.callRows[i].type,
        params: this.callRows[i].params,
        ok: this.resultRows[i].ok,
        brief: this.resultRows[i].brief || this.callRows[i].brief,
      })
    }
    return out
  }

  /** 原始流水（39 号 P0-2）：宿主自产消息 pending（本轮 user 输入）+ seq 续接 */
  private hostPendingAppended: ModelMessage[] = []
  private transcriptSeq: number | null = null

  constructor(
    private readonly ports: HostPorts,
    private readonly entry: SessionEntry,
    private readonly def: AgentDefinition,
    private readonly controller: AbortController,
    private readonly task: AgentTask,
    private readonly summaryEventId: string,
  ) {
    this.trajectorySink = new TrajectorySink(ports.trajectoryRepo ?? null, {
      scope: 'session',
      scopeKey: `session:${entry.scopeKey}`,
    })
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  /** 历史重放：落盘消息 + 本轮新输入（12 号：中断/重启后新轮从落盘历史重建） */
  async loadState(): Promise<AgentLoopState | null> {
    const history = await this.ports.store.load(this.entry.scopeKey)
    if (!history || history.length === 0) return null
    const userMsg = { role: 'user', content: this.task.input } as ModelMessage
    const state = initState(this.task, this.ports.clock())
    state.messages = [...history, userMsg]
    this.hostPendingAppended = [userMsg] // 原始流水（39 号 P0-2）：本轮 user 输入由宿主上报
    return state
  }

  async saveState(state: AgentLoopState, meta?: { appended?: ModelMessage[] }): Promise<void> {
    await this.ports.store.save(this.entry.scopeKey, state.messages)
    // 原始流水增量（39 号 P0-2）：宿主 pending 在前、loop meta 在后——时间序。
    // 流水是审计安全网：失败只 warn，绝不外泄进循环。
    const appended = meta?.appended?.length ? [...this.hostPendingAppended, ...meta.appended] : this.hostPendingAppended
    this.hostPendingAppended = []
    if (appended.length > 0 && this.ports.transcriptRepo) {
      try {
        if (this.transcriptSeq === null) this.transcriptSeq = await this.ports.transcriptRepo.maxSeq(this.entry.scopeKey)
        const rows = appended.map((m) => {
          const role = typeof (m as { role?: unknown }).role === 'string' ? String((m as { role?: unknown }).role) : 'unknown'
          return {
            conversationId: this.entry.scopeKey,
            seq: this.transcriptSeq!++,
            role,
            content: truncateTranscriptContent(JSON.stringify(m)),
          }
        })
        await this.ports.transcriptRepo.appendBatch(rows)
      } catch (e) {
        logger.warn('[agent-runtime] 原始流水落库失败（观测面不外泄）', e)
      }
    }
    // flush 搭车（TrajectorySink.flush 不 throw）：步末存续点顺带落轨迹
    await this.trajectorySink.flush()
  }

  /** turn 终态/异常路径排空轨迹缓冲（观测面：不外泄 flush 失败） */
  flushTrajectories(): Promise<void> {
    return this.trajectorySink.flush()
  }

  /** 独立宿主无进程级挂起（审批经协调器进程内等待）；循环不应调到 */
  suspend(): Promise<never> {
    throw new Error('IndependentHost.suspend 不应被调用：审批经 ApprovalCoordinator 进程内等待（12 号 §6.2）')
  }

  emitTrajectory(entry: TrajectoryEntry): void {
    if (entry.kind === 'tool_call') {
      this.callRows.push({
        type: entry.name ?? 'unknown',
        params: entry.payload.args,
        brief: entry.name ?? '',
      })
    } else if (entry.kind === 'tool_result') {
      const denied = entry.payload.denied === true
      const failed = entry.payload.ok === false
      this.resultRows.push({
        ok: !denied && !failed,
        brief: denied ? '已拒绝' : failed ? String(entry.payload.error ?? '').slice(0, ACTION_BRIEF_MAX_CHARS) : '',
      })
    }
    this.trajectorySink.append(entry)
    logger.debug(`[agent-runtime] trajectory def=${this.def.id} kind=${entry.kind} name=${entry.name ?? ''}`)
  }

  emitStream(event: AgentStreamEvent): void {
    switch (event.kind) {
      case 'delta':
        if (!this.replyStarted) {
          this.replyStarted = true
          this.ports.dispatch(this.entry, { type: 'reply:start', summaryEventId: this.summaryEventId })
        }
        this.ports.dispatch(this.entry, { type: 'reply:content', summaryEventId: this.summaryEventId, delta: event.text })
        break
      case 'tool-start':
        this.ports.dispatch(this.entry, { type: 'stage', stage: 'acting' })
        this.ports.dispatch(this.entry, { type: 'action:start', actionType: event.toolName, label: event.toolName })
        break
      case 'tool-end':
        this.ports.dispatch(this.entry, {
          type: 'action:done',
          actionType: event.toolName,
          status: event.ok ? 'ok' : 'error',
          message: '',
        })
        break
      case 'step':
        this.ports.dispatch(this.entry, { type: 'stage', stage: 'deciding' })
        break
    }
  }
}

// ==================== 单例管理（23 号 §1：异步工厂幂等） ====================

let instance: AgentRuntime | null = null

export async function initAgentRuntime(deps: AgentRuntimeDeps): Promise<AgentRuntime> {
  if (instance) {
    logger.warn('[agent-runtime] initAgentRuntime 重复调用：返回既有实例（幂等）')
    return instance
  }
  instance = new AgentRuntimeImpl(deps)
  return instance
}

export function getAgentRuntime(): AgentRuntime {
  if (!instance) throw new AgentRuntimeNotInitializedError()
  return instance
}

export async function disposeAgentRuntime(): Promise<void> {
  if (instance && instance instanceof AgentRuntimeImpl) await instance.dispose()
  instance = null
}

// ==================== 工具函数 ====================

function scopeKeyOf(definitionId: string, scopeId: string): string {
  return `${definitionId}:${scopeId}`
}

/** 提取消息正文（字符串直取；parts 拼接 text 段——工具调用载体无正文返回 ''） */
function messageText(m: ModelMessage): string {
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) {
    return (m.content as Array<{ type?: string; text?: string }>)
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
  }
  return ''
}
