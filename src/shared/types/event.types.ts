/**
 * 通用事件系统（Platform Event System）双端契约类型
 * @module shared/types/event.types
 * @description 设计规格：tasks/2026-08-28-agent-loop-harness/10-event-system.md（§5 接口设计）。
 *              平台级公共底座，不属于工作流引擎私有：journal、任务树调度、记忆代谢、
 *              通知/待办等模块全部构建在本契约之上。
 *
 * 类型命名规范（§5.1 已定稿）：
 * - 领域事件沿用冒号式命名空间：`agent:*` / `workflow:*` / `kb:*`
 * - 点分层语法 `domain.entity.action` 仅用于引擎 run 生命周期事件（`workflow.run.*` 族）
 * - 两种语法并存为正式约定；通配符统一按段匹配
 */

/** 事件行为者类别 */
export type PlatformEventActorKind = 'user' | 'system' | 'agent' | 'workflow'

/** 事件归属聚合（同一聚合的事件按全局 seq 有序） */
export interface PlatformEventAggregate {
  kind: string
  id: string
}

/**
 * 统一事件信封（platform_events 行的内存形态）。
 * 排序权威是 seq；occurredAt 仅供展示（多实例时钟不可信，§7.9）。
 */
export interface PlatformEvent<P = unknown> {
  /** 存储分配的全局单调递增序号，发布前不可知 */
  seq: number
  /** uuid；LAN ingest 去重键 */
  id: string
  /** 发布时 ALS userId 快照（getCurrentUserId）；系统级/匿名可为 null */
  userId: string | null
  /** 事件类型（命名规范见文件头） */
  type: string
  aggregate: PlatformEventAggregate
  actor: { kind: PlatformEventActorKind; id: string | null }
  payload: P
  /** 引发本事件的事件/命令 id */
  causationId: string | null
  /** 贯穿一条业务链路的 id */
  correlationId: string | null
  /** epoch ms（展示用；顺序判断禁用，§7.9） */
  occurredAt: number
  schemaVersion: number
}

/** 发布入参 */
export interface PublishInput<P = unknown> {
  type: string
  aggregate: PlatformEventAggregate
  /** 缺省 { kind: 'system', id: null } */
  actor?: PlatformEvent['actor']
  payload: P
  causationId?: string
  correlationId?: string
  /** 缺省 1 */
  schemaVersion?: number
}

/**
 * 事务透传的最小结构（TypeORM QueryRunner 结构子集）。
 * publish(input, { tx }) 时事件与业务写入同一事务；
 * 该路径不做提交后即时分发（提交时机不可知），由 dispatcher 兜底扫描补投（§6.3）。
 */
export interface QueryRunnerLike {
  query(sql: string, params?: unknown[]): Promise<unknown>
}

export interface PublishOptions {
  tx?: QueryRunnerLike
}

/** 订阅过滤（§5.2） */
export interface SubscriptionFilter {
  /** 精确名或 '前缀*'；'*' 全量 */
  types: string[]
  /** 缺省不过滤；两个字段都给定时为 AND */
  aggregate?: { kind?: string; id?: string }
}

export interface SubscribeOptions {
  /**
   * 命名即持久消费者（建/续 platform_event_cursors 游标，at-least-once）；
   * 匿名 = 至多一次（UI 推送类）。
   * 消费者租户作用域取订阅时刻 ALS userId（无 ALS 时为 '*' 系统级，§8 登记评审）。
   */
  consumerName?: string
  /**
   * 持久消费者 in-flight 缓冲上限（背压拉模式 §7.7，M3 已生效）：
   * 实时分发水位达上限 → 切拉模式（靠兜底扫描按游标追赶，事件不丢），
   * 水位回落到一半以下切回推模式。缺省 1000
   */
  maxInFlight?: number
  /**
   * 新建游标的起始位（仅对命名持久消费者生效；游标已存在时无效——续跑语义不变）：
   * - 'earliest'（缺省）：last_seq=0，boot 补偿会重放全部历史匹配事件（§13 偏差 7）
   * - 'latest'：从当前最大 seq 起订，不补历史——UI 桥类消费者（如 app-session-bridge）
   *   只关心订阅之后的事件，避免"启动时狂补历史"（M2 新增）
   */
  startFrom?: 'earliest' | 'latest'
}

/**
 * 事件处理器契约（§5.5 投递语义）：
 * - at-least-once 仅对命名持久消费者生效；ack = handler 成功后游标前移
 * - handler 必须以 (aggregate.kind, aggregate.id, event.id) 或业务幂等键去重
 * - 重放只重建状态、不重放副作用
 */
export type EventHandler = (event: PlatformEvent) => Promise<void> | void

export interface Subscription {
  readonly id: string
  unsubscribe(): Promise<void>
}

/** 重放查询（§5.2） */
export interface ReplayQuery {
  types?: string[]
  aggregate?: { kind?: string; id?: string }
  /** occurred_at 时间窗（ms，闭区间，边界允许重叠，调用方按 id 去重 §7.9） */
  since?: number
  until?: number
  /** 断点续放 */
  afterSeq?: number
  /** 缺省 1000，硬上限 10000 */
  limit?: number
}

/** 死信记录（platform_event_dead_letters 行的内存形态，§4.3） */
export interface DeadLetter {
  id: string
  consumerName: string
  userScope: string
  eventSeq: number
  /** 事件快照（事件被归档清理后仍可排查） */
  event: PlatformEvent
  error: string | null
  attempts: number
  firstFailedAt: number
  lastFailedAt: number
  status: 'pending' | 'requeued' | 'discarded'
  createdAt: number
}

/**
 * 事件总线（§5.1）。实现：src/core/services/event-system/event-bus.service.ts
 */
export interface EventBus {
  /**
   * 写库（分配全局 seq）→ 提交后进程内分发。
   * 基础设施故障（DB 写失败等）绝不抛给业务主流程，返回 null（safePublish 语义）；
   * 载荷违规（密钥键名 / 超 64KB / 缺 type 等生产者 bug）fail-fast 抛错（§8）。
   */
  publish<P>(input: PublishInput<P>, opts?: PublishOptions): Promise<PlatformEvent<P> | null>
  subscribe(filter: SubscriptionFilter, handler: EventHandler, opts?: SubscribeOptions): Subscription
  replay(query: ReplayQuery): AsyncIterable<PlatformEvent>
  /** LAN 预留：远端事件入库（保留原 id 去重，分配本地 seq） */
  ingest<P>(event: Omit<PlatformEvent<P>, 'seq'>): Promise<'stored' | 'duplicate'>
}

/** 投递通道类别（§5.4；M1 已实现 inproc/ipc/ws，sse 平台化与 lan 属后续批次） */
export type ChannelKind = 'inproc' | 'ipc' | 'ws' | 'sse' | 'lan'

/** 投递通道抽象（§5.4） */
export interface EventChannel {
  readonly kind: ChannelKind
  /** bus 启动时挂接；通道内部自行决定订阅哪些事件 */
  start(bus: EventBus): void
  stop(): void
}

/** 运维 API（§5.3；实现：src/core/services/event-system/event-admin.service.ts） */
export interface EventAdmin {
  listDeadLetters(filter: {
    consumerName?: string
    status?: 'pending' | 'requeued' | 'discarded'
  }): Promise<DeadLetter[]>
  /** 重新投递：事件仍在库 → 把该消费者游标回拨到 event_seq-1；已归档 → 直接重放入库（新 seq） */
  requeue(deadLetterId: string): Promise<void>
  discard(deadLetterId: string): Promise<void>
  consumerStats(): Promise<
    Array<{ consumerName: string; lastSeq: number; lag: number; retrying: boolean }>
  >
}
