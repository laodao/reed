/**
 * 平台事件总线（Platform Event Bus）
 * @module core/platform/services/event-system/event-bus.service
 * @description 设计规格：tasks/2026-08-28-agent-loop-harness/10-event-system.md。
 *
 * M1 核心范围：
 * - publish：写库分配全局 seq → 提交后进程内分发（safePublish：基础设施故障返回 null，
 *   绝不抛给业务主流程；载荷违规 fail-fast 抛 EventPayloadError，§8）
 * - subscribe：通配符匹配（§5.2）；命名持久消费者建/续游标（at-least-once）；
 *   匿名订阅至多一次（UI 推送类）
 * - dispatcher：启动时扫表补偿 + 每 2s 兜底扫描（§6.3）；命名消费者的唯一投递路径
 *   是 pump（publish 即时通知、兜底扫描、退避重试共用），天然串行 + 聚合有序（§5.5）
 * - handler 失败退避 1/2/4/8/16s，重试 5 次仍失败写 DLQ 且游标跳过毒消息（§6.1/§7.4）
 * - replay（§5.2）与 ingest（LAN 预留 id 去重契约）
 * - 背压拉模式（§7.7，M3）：命名消费者 in-flight 水位达 maxInFlight（默认 1000）→ 切拉模式，
 *   实时分发跳过该消费者，靠兜底扫描按游标追赶；水位回落到一半以下切回推模式。
 *   匿名订阅者队列满直接丢弃并 warn（至多一次语义允许）
 * - 生产者侧限流（§7.8，M4）：每 (type, aggregate) 每分钟 N 次（event-rate-limit.ts），
 *   超限记 system.event.rate-limited 后丢弃（返回 null）
 *
 * 明确不做（后续批次）：保留与归档在 event-archive.service.ts（§7.10，M4）。
 * （M1 收尾已补齐：ipc/ws 通道 channels/ + 引擎 producer 适配器 workflow-run-producer；
 *  M2 已补齐：EventAdmin event-admin.service.ts、sse 混合流 run-event-stream.ts、
 *  命名消费者 startFrom='latest' 起始位）
 *
 * 投递语义约定（§5.5）：at-least-once 仅对命名持久消费者生效；handler 必须以
 * (aggregate.kind, aggregate.id, event.id) 或业务幂等键去重；重放只重建状态。
 */

import { randomUUID } from 'node:crypto'
import type { DataSource } from 'typeorm'
import type {
  EventBus,
  EventHandler,
  PlatformEvent,
  PublishInput,
  PublishOptions,
  QueryRunnerLike,
  ReplayQuery,
  SubscribeOptions,
  Subscription,
  SubscriptionFilter,
} from '@shared/types/event.types'
import { getCurrentUserId, runWithUser, runWithoutUser } from '@core/context/user-context'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'
import type { PlatformEventEntity } from '@core/database/entities/platform-event.entities'
import { createLogger } from '@core/utils/logger'
import { SETTINGS_KEYS, getSettingWithLegacyFallback } from '@shared/constants/settings-keys'
import { eventParamsFromSettings } from '@shared/utils/event-params'
import { matchesFilter } from './event-matcher'
import { EventPayloadError, assertPayloadSafe } from './payload-guard'
import {
  DEFAULT_EVENT_RATE_LIMITS,
  DEFAULT_EVENT_RATE_LIMIT_WINDOW_MS,
  EventRateLimiter,
  RATE_LIMITED_EVENT_TYPE,
  type EventRateLimitRule,
  EventRateLimitError,
} from './event-rate-limit'

const logger = createLogger('PlatformEventBus')

/** 退避序列（§6.1）：1s → 2s → 4s → 8s → 16s */
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]
/** 重试次数上限（§6.1）：5 次重试仍失败 → DLQ */
const DEFAULT_MAX_ATTEMPTS = 5
/** dispatcher 兜底扫描间隔（§6.3） */
const DEFAULT_SWEEP_INTERVAL_MS = 2000
/** 扫表补偿单批大小（§6.3 LIMIT 200） */
const DEFAULT_SCAN_BATCH_SIZE = 200
/** replay 分批大小 */
const REPLAY_BATCH_SIZE = 500
/** 背压（§7.7）：命名持久消费者 in-flight 默认上限（订阅级 maxInFlight 可覆盖） */
const DEFAULT_MAX_IN_FLIGHT = 1000
/** 背压（§7.7）：匿名订阅者 in-flight 默认上限，满则丢弃并 warn */
const DEFAULT_ANONYMOUS_MAX_IN_FLIGHT = 1000
/** 匿名订阅者丢弃告警节流间隔 */
const ANONYMOUS_DROP_WARN_INTERVAL_MS = 1000

export interface EventBusDriverOptions {
  /** 测试注入：缩短退避序列 */
  retryDelaysMs?: number[]
  maxAttempts?: number
  /** 测试注入：缩短兜底扫描间隔 */
  sweepIntervalMs?: number
  scanBatchSize?: number
  /** 背压（§7.7）：命名消费者 in-flight 上限缺省值（订阅级 maxInFlight 可覆盖） */
  defaultMaxInFlight?: number
  /** 背压（§7.7）：匿名订阅者 in-flight 上限，满则丢弃并 warn */
  anonymousMaxInFlight?: number
  /** 限流（§7.8）：规则表，首条命中生效；缺省 DEFAULT_EVENT_RATE_LIMITS */
  rateLimits?: EventRateLimitRule[]
  rateLimitWindowMs?: number
}

interface AnonymousSub {
  filter: SubscriptionFilter
  handler: EventHandler
  /** 背压（§7.7）：在途 handler 数，达上限丢弃新事件 */
  inFlight: number
  /** 丢弃告警节流 */
  lastDropWarnAt: number
  droppedSinceWarn: number
}

/** 命名持久消费者的内存态（游标持久化在 platform_event_cursors） */
interface ConsumerState {
  key: string
  name: string
  userScope: string
  filter: SubscriptionFilter
  handler: EventHandler
  pumping: boolean
  pumpAgain: boolean
  /** 背压（§7.7）：in-flight 上限（缺省 1000） */
  maxInFlight: number
  /**
   * in-flight 水位估计：实时分发每踢一次 +1，deliver 成功/死信 -1（下界 0）。
   * 是估计值而非精确队列——tx 路径/崩溃补偿事件不经实时分发，不会计入；
   * 该计数只用于推/拉模式切换，不影响投递正确性（正确性由游标保证）。
   */
  inFlight: number
  /** 拉模式（§7.7）：true 时实时分发跳过踢泵，靠兜底扫描按游标追赶 */
  pullMode: boolean
}

function consumerKey(name: string, scope: string): string {
  return `${name} ${scope}`
}

function toMs(d: Date | string | number | null | undefined): number {
  if (d == null) return 0
  if (d instanceof Date) return d.getTime()
  return new Date(d).getTime()
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function generateUuid(): string {
  // node:crypto 而非 globalThis.crypto——Electron 主进程未暴露 WebCrypto 全局（M1 收尾实测踩坑）
  return randomUUID()
}

export class PlatformEventBus implements EventBus {
  private readonly repo: PlatformEventRepository
  private readonly isPg: boolean
  private readonly retryDelaysMs: number[]
  private readonly maxAttempts: number
  private readonly sweepIntervalMs: number
  private readonly scanBatchSize: number
  private readonly defaultMaxInFlight: number
  private readonly anonymousMaxInFlight: number
  private readonly rateLimiter: EventRateLimiter

  private readonly anonymousSubs = new Map<string, AnonymousSub>()
  private readonly consumers = new Map<string, ConsumerState>()
  /** 首轮失败时刻（DLQ first_failed_at；重启后丢失则回落 last_failed_at） */
  private readonly firstFailureAt = new Map<string, number>()

  private running = false
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  /** 在途 pump（stop 时等待收尾，避免连接关闭后仍在派发） */
  private readonly activePumps = new Set<Promise<void>>()

  constructor(dataSource: DataSource, opts: EventBusDriverOptions = {}) {
    this.repo = new PlatformEventRepository(dataSource)
    this.isPg = dataSource.options.type === 'postgres'
    this.retryDelaysMs = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
    this.maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.sweepIntervalMs = opts.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
    this.scanBatchSize = opts.scanBatchSize ?? DEFAULT_SCAN_BATCH_SIZE
    this.defaultMaxInFlight = opts.defaultMaxInFlight ?? DEFAULT_MAX_IN_FLIGHT
    this.anonymousMaxInFlight = opts.anonymousMaxInFlight ?? DEFAULT_ANONYMOUS_MAX_IN_FLIGHT
    this.rateLimiter = new EventRateLimiter(
      opts.rateLimits ?? DEFAULT_EVENT_RATE_LIMITS,
      opts.rateLimitWindowMs ?? DEFAULT_EVENT_RATE_LIMIT_WINDOW_MS
    )
  }

  /**
   * 启动 dispatcher：boot 扫表补偿（§6.3）+ 每 2s 兜底扫描（防分发窗口崩溃漏投）。
   * 幂等。未 start 的 bus 只写库不分发（停机窗口语义：事件落库，下次启动补偿投递）。
   */
  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    await this.sweep()
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch(e => logger.error('[EventBus] 兜底扫描失败（下轮继续）', e))
    }, this.sweepIntervalMs)
    this.sweepTimer.unref?.()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.sweepTimer !== null) clearInterval(this.sweepTimer)
    this.sweepTimer = null
    this.anonymousSubs.clear()
    this.consumers.clear()
    // 等待在途 pump 收尾（消费者已清空，pump 循环下一迭代即退出）
    await Promise.allSettled([...this.activePumps])
  }

  // ─── publish（§5.1） ────────────────────────────────────────────────────

  async publish<P>(input: PublishInput<P>, opts?: PublishOptions): Promise<PlatformEvent<P> | null> {
    return this.publishInternal(input, opts, false)
  }

  /**
   * publish 主流程。skipRateLimit 仅供限流 marker 事件内部使用
   * （marker 本身再被限流会失去"超限时仍有观测"的意义）。
   */
  private async publishInternal<P>(
    input: PublishInput<P>,
    opts: PublishOptions | undefined,
    skipRateLimit: boolean
  ): Promise<PlatformEvent<P> | null> {
    // 载荷守卫（§8）：密钥键名/超 64KB/不可序列化 → fail-fast 抛给生产者
    const payloadJson = assertPayloadSafe(input.payload)
    if (!input.type || typeof input.type !== 'string') {
      throw new EventPayloadError('[EventBus] publish 缺少 type')
    }
    if (!input.aggregate?.kind || !input.aggregate?.id) {
      throw new EventPayloadError('[EventBus] publish 缺少 aggregate.kind / aggregate.id')
    }

    // 生产者侧限流（§7.8）：每 (type, aggregate) 每分钟 N 次，超限记
    // system.event.rate-limited 后丢弃（返回 null，不落库原事件）。
    // marker 节流（每 key 每窗口至多一条）防限流自身成为事件风暴源。
    const rateKey = `${input.type}|${input.aggregate.kind}|${input.aggregate.id}`
    if (!skipRateLimit && !this.rateLimiter.allow(input.type, rateKey)) {
      logger.warn(
        `[EventBus] 事件被限流丢弃（type=${input.type}，aggregate=${input.aggregate.kind}/${input.aggregate.id}）`
      )
      if (this.rateLimiter.shouldMark(rateKey)) {
        await this.publishInternal(
          {
            type: RATE_LIMITED_EVENT_TYPE,
            aggregate: input.aggregate, // 沿用被限事件的聚合，便于按聚合排查
            actor: { kind: 'system', id: 'event-rate-limiter' },
            payload: {
              limitedType: input.type,
              maxPerMinute: this.rateLimiter.limitFor(input.type),
              windowMs: this.rateLimiter.windowMs,
            },
            correlationId: input.correlationId,
          },
          undefined, // marker 不进调用方事务：限流观测与业务事务解耦
          true
        )
      }
      // 2026-09-06 用户要求：清晰报错而非静默 null。策略违反与载荷违规同走 fail-fast
      //（safePublish 的 null 保留给基础设施故障）；producer 的 onFailed 分支收到明确原因，
      // marker 与上方 warn 日志照旧（风暴观测双通道）。
      throw new EventRateLimitError(
        input.type,
        rateKey,
        this.rateLimiter.limitFor(input.type),
        this.rateLimiter.windowMs,
      )
    }

    const now = new Date()
    const row: Partial<PlatformEventEntity> = {
      id: generateUuid(),
      // 租户作用域：发布时 ALS 快照（§8；机制同 domain-event-bus）；
      // 异步回调发布点 ALS 已丢失时经 input.userId 显式注入（2026-09-06 增）
      userId: input.userId !== undefined ? input.userId : getCurrentUserId(),
      type: input.type,
      aggregateKind: input.aggregate.kind,
      aggregateId: input.aggregate.id,
      actorKind: input.actor?.kind ?? 'system',
      actorId: input.actor?.id ?? null,
      payloadJson,
      causationId: input.causationId ?? null,
      correlationId: input.correlationId ?? null,
      occurredAt: now,
      schemaVersion: input.schemaVersion ?? 1,
      createdAt: now,
    }

    let seq: number
    try {
      if (opts?.tx) {
        // 同事务写入（§7.3 缓解）：提交时机由调用方控制，不做即时分发——
        // 若回滚则事件不存在；提交后由 dispatcher 兜底扫描补投（§6.3）。
        seq = await this.insertViaTx(opts.tx, row)
      } else {
        const saved = await this.repo.appendEvent(row)
        seq = Number(saved.seq)
      }
    } catch (e) {
      // safePublish 语义：基础设施故障绝不抛给业务主流程
      logger.error(`[EventBus] 事件落库失败（type=${input.type}，返回 null）`, e)
      return null
    }

    const event: PlatformEvent<P> = {
      seq,
      id: row.id!,
      userId: row.userId ?? null,
      type: row.type!,
      aggregate: { kind: row.aggregateKind!, id: row.aggregateId! },
      actor: { kind: row.actorKind as PlatformEvent['actor']['kind'], id: row.actorId ?? null },
      payload: input.payload,
      causationId: row.causationId ?? null,
      correlationId: row.correlationId ?? null,
      occurredAt: now.getTime(),
      schemaVersion: row.schemaVersion!,
    }
    if (!opts?.tx && this.running) this.dispatch(event)
    return event
  }

  /** 事务内原始 INSERT（方言占位符；sqlite 同事务读 last_insert_rowid 安全——串行门持锁） */
  private async insertViaTx(tx: QueryRunnerLike, row: Partial<PlatformEventEntity>): Promise<number> {
    const isPg =
      (tx as { connection?: { options?: { type?: string } } }).connection?.options?.type ===
        'postgres' || this.isPg
    const occurredAt = isPg ? row.occurredAt : formatSqliteDatetime(row.occurredAt as Date)
    const createdAt = isPg ? row.createdAt : formatSqliteDatetime(row.createdAt as Date)
    const values = [
      row.id, row.userId, row.type, row.aggregateKind, row.aggregateId,
      row.actorKind, row.actorId, row.payloadJson, row.causationId, row.correlationId,
      occurredAt, row.schemaVersion, createdAt,
    ]
    const columns =
      '(id, user_id, type, aggregate_kind, aggregate_id, actor_kind, actor_id, payload_json,' +
      ' causation_id, correlation_id, occurred_at, schema_version, created_at)'
    if (isPg) {
      const ph = values.map((_, i) => `$${i + 1}`).join(', ')
      const rows = (await tx.query(
        `INSERT INTO platform_events ${columns} VALUES (${ph}) RETURNING seq`,
        values
      )) as Array<{ seq: number | string }>
      return Number(rows[0].seq)
    }
    const ph = values.map(() => '?').join(', ')
    await tx.query(`INSERT INTO platform_events ${columns} VALUES (${ph})`, values)
    const rows = (await tx.query(`SELECT last_insert_rowid() AS seq`)) as Array<{ seq: number }>
    return Number(rows[0].seq)
  }

  // ─── subscribe（§5.2） ───────────────────────────────────────────────────

  subscribe(
    filter: SubscriptionFilter,
    handler: EventHandler,
    opts?: SubscribeOptions
  ): Subscription {
    const id = generateUuid()
    const consumerName = opts?.consumerName
    if (!consumerName) {
      // 匿名订阅：至多一次（§5.2），仅 publish 后即时分发，无游标无补偿
      this.anonymousSubs.set(id, { filter, handler, inFlight: 0, lastDropWarnAt: 0, droppedSinceWarn: 0 })
      return {
        id,
        unsubscribe: async () => {
          this.anonymousSubs.delete(id)
        },
      }
    }

    // 命名持久消费者：建/续游标（at-least-once）。
    // 租户作用域取订阅时刻 ALS userId；无 ALS 时 '*' 系统级跨租户（§8：需代码评审登记）。
    const userScope = getCurrentUserId() ?? '*'
    const consumer: ConsumerState = {
      key: consumerKey(consumerName, userScope),
      name: consumerName,
      userScope,
      filter,
      handler,
      pumping: false,
      pumpAgain: false,
      maxInFlight: Math.max(1, opts?.maxInFlight ?? this.defaultMaxInFlight),
      inFlight: 0,
      pullMode: false,
    }
    this.consumers.set(consumer.key, consumer)
    void (async () => {
      // startFrom='latest'（§5.2）：新建游标从当前最大 seq 起订、不补历史。
      // 无竞态：maxSeq 读取之后发布的事件 seq 更大，游标建好后 pump 扫 seq > lastSeq 仍会拾取。
      const initialLastSeq =
        opts?.startFrom === 'latest' ? await this.repo.getMaxSeq() : 0
      await this.repo.ensureCursor(consumerName, userScope, initialLastSeq)
      // 续跑语义：游标已存在则从 last_seq 继续；新建（last_seq=0/latest 位）按起始位扫描
      if (this.running && this.consumers.get(consumer.key) === consumer) {
        this.kickPump(consumer)
      }
    })().catch(e => logger.error(`[EventBus] 建游标失败（consumer=${consumerName}）`, e))

    return {
      id,
      unsubscribe: async () => {
        // 摘除内存订阅；游标行保留（命名消费者重启/重订阅后续跑）
        if (this.consumers.get(consumer.key) === consumer) this.consumers.delete(consumer.key)
      },
    }
  }

  // ─── replay（§5.2） ─────────────────────────────────────────────────────

  replay(query: ReplayQuery): AsyncIterable<PlatformEvent> {
    // 租户快照必须在这里（同步调用点）捕获：异步生成器函数体要到首次迭代才执行，
    // 那时 ALS 上下文已不是调用方的——直接在生成器体内取 getCurrentUserId() 会丢租户。
    const userId = getCurrentUserId()
    return this.replayIterable(query, userId)
  }

  private async *replayIterable(
    query: ReplayQuery,
    userId: string | null
  ): AsyncIterable<PlatformEvent> {
    const limit = Math.min(query.limit ?? 1000, 10000) // §5.2 硬上限
    let afterSeq = query.afterSeq ?? 0
    let remaining = limit
    while (remaining > 0) {
      const batchSize = Math.min(remaining, REPLAY_BATCH_SIZE)
      const batch = await this.scopedFetch(userId, () =>
        this.repo.replayBatch(query, afterSeq, batchSize)
      )
      if (batch.length === 0) return
      for (const entity of batch) {
        yield this.repo.toPlatformEvent(entity)
        afterSeq = Number(entity.seq)
      }
      remaining -= batch.length
      if (batch.length < batchSize) return
    }
  }

  /** 在指定租户上下文内执行（null = user_id IS NULL 语义，与 BaseRepository.scoped 一致） */
  private scopedFetch<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
    if (userId === null) return runWithoutUser(fn)
    return runWithUser(userId, fn)
  }

  // ─── ingest（LAN 预留去重契约，§5.1） ─────────────────────────────────────

  async ingest<P>(event: Omit<PlatformEvent<P>, 'seq'>): Promise<'stored' | 'duplicate'> {
    if (!event?.id || !event.type || !event.aggregate?.kind || !event.aggregate?.id) {
      throw new EventPayloadError('[EventBus] ingest 事件缺少 id / type / aggregate')
    }
    const payloadJson = assertPayloadSafe(event.payload)
    const row: Partial<PlatformEventEntity> = {
      id: event.id, // 保留原 id 作为去重键
      userId: event.userId ?? null,
      type: event.type,
      aggregateKind: event.aggregate.kind,
      aggregateId: event.aggregate.id,
      actorKind: event.actor?.kind ?? 'system',
      actorId: event.actor?.id ?? null,
      payloadJson,
      causationId: event.causationId ?? null,
      correlationId: event.correlationId ?? null,
      occurredAt: new Date(event.occurredAt || Date.now()),
      schemaVersion: event.schemaVersion ?? 1,
      createdAt: new Date(),
    }
    let saved: PlatformEventEntity
    try {
      saved = await this.repo.appendRemoteEvent(row)
    } catch (e) {
      if (/unique|duplicate/i.test(errorMessage(e))) return 'duplicate' // id 去重命中
      logger.error(`[EventBus] ingest 落库失败（id=${event.id}）`, e)
      throw e // ingest 属运维/同步面，基础设施错误抛给调用方
    }
    if (this.running) this.dispatch(this.repo.toPlatformEvent(saved))
    return 'stored'
  }

  // ─── dispatcher（§6.3） ──────────────────────────────────────────────────

  /** 提交后进程内分发：匿名订阅者直接调（异常隔离 §7.5）；命名消费者 kick pump */
  private dispatch(event: PlatformEvent): void {
    for (const sub of this.anonymousSubs.values()) {
      if (!matchesFilter(sub.filter, event)) continue
      // 背压（§7.7）：匿名订阅者（UI 推送）队列满 → 丢弃并 warn（至多一次语义允许），
      // 告警按订阅者节流，避免事件风暴连带日志风暴
      if (sub.inFlight >= this.anonymousMaxInFlight) {
        sub.droppedSinceWarn++
        const now = Date.now()
        if (now - sub.lastDropWarnAt >= ANONYMOUS_DROP_WARN_INTERVAL_MS) {
          logger.warn(
            `[EventBus] 匿名订阅者队列满（上限 ${this.anonymousMaxInFlight}），丢弃事件 type=${event.type}（本窗口累计 ${sub.droppedSinceWarn} 条）`
          )
          sub.lastDropWarnAt = now
          sub.droppedSinceWarn = 0
        }
        continue
      }
      sub.inFlight++
      void Promise.resolve()
        .then(() => sub.handler(event))
        .catch(e => logger.warn(`[EventBus] 匿名订阅者处理失败（type=${event.type}）`, e))
        .finally(() => {
          sub.inFlight--
        })
    }
    for (const consumer of this.consumers.values()) {
      if (consumer.userScope !== '*' && consumer.userScope !== event.userId) continue
      if (!matchesFilter(consumer.filter, event)) continue
      // 背压（§7.7）：in-flight 水位达 maxInFlight → 拉模式，实时分发跳过该消费者，
      // 事件不丢（已落库），靠 2s 兜底扫描按游标追赶；水位回落后切回推模式（deliver 处）
      if (consumer.pullMode) continue
      consumer.inFlight++
      if (consumer.inFlight >= consumer.maxInFlight) {
        consumer.pullMode = true
        logger.warn(
          `[EventBus] 消费者 ${consumer.name} in-flight 达上限 ${consumer.maxInFlight}，切拉模式（兜底扫描追赶）`
        )
        continue
      }
      this.kickPump(consumer)
    }
  }

  /**
   * deliver 收口时的水位扣减（ack / 死信）。重试态不扣——事件仍未办结，水位保持。
   * 水位回落到上限一半以下（滞回，防抖）→ 切回推模式并立即踢泵追赶。
   */
  private decrementInFlight(consumer: ConsumerState): void {
    if (consumer.inFlight > 0) consumer.inFlight--
    if (consumer.pullMode && consumer.inFlight < Math.floor(consumer.maxInFlight / 2)) {
      consumer.pullMode = false
      logger.info(
        `[EventBus] 消费者 ${consumer.name} 水位回落至 ${consumer.inFlight}，切回推模式`
      )
      this.kickPump(consumer) // pump 若在途则合并为 pumpAgain
    }
  }

  /**
   * 背压水位观测（§7.7，运维/测试用）：返回消费者 in-flight 与拉模式状态；
   * 消费者未在本进程订阅时返回 null。
   */
  getConsumerPressure(
    consumerName: string,
    userScope: string
  ): { inFlight: number; pullMode: boolean; maxInFlight: number } | null {
    const consumer = this.consumers.get(consumerKey(consumerName, userScope))
    if (!consumer) return null
    return { inFlight: consumer.inFlight, pullMode: consumer.pullMode, maxInFlight: consumer.maxInFlight }
  }

  /** 兜底扫描/booth 补偿（§6.3）：对活跃游标对应的内存消费者触发 pump */
  private async sweep(): Promise<void> {
    const cursors = await this.repo.listCursors()
    for (const cursor of cursors) {
      const consumer = this.consumers.get(consumerKey(cursor.consumerName, cursor.userScope))
      if (consumer) this.kickPump(consumer)
    }
  }

  /**
   * 管理面手动触发消费者追赶（EventAdmin.requeue 回拨游标后调用，§5.3）。
   * 消费者未在本进程订阅时静默跳过——下轮兜底扫描/下次订阅会按游标补投。
   */
  kickConsumer(consumerName: string, userScope: string): void {
    const consumer = this.consumers.get(consumerKey(consumerName, userScope))
    if (consumer) this.kickPump(consumer)
  }

  /** pump 串行化：同一消费者同时只有一个 pump；并发 kick 合并为 pumpAgain */
  private kickPump(consumer: ConsumerState): void {    if (consumer.pumping) {
      consumer.pumpAgain = true
      return
    }
    consumer.pumping = true
    const pump = this.pumpLoop(consumer)
    this.activePumps.add(pump)
    void pump.finally(() => this.activePumps.delete(pump))
  }

  private async pumpLoop(consumer: ConsumerState): Promise<void> {
    try {
      do {
        consumer.pumpAgain = false
        await this.pumpOnce(consumer)
      } while (consumer.pumpAgain && this.consumers.get(consumer.key) === consumer)
    } catch (e) {
      // pump 自身异常（DB 抖动等）：不扩散，下轮兜底扫描恢复
      logger.error(
        `[EventBus] 消费者 ${consumer.name} 派发异常（下轮兜底扫描恢复）：${errorMessage(e)}`,
        e instanceof Error ? e.stack : e
      )
    } finally {
      consumer.pumping = false
    }
  }

  /**
   * 单消费者派发主循环（串行 → 聚合有序 §5.5）：
   * - retrying 态：到点重投指定 seq
   * - 空闲态：扫 seq > last_seq 的下一批，匹配的投递、不匹配的随游标跳过（§7.6 空洞无害）
   */
  private async pumpOnce(consumer: ConsumerState): Promise<void> {
    const { name, userScope } = consumer
    for (;;) {
      if (this.consumers.get(consumer.key) !== consumer) return // 已 unsubscribe
      const cursor = await this.repo.getCursor(name, userScope)
      if (!cursor) return

      if (cursor.retryingSeq != null) {
        // 重试态：未到点则等兜底扫描再次触发
        if (cursor.nextRetryAt && toMs(cursor.nextRetryAt) > Date.now()) return
        const entity = await this.repo.findBySeq(cursor.retryingSeq)
        if (!entity) {
          // 事件已被归档清理 → 跳过该 seq（§7.10；DLQ 重放走 EventAdmin，M3）
          await this.repo.markDeadAdvance(name, userScope, cursor.retryingSeq)
          continue
        }
        const result = await this.deliver(
          consumer,
          this.repo.toPlatformEvent(entity),
          cursor.retryCount,
          null
        )
        if (result === 'retrying') return
        continue
      }

      // 空闲态：扫表推进
      const batch = await this.repo.scanAfterSeq(cursor.lastSeq, userScope, this.scanBatchSize)
      if (batch.length === 0) return
      let prevScanned = cursor.lastSeq
      for (const entity of batch) {
        const seq = Number(entity.seq)
        const event = this.repo.toPlatformEvent(entity)
        if (matchesFilter(consumer.filter, event)) {
          const result = await this.deliver(
            consumer,
            event,
            0,
            prevScanned > cursor.lastSeq ? prevScanned : null
          )
          if (result === 'retrying') break // 退避中，等兜底扫描到点重试
          prevScanned = seq
        } else {
          prevScanned = seq // 不匹配：随下次游标写入跳过
        }
      }
      if (prevScanned > cursor.lastSeq) {
        // 批量跳过不匹配事件（游标语义：≤ last_seq 均已处理）
        const latest = await this.repo.getCursor(name, userScope)
        if (latest && latest.retryingSeq == null && prevScanned > latest.lastSeq) {
          await this.repo.ackAdvance(name, userScope, prevScanned)
        }
      }
      // 本批处理完 → 继续扫下一批（直到没有更多事件）
    }
  }

  /**
   * 投递一条事件：成功 → ack 游标前移；失败 → 退避重试或 DLQ（§6.1 状态机）。
   */
  private async deliver(
    consumer: ConsumerState,
    event: PlatformEvent,
    prevRetryCount: number,
    skipToSeq: number | null
  ): Promise<'acked' | 'retrying' | 'dead'> {
    const { name, userScope } = consumer
    try {
      await consumer.handler(event)
      await this.repo.ackAdvance(name, userScope, event.seq)
      this.firstFailureAt.delete(`${consumer.key}|${event.seq}`)
      this.decrementInFlight(consumer)
      return 'acked'
    } catch (e) {
      const msg = errorMessage(e)
      logger.warn(`[EventBus] 消费者 ${name} 处理失败（seq=${event.seq}）：${msg}`)
      const failureKey = `${consumer.key}|${event.seq}`
      if (prevRetryCount === 0 && !this.firstFailureAt.has(failureKey)) {
        this.firstFailureAt.set(failureKey, Date.now())
      }
      const count = prevRetryCount + 1
      if (count > this.maxAttempts) {
        // 达上限 → DLQ + 游标跳过毒消息前移（§7.4 不阻塞后续事件）
        await this.repo.insertDeadLetter({
          id: generateUuid(),
          consumerName: name,
          userScope,
          eventSeq: event.seq,
          eventJson: JSON.stringify(event),
          error: msg,
          attempts: count,
          firstFailedAt: new Date(this.firstFailureAt.get(failureKey) ?? Date.now()),
          lastFailedAt: new Date(),
          status: 'pending',
          createdAt: new Date(),
        })
        await this.repo.markDeadAdvance(name, userScope, event.seq)
        this.firstFailureAt.delete(failureKey)
        this.decrementInFlight(consumer)
        logger.error(
          `[EventBus] 消费者 ${name} 事件 seq=${event.seq} 重试 ${this.maxAttempts} 次仍失败，已入死信队列`
        )
        return 'dead'
      }
      const delay = this.retryDelaysMs[Math.min(count, this.retryDelaysMs.length) - 1]
      await this.repo.markRetrying(
        name,
        userScope,
        event.seq,
        skipToSeq,
        count,
        new Date(Date.now() + delay),
        msg
      )
      return 'retrying'
    }
  }
}

// ─── 单例（双端 boot 装配取用） ─────────────────────────────────────────────

let singleton: PlatformEventBus | null = null
let starting: Promise<PlatformEventBus | null> | null = null

/**
 * 获取/惰性启动平台事件总线单例。数据源取自已注册的 core 数据库管理器。
 * 启动失败不抛错（返回 null）——事件系统是基础设施，不阻断应用主流程。
 */
export async function getEventBus(): Promise<PlatformEventBus | null> {
  if (singleton) return singleton
  if (starting) return starting
  starting = (async () => {
    try {
      const ds = getCoreDatabaseManager().dataSource
      if (!ds) {
        logger.warn('[EventBus] 数据源未就绪，事件总线未启动')
        return null
      }
      const bus = new PlatformEventBus(ds, {
        rateLimits: await loadRateLimitOverrides(),
        // 「参数设置 → 事件系统 → 事件总线」（启动装配，改完需重启）
        ...(await loadEventBusParams()),
      })
      await bus.start()
      singleton = bus
      logger.info('[EventBus] 平台事件总线已启动')
      return bus
    } catch (e) {
      logger.error('[EventBus] 启动失败（不影响应用主流程）', e)
      return null
    } finally {
      starting = null
    }
  })()
  return starting
}

/**
 * 仅当总线已启动时返回（publishDomainEvent 适配器等同步埋点用）。
 * 未启动时返回 null——调用方跳过持久化（事件系统在 boot 早期尚不就绪，与存量纯内存行为等价）。
 */
export function getEventBusIfReady(): PlatformEventBus | null {
  return singleton
}

/** 关停单例（应用退出/测试用） */
export async function stopEventBus(): Promise<void> {
  if (singleton) await singleton.stop()
  singleton = null
}

/** sqlite 原生 SQL 路径的日期格式（对齐 TypeORM mixedDateToDatetimeString，UTC） */
function formatSqliteDatetime(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '')
}


/** settings 键：`event:rateLimits`（JSON 规则数组，如 [{"pattern":"agent:*","maxPerMinute":0}]；0=不限）。读取失败/缺省回退代码默认（2026-09-06 增；2026-09-13 键名统一规范，旧键 eventBus:rateLimits 由兜底读取兼容） */
const RATE_LIMIT_SETTINGS_KEY = SETTINGS_KEYS.eventRateLimits

/**
 * 读「参数设置 → 事件系统 → 事件总线」的生效值（启动装配时调一次）。
 * 走登记表解析（与设置页同一口径），缺省/非法一律回落内置默认。
 */
async function loadEventBusParams(): Promise<{
  maxAttempts?: number
  sweepIntervalMs?: number
  scanBatchSize?: number
  defaultMaxInFlight?: number
  anonymousMaxInFlight?: number
}> {
  try {
    const settings = getCoreDatabaseManager().settings
    const raw: Record<string, unknown> = {
      [SETTINGS_KEYS.eventBus]: settings
        ? await getSettingWithLegacyFallback(settings, SETTINGS_KEYS.eventBus)
        : null,
    }
    const { bus } = eventParamsFromSettings(raw)
    return {
      maxAttempts: bus.maxAttempts,
      sweepIntervalMs: bus.sweepIntervalMs,
      scanBatchSize: bus.scanBatchSize,
      defaultMaxInFlight: bus.maxInFlight,
      anonymousMaxInFlight: bus.maxAnonymousInFlight,
    }
  } catch (e) {
    logger.warn('[EventBus] 读取事件总线参数失败（使用内置默认）', e)
    return {}
  }
}

async function loadRateLimitOverrides(): Promise<EventRateLimitRule[] | undefined> {
  try {
    const settings = getCoreDatabaseManager().settings
    if (!settings) return undefined
    const raw = await getSettingWithLegacyFallback(settings, RATE_LIMIT_SETTINGS_KEY)
    if (!Array.isArray(raw)) return undefined
    const rules = raw.filter(
      (r): r is EventRateLimitRule =>
        !!r && typeof r === 'object' && typeof (r as EventRateLimitRule).pattern === 'string' &&
        typeof (r as EventRateLimitRule).maxPerMinute === 'number',
    )
    return rules.length > 0 ? rules : undefined
  } catch (e) {
    logger.warn('[EventBus] 读取限流覆盖配置失败，使用代码默认', e)
    return undefined
  }
}
