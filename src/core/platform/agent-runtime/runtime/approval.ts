/**
 * 审批协调器（提案卡的后端半边）
 * @module core/platform/agent-runtime/runtime/approval
 *
 * 契约：tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md §4（+ §4b 修订）。
 * 语义：22 号 §3-C2（安全默认拒绝）、12 号 §6.2（挂起语义）、24 号 §4b（Amendment 沉淀）。
 *
 * 行为：
 * - request()：发卡（approval:request 事件 + store 落库）→ 挂起 Promise，
 *   与 decide / 超时 / signal 中断三路竞速；同 scope 同时最多一张卡（内部断言）
 * - decide()：决定到达（approve / approve_with_edit / reject）→ resolve + 清库 + resolved 事件
 * - Amendment（24 号借鉴 codex）：approve 携带 scope:'session' 时，
 *   以「工具名+规范化入参」为缓存键，后续同类调用自动放行（免审批疲劳）
 * - 重启恢复：pendingApproval 落库（store 注入）；恢复侧扫出残留行按「忽略」哨兵处理（宿主/门面职责）
 */

import { randomUUID } from 'node:crypto'
import { createLogger } from '@core/utils/logger'
import { getCurrentUserId, runWithUser } from '@core/context/user-context'
import type {
  ApprovalDecision,
  PendingApproval,
  AgentEvent,
} from '@shared/types/agent.types'
import type { AgentToolDef } from '../types'

const logger = createLogger('AgentApproval')

export interface ApprovalCoordinatorDeps {
  /** 事件出口（经 event-bridge 双路径） */
  emit: (e: AgentEvent) => void
  /** 租户捕获（2026-09-06 修复）：超时/中止的 timer 回调不在 ALS 内——请求时刻捕获，回调时包裹 */
  getUserId?: () => string | null
  runWithUser?: (userId: string, fn: () => void) => void
  /** 挂起审批落库（重启恢复依据）；缺省内存实现（单测/无库场景） */
  store?: ApprovalStore
  clock?: () => number
  /** 每卡超时 ms（缺省 5 分钟；超时=拒绝） */
  timeoutMs?: number
  /** Amendment 会话级免批缓存容量（缺省 64；0=关闭 Amendment） */
  sessionCacheCapacity?: number
}

/** 挂起审批的持久化接口（恢复语义：boot 扫描残留 → 按忽略处理） */
export interface ApprovalStore {
  save(a: PendingApproval): Promise<void>
  clear(approvalId: string): Promise<void>
  listBySession(sessionId: string): Promise<PendingApproval[]>
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly rows = new Map<string, PendingApproval>()
  async save(a: PendingApproval): Promise<void> {
    this.rows.set(a.approvalId, a)
  }
  async clear(approvalId: string): Promise<void> {
    this.rows.delete(approvalId)
  }
  async listBySession(sessionId: string): Promise<PendingApproval[]> {
    return [...this.rows.values()].filter((r) => r.sessionId === sessionId)
  }
}

interface PendingEntry {
  info: PendingApproval
  resolve: (d: ApprovalDecision) => void
  timer: ReturnType<typeof setTimeout> | null
  onAbort: (() => void) | null
  /** 请求时刻的租户（timer/abort 回调内 ALS 已丢，Web 端无 uid 即静默丢） */
  userId: string | null
}

/** 规范化入参（缓存键用：键排序稳定序列化） */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
}

export function amendmentKey(toolName: string, input: unknown): string {
  return `${toolName}:${stableStringify(input)}`
}

/** 决定集由服务端下发（24 号 §4b：前端零硬编码按钮） */
export const AVAILABLE_DECISIONS = ['approve', 'approve_with_edit', 'reject'] as const

export class ApprovalCoordinator {
  private readonly deps: Required<Pick<ApprovalCoordinatorDeps, 'emit' | 'timeoutMs' | 'sessionCacheCapacity'>> & {
    store: ApprovalStore
    clock: () => number
  }
  private readonly pending = new Map<string, PendingEntry>() // approvalId → entry
  private readonly scopePending = new Map<string, Set<string>>() // scopeKey → approvalIds
  private readonly sessionCache = new Map<string, true>() // amendment 缓存（LRU）

  private readonly wrapUser: (userId: string | null, fn: () => void) => void
  private readonly getUserId: () => string | null

  constructor(deps: ApprovalCoordinatorDeps) {
    this.getUserId = deps.getUserId ?? getCurrentUserId
    const runWith = deps.runWithUser ?? runWithUser
    this.wrapUser = (userId, fn) => (userId ? runWith(userId, fn) : fn())
    this.deps = {
      emit: deps.emit,
      store: deps.store ?? new InMemoryApprovalStore(),
      clock: deps.clock ?? (() => Date.now()),
      timeoutMs: deps.timeoutMs ?? 5 * 60_000,
      sessionCacheCapacity: deps.sessionCacheCapacity ?? 64,
    }
  }

  /** 发卡并挂起：直到 decide / 超时 / signal 中断 */
  async request(
    scopeKey: string,
    tool: AgentToolDef,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<ApprovalDecision> {
    // Amendment 命中：会话级同类免批（不发新卡，审计事件照发）
    const aKey = amendmentKey(tool.name, input)
    if (this.sessionCache.has(aKey)) {
      this.deps.emit({ type: 'approval:resolved', approvalId: `auto:${aKey}`, action: 'session-amendment' })
      return { action: 'approve' }
    }

    // 同 scope 同时最多一张挂起卡（12 号约定；违反=调用方 bug，fail-fast）
    const existing = this.scopePending.get(scopeKey)
    if (existing && existing.size > 0) {
      throw new Error(`ApprovalCoordinator: scope ${scopeKey} 已有挂起审批（同会话同时最多一张）`)
    }

    const approvalId = randomUUID()
    const now = this.deps.clock()
    const info: PendingApproval = {
      approvalId,
      sessionId: scopeKey,
      toolName: tool.name,
      input,
      cardTitle: tool.approvalCard?.title ?? tool.name,
      cardSummary: tool.approvalCard?.summary ? safeSummary(tool.approvalCard.summary, input) : '',
      createdAt: now,
      expiresAt: now + this.deps.timeoutMs,
    }

    await this.deps.store.save(info).catch((e) => logger.warn('[approval] 落库失败（继续挂起）', e))

    return new Promise<ApprovalDecision>((resolve) => {
      const entry: PendingEntry = {
        userId: this.getUserId(),
        info,
        resolve: (d) => {
          if (entry.timer) clearTimeout(entry.timer)
          if (entry.onAbort && signal) signal.removeEventListener('abort', entry.onAbort)
          this.cleanup(approvalId, scopeKey)
          void this.deps.store.clear(approvalId).catch(() => undefined)
          resolve(d)
        },
        timer: null,
        onAbort: null,
      }
      this.pending.set(approvalId, entry)
      if (!this.scopePending.has(scopeKey)) this.scopePending.set(scopeKey, new Set())
      this.scopePending.get(scopeKey)!.add(approvalId)

      // 超时=拒绝（24 号/12 号语义）
      entry.timer = setTimeout(() => {
        this.wrapUser(entry.userId, () => this.deps.emit({ type: 'approval:resolved', approvalId, action: 'timeout' }))
        entry.resolve({ action: 'reject', reason: 'timeout' })
      }, this.deps.timeoutMs)
      entry.timer.unref?.() // 挂起等待不阻止进程退出（与 event-bridge delta 定时器同纪律）

      // 会话取消/轮次中断：全部挂起卡补发拒绝
      if (signal) {
        entry.onAbort = () => {
          this.wrapUser(entry.userId, () => this.deps.emit({ type: 'approval:resolved', approvalId, action: 'cancelled' }))
          entry.resolve({ action: 'reject', reason: 'cancelled' })
        }
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }

      this.deps.emit({
        type: 'approval:request',
        approvalId,
        toolName: tool.name,
        input,
        card: {
          title: info.cardTitle ?? tool.name,
          summary: info.cardSummary ?? '',
          editable: tool.approvalCard?.editable,
        },
        expiresAt: info.expiresAt,
      })
    })
  }

  /** 前端决定到达；false=不存在/已过期（幂等） */
  decide(approvalId: string, decision: ApprovalDecision): boolean {
    const entry = this.pending.get(approvalId)
    if (!entry) return false
    if (this.deps.clock() > entry.info.expiresAt) return false

    // Amendment 沉淀：approve + scope=session → 会话级同类免批
    if (decision.action === 'approve' && decision.scope === 'session') {
      const key = amendmentKey(entry.info.toolName, entry.info.input)
      this.sessionCache.set(key, true)
      if (this.sessionCache.size > this.deps.sessionCacheCapacity) {
        const oldest = this.sessionCache.keys().next().value
        if (oldest !== undefined) this.sessionCache.delete(oldest)
      }
    }

    this.deps.emit({
      type: 'approval:resolved',
      approvalId,
      action: decision.action === 'approve_with_edit' ? 'approve_with_edit' : decision.action,
    })
    entry.resolve(decision)
    return true
  }

  /** 超时扫描（门面定时器驱动，默认 30s 周期） */
  sweep(): number {
    const now = this.deps.clock()
    let swept = 0
    for (const entry of [...this.pending.values()]) {
      if (now > entry.info.expiresAt) {
        this.wrapUser(entry.userId, () => this.deps.emit({ type: 'approval:resolved', approvalId: entry.info.approvalId, action: 'timeout' }))
        entry.resolve({ action: 'reject', reason: 'timeout' })
        swept++
      }
    }
    return swept
  }

  /** 会话取消：scope 内全部挂起卡补发拒绝 */
  cancelScope(scopeKey: string): void {
    const ids = this.scopePending.get(scopeKey)
    if (!ids) return
    for (const id of [...ids]) {
      const entry = this.pending.get(id)
      if (!entry) continue
      this.wrapUser(entry.userId, () => this.deps.emit({ type: 'approval:resolved', approvalId: id, action: 'cancelled' }))
      entry.resolve({ action: 'reject', reason: 'cancelled' })
    }
  }

  listPending(scopeKey: string): PendingApproval[] {
    const ids = this.scopePending.get(scopeKey)
    if (!ids) return []
    return [...ids].map((id) => this.pending.get(id)?.info).filter((x): x is PendingApproval => !!x)
  }

  get pendingCount(): number {
    return this.pending.size
  }

  private cleanup(approvalId: string, scopeKey: string): void {
    this.pending.delete(approvalId)
    this.scopePending.get(scopeKey)?.delete(approvalId)
  }
}

function safeSummary(fn: (i: unknown) => string, input: unknown): string {
  try {
    return String(fn(input) ?? '').slice(0, 2000)
  } catch {
    return ''
  }
}
