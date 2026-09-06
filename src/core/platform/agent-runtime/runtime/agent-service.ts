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
import type { ResolveModelOptions } from '../provider/provider-adapter'

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
export const MAX_STEER_QUEUE = 8

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
    }
    void this.recoverOrphanApprovals()
    if (this.deps.sweeperIntervalMs > 0) {
      this.sweeper = setInterval(() => this.onSweepTick(), this.deps.sweeperIntervalMs)
      this.sweeper.unref?.()
    }
  }

  /**
   * 关停（best-effort，review P3）：中断全部轮（abort 后轮经 signal 路径自行 settle，
   * 不在此 await）、拒绝排队者、清订阅与定时器、冲刷总线链。在途轮的终态事件
   * 可能无人接收——关停语义下接受（消费方随进程一同退出）。
   */
  dispose(): void {
    if (this.sweeper) clearInterval(this.sweeper)
    this.sweeper = null
    for (const entry of this.entries.values()) {
      entry.controller?.abort()
      for (const item of entry.steerQueue) item.reject(new AgentBusyError(entry.scopeKey))
      entry.steerQueue = []
      entry.subs.clear()
    }
    for (const { bridge } of this.bridges.values()) {
      void bridge.flush().catch(() => undefined) // best-effort：总线链排空不阻塞关停
    }
    this.entries.clear()
    this.definitions.clear()
    this.bridges.clear()
  }

  // —— 定义注册 ——

  registerDefinition(def: AgentDefinition): void {
    if (this.definitions.has(def.id)) throw new AgentDefinitionConflictError(def.id)
    this.definitions.set(def.id, def)
  }

  unregisterDefinition(definitionId: string): void {
    if (!this.definitions.has(definitionId)) return
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

    // 可重入互斥：interrupt 等待期间状态可能被续链/并发 interrupt/复位改变，
    // 每轮循环重取条目并复查（批 4 review P1/P2：恢复后不复查 = 双轮并发/复活已重置会话）
    let interruptedOnce = false
    for (;;) {
      const entry = this.touchEntry(def, scopeId) // 复位后条目被删 → 此处重建
      if (!entry.busy && !entry.resetting) {
        return this.runTurn(entry, def, message, opts, userId)
      }
      const mode = opts?.mode ?? 'reject'
      if (mode === 'reject' && !interruptedOnce) throw new AgentBusyError(entry.scopeKey)
      if (entry.resetting) {
        // 复位进行中：等当前轮 settle 后重试（条目会被删除重建）
        if (entry.currentTurn) await entry.currentTurn.catch(() => undefined)
        else await Promise.resolve()
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
    const entry = this.entries.get(scopeKeyOf(definitionId, scopeId))
    if (!entry || !entry.controller || !entry.busy) return false
    entry.controller.abort()
    entry.coordinator.cancelScope(entry.scopeKey) // 审批挂起同步拒绝（signal 监听为双保险）
    return true
  }

  async getHistory(definitionId: string, scopeId: string, limit?: number): Promise<AgentHistoryMessage[]> {
    const messages = (await this.deps.sessionStore.load(scopeKeyOf(definitionId, scopeId))) ?? []
    const out: AgentHistoryMessage[] = []
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      if (m.role !== 'user' && m.role !== 'assistant') continue
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
    const entry = this.entries.get(key)
    if (entry) {
      entry.resetting = true // 拦截续链：轮结束不再自动执行排队者
      if (entry.busy) {
        this.cancel(definitionId, scopeId)
        if (entry.currentTurn) await entry.currentTurn.catch(() => undefined)
      }
      for (const item of entry.steerQueue) item.reject(new AgentSessionResetError(key))
      entry.steerQueue = []
      entry.coordinator.cancelScope(key)
      // 丢弃驻留条目（连同 Amendment 会话缓存）；订阅闭包变 no-op，重订阅会重建
      this.entries.delete(key)
    }
    await this.deps.sessionStore.delete(key)
  }

  // —— 提案卡 ——

  decideApproval(approvalId: string, decision: ApprovalDecision): boolean {
    for (const entry of this.entries.values()) {
      if (entry.coordinator.listPending(entry.scopeKey).some((p) => p.approvalId === approvalId)) {
        return entry.coordinator.decide(approvalId, decision)
      }
    }
    return false
  }

  listPendingApprovals(definitionId: string, scopeId: string): PendingApproval[] {
    const key = scopeKeyOf(definitionId, scopeId)
    return this.entries.get(key)?.coordinator.listPending(key) ?? []
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
        tools: def.tools,
        maxSteps: def.maxSteps ?? (def.loopMode === 'react' ? 6 : 2),
        modelPreference,
        snapshot,
      }
      const host = new IndependentHost(
        { store: this.deps.sessionStore, clock: this.deps.clock, dispatch: (e, ev) => this.dispatch(e, ev) },
        entry,
        def,
        controller,
        task,
        summaryEventId,
      )
      this.dispatch(entry, { type: 'stage', stage: 'deciding' })

      // 循环（审批回调：requiresApproval 工具 → 本会话协调器）
      const runner = new LoopRunner({
        resolveModel: this.deps.resolveModel,
        requestApproval: (tool, input, call) =>
          entry.coordinator.request(entry.scopeKey, tool, input, call.signal),
      })
      const result = await runner.run(task, host)
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
        onSettled()
        return r
      },
      (e) => {
        emitError(e)
        onSettled()
        throw e
      },
    )
    entry.currentTurn = turn
    return turn
  }

  // ==================== 内部：会话/事件/清理 ====================

  private touchEntry(def: AgentDefinition, scopeId: string): SessionEntry {
    const key = scopeKeyOf(def.id, scopeId)
    let entry = this.entries.get(key)
    if (entry && entry.ownerUserId !== getCurrentUserId()) {
      // 平台层不依赖 scopeId 全局唯一：跨租户同 scope fail-fast
      //（否则互斥锁/审批卡/Amendment 缓存/事件订阅全部跨租户共享——提权面）
      throw new AgentScopeOwnerMismatchError(key)
    }
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
    for (const entry of [...this.entries.values()]) {
      entry.coordinator.sweep()
    }
    this.evictExpiredEntries()
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
}

class IndependentHost implements AgentHost {
  /** 轨迹两列（tool_call 步末发、tool_result 执行点发；同序 1:1，读取时拉链配对） */
  private readonly callRows: Array<{ type: string; params: unknown; brief: string }> = []
  private readonly resultRows: Array<{ ok: boolean; brief: string }> = []
  private replyStarted = false

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

  constructor(
    private readonly ports: HostPorts,
    private readonly entry: SessionEntry,
    private readonly def: AgentDefinition,
    private readonly controller: AbortController,
    private readonly task: AgentTask,
    private readonly summaryEventId: string,
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal
  }

  /** 历史重放：落盘消息 + 本轮新输入（12 号：中断/重启后新轮从落盘历史重建） */
  async loadState(): Promise<AgentLoopState | null> {
    const history = await this.ports.store.load(this.entry.scopeKey)
    if (!history || history.length === 0) return null
    const state = initState(this.task, this.ports.clock())
    state.messages = [...history, { role: 'user', content: this.task.input } as ModelMessage]
    return state
  }

  async saveState(state: AgentLoopState): Promise<void> {
    await this.ports.store.save(this.entry.scopeKey, state.messages)
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
        brief: denied ? '已拒绝' : failed ? String(entry.payload.error ?? '').slice(0, 120) : '',
      })
    }
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
  if (instance && instance instanceof AgentRuntimeImpl) instance.dispose()
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
