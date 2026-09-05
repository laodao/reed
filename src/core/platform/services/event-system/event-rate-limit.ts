/**
 * 生产者侧限流（10-event-system §7.8）
 * @module core/platform/services/event-system/event-rate-limit
 * @description "每 (type, aggregate) 每分钟 N 次"滑动窗口限流，泛化自存量触发器的
 *              EVENT_TRIGGER_MAX_PER_MINUTE=20 风暴防护语义
 *              （workflow-trigger-scheduler.service.ts :39）。
 *
 * 超限事件处理（§7.8）：记一条 system.event.rate-limited 事件后丢弃（不落库原事件）。
 * marker 每 key 每窗口至多记一条——否则限流本身会成为新的事件风暴源。
 *
 * 内存单实例实现（重启清零），与存量触发器限流同立场（scheduler :37 注释）。
 * ingest（LAN 远端事件）不经过本限流——远端已被其本端策略约束。
 */

import { matchTypePattern } from './event-matcher'

/** 限流规则：类型模式（'*' 全量 / '前缀*' / 精确名，复用订阅匹配语义）+ 每分钟上限 */
export interface EventRateLimitRule {
  pattern: string
  /** 每 (type, aggregate) 每分钟允许的最大发布次数；0 = 不限 */
  maxPerMinute: number
}

/** 限流 marker 事件类型（§7.8） */
export const RATE_LIMITED_EVENT_TYPE = 'system.event.rate-limited'

export const DEFAULT_EVENT_RATE_LIMIT_WINDOW_MS = 60_000

/**
 * 默认阈值（按类型族区分，首条命中生效，故从具体到宽泛排列）：
 * - system.event.* 不限：限流自身的 marker 事件，防自限死循环；
 * - workflow.run.* 不限：run 生命周期含高频 node-progress 进度事件，前端实时推送依赖之，
 *   存量系统对 wf:run-event 本无限流——误杀会导致 UI 进度卡死，故默认放行；
 * - 其余一律 20/分钟/(type,aggregate)：沿袭 EVENT_TRIGGER_MAX_PER_MINUTE=20 语义，
 *   让自触发链/跨模块乒乓在 1 分钟内衰减到静默，而非无限烧存储与投递。
 */
export const DEFAULT_EVENT_RATE_LIMITS: EventRateLimitRule[] = [
  { pattern: 'system.event.*', maxPerMinute: 0 },
  { pattern: 'workflow.run.*', maxPerMinute: 0 },
  { pattern: '*', maxPerMinute: 20 },
]

/** 窗口表内存上限防御：键数超限时会全表清理过期窗口（正常量级远达不到） */
const MAX_TRACKED_KEYS = 10_000

export class EventRateLimiter {
  /** key = `${type}|${aggregateKind}|${aggregateId}` → 窗口内时间戳 */
  private readonly windows = new Map<string, number[]>()
  /** key → 上次记 marker 的时刻（节流：每 key 每窗口至多一条 marker） */
  private readonly lastMarkedAt = new Map<string, number>()

  constructor(
    private readonly rules: EventRateLimitRule[] = DEFAULT_EVENT_RATE_LIMITS,
    readonly windowMs: number = DEFAULT_EVENT_RATE_LIMIT_WINDOW_MS,
    private readonly now: () => number = Date.now
  ) {}

  /** 该类型适用的每分钟上限（首条命中规则生效；0 = 不限） */
  limitFor(type: string): number {
    for (const rule of this.rules) {
      if (matchTypePattern(rule.pattern, type)) return rule.maxPerMinute
    }
    return 0
  }

  /**
   * 限流闸门：true = 放行并计数；false = 超限（调用方记 marker 后丢弃）。
   * 不限流的类型不计数、不占窗口表。
   */
  allow(type: string, key: string): boolean {
    const limit = this.limitFor(type)
    if (limit <= 0) return true
    const now = this.now()
    const stamps = (this.windows.get(key) ?? []).filter(ts => ts > now - this.windowMs)
    if (stamps.length >= limit) {
      this.windows.set(key, stamps)
      return false
    }
    stamps.push(now)
    this.windows.set(key, stamps)
    this.pruneIfOversized(now)
    return true
  }

  /** marker 节流：同一 key 每窗口至多上报一条 system.event.rate-limited */
  shouldMark(key: string): boolean {
    const now = this.now()
    const last = this.lastMarkedAt.get(key)
    if (last !== undefined && now - last < this.windowMs) return false
    this.lastMarkedAt.set(key, now)
    return true
  }

  private pruneIfOversized(now: number): void {
    if (this.windows.size <= MAX_TRACKED_KEYS) return
    for (const [k, stamps] of this.windows) {
      const live = stamps.filter(ts => ts > now - this.windowMs)
      if (live.length === 0) this.windows.delete(k)
      else this.windows.set(k, live)
    }
  }
}
