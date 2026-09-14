/**
 * 事件系统参数默认值 / 硬上限（事件总线 + 归档作业）
 * @module shared/types/event-params.types
 *
 * ── 为什么这些要开放 ──
 * 事件总线与归档作业都是**进程级单例**，它们的行为参数（重试几次、多久扫一次表、在途上限、
 * 事件保留多久）此前写死在 `event-bus.service.ts` / `event-archive.service.ts`。
 * 默认值偏保守：事件堆积时用户既看不到也调不了"扫表批量/在途上限"，而归档保留 90 天
 * 对"只想留一个月"的用户又太长。
 *
 * ── 生效时机 ──
 * 这两个单例在**启动时装配**（读的就是这里的值），因此归入设置页时必须如实标注
 * **改动需重启客户端**——这正是登记表里 `effect: 'restart'` 的用途。
 */

/** 事件总线 */
export interface EventBusSettingsParams {
  /** 单条事件最大投递尝试次数（含首次） */
  maxAttempts: number
  /** 兜底扫表间隔（毫秒；补偿崩溃窗口漏投） */
  sweepIntervalMs: number
  /** 单次扫表批量 */
  scanBatchSize: number
  /** 命名消费者在途上限 */
  maxInFlight: number
  /** 匿名订阅在途上限 */
  maxAnonymousInFlight: number
}

/** 事件归档作业 */
export interface EventArchiveSettingsParams {
  /** 通用保留天数（人工决策类事件永不归档） */
  retentionDays: number
  /** 归档作业间隔（毫秒） */
  intervalMs: number
  /** 单批导出/删除大小 */
  batchSize: number
}

/** 事件系统运行参数（分组） */
export interface EventRuntimeParams {
  bus: EventBusSettingsParams
  archive: EventArchiveSettingsParams
}

/** 内置默认值（= 改造前写死在各自模块里的常量） */
export const EVENT_PARAMS_DEFAULTS: EventRuntimeParams = {
  bus: {
    maxAttempts: 5, // DEFAULT_MAX_ATTEMPTS
    sweepIntervalMs: 2_000, // DEFAULT_SWEEP_INTERVAL_MS
    scanBatchSize: 200, // DEFAULT_SCAN_BATCH_SIZE
    maxInFlight: 1_000, // DEFAULT_MAX_IN_FLIGHT
    maxAnonymousInFlight: 1_000, // DEFAULT_ANONYMOUS_MAX_IN_FLIGHT
  },
  archive: {
    retentionDays: 90, // DEFAULT_EVENT_RETENTION_DAYS
    intervalMs: 24 * 60 * 60 * 1000, // DEFAULT_ARCHIVE_INTERVAL_MS
    batchSize: 1_000, // DEFAULT_ARCHIVE_BATCH_SIZE
  },
}

/** 代码级硬上限（配置值一律夹到这里） */
export const EVENT_PARAMS_LIMITS: EventRuntimeParams = {
  bus: {
    maxAttempts: 20,
    sweepIntervalMs: 60_000,
    scanBatchSize: 5_000,
    maxInFlight: 20_000,
    maxAnonymousInFlight: 20_000,
  },
  archive: {
    retentionDays: 3_650,
    intervalMs: 7 * 24 * 60 * 60 * 1000,
    batchSize: 20_000,
  },
}
