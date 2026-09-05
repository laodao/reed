/**
 * 平台事件运维 API（EventAdmin，§5.3）
 * @module core/services/event-system/event-admin.service
 * @description 死信队列人工收口 + 消费者观测：
 *              - listDeadLetters：按消费者/状态过滤，事件快照解析回信封（归档后仍可排查）
 *              - requeue：事件仍在库 → 该消费者游标回拨 event_seq-1（清重试态）并触发追赶；
 *                已归档（event_seq 行不存在）→ 按 DLQ 快照重放入库（ingest 保留原 id，分配新 seq）
 *              - discard：标记 discarded（仅 pending 可操作，已收口幂等拒绝）
 *              - consumerStats：游标水位 + lag（未消费事件数）+ 重试中标记
 *
 *              安全（§8 管理面）：本服务只注册到鉴权 IPC/REST——Electron 走
 *              event-admin.handler（ipcBridge），Web 经 POST /api/ipc/<channel>
 *              自动过 requireAuth（ipc-router.ts 全局鉴权）。
 *              requeue/discard 是跨租户的运维操作（DLQ 表按 user_scope 记账），
 *              与 dispatcher 扫表同属 §4.4 既定例外，仅暴露给管理面。
 */

import type { DataSource } from 'typeorm'
import type { DeadLetter, EventAdmin, PlatformEvent } from '@shared/types/event.types'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'
import type { PlatformEventDeadLetterEntity } from '@core/database/entities/platform-event.entities'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import { getEventBusIfReady, type PlatformEventBus } from './event-bus.service'

const logger = createLogger('PlatformEventAdmin')

function toMs(d: Date | string | number | null | undefined): number {
  if (d == null) return 0
  if (d instanceof Date) return d.getTime()
  return new Date(d).getTime()
}

/** DLQ 行 → DeadLetter DTO（eventJson 解析失败降级 null 载荷，行仍可列/可操作） */
function toDeadLetter(e: PlatformEventDeadLetterEntity): DeadLetter {
  let event: PlatformEvent
  try {
    event = JSON.parse(e.eventJson) as PlatformEvent
  } catch {
    logger.warn(`[EventAdmin] 死信事件快照解析失败（id=${e.id}），载荷降级 null`)
    event = {
      seq: e.eventSeq,
      id: '',
      userId: null,
      type: '',
      aggregate: { kind: '', id: '' },
      actor: { kind: 'system', id: null },
      payload: null,
      causationId: null,
      correlationId: null,
      occurredAt: 0,
      schemaVersion: 1,
    }
  }
  return {
    id: e.id,
    consumerName: e.consumerName,
    userScope: e.userScope,
    eventSeq: e.eventSeq,
    event,
    error: e.error ?? null,
    attempts: e.attempts,
    firstFailedAt: toMs(e.firstFailedAt),
    lastFailedAt: toMs(e.lastFailedAt),
    status: e.status as DeadLetter['status'],
    createdAt: toMs(e.createdAt),
  }
}

export class PlatformEventAdmin implements EventAdmin {
  private readonly repo: PlatformEventRepository

  constructor(
    dataSource: DataSource,
    /** 总线访问器（重放入库 / 回拨后触发追赶用；总线未就绪时 rewind 分支仍可落游标） */
    private readonly getBus: () => PlatformEventBus | null = getEventBusIfReady
  ) {
    this.repo = new PlatformEventRepository(dataSource)
  }

  async listDeadLetters(filter: {
    consumerName?: string
    status?: 'pending' | 'requeued' | 'discarded'
  }): Promise<DeadLetter[]> {
    const rows = await this.repo.listDeadLetters(filter.consumerName)
    return rows
      .filter(r => (filter.status ? r.status === filter.status : true))
      .map(toDeadLetter)
  }

  /**
   * 重新投递（§5.3）：
   * - 事件仍在库：游标回拨到 event_seq-1 → dispatcher 按游标重扫重投（含该 seq 之后
   *   已跳过/已处理的事件——at-least-once 语义下由消费者幂等约定兜底，§5.5）；
   * - 已归档（行不存在）：按 DLQ 事件快照重放入库（保留原 id 去重键，分配新 seq），
   *   走 ingest 正常分发路径——所有匹配消费者都会看到这条"新"事件。
   */
  async requeue(deadLetterId: string): Promise<void> {
    const dl = await this.repo.findDeadLetterById(deadLetterId)
    if (!dl) throw new Error(`死信不存在：${deadLetterId}`)
    if (dl.status !== 'pending') {
      throw new Error(`死信已收口（status=${dl.status}），不可重复操作`)
    }

    const entity = await this.repo.findBySeq(dl.eventSeq)
    if (entity) {
      // 事件仍在库 → 游标回拨（rewind 是运维显式动作，故意打破 last_seq 单调不退）
      await this.repo.rewindCursor(dl.consumerName, dl.userScope, dl.eventSeq - 1)
      this.getBus()?.kickConsumer(dl.consumerName, dl.userScope)
      logger.info(
        `[EventAdmin] 死信重投递（游标回拨）：consumer=${dl.consumerName} seq=${dl.eventSeq}`
      )
    } else {
      // 事件已归档清理 → 按快照重放入库（§5.3 重放分支 / §7.10 竞态收口）
      const bus = this.getBus()
      if (!bus) throw new Error('事件已归档且事件总线未就绪，无法重放入库')
      const snapshot = JSON.parse(dl.eventJson) as Omit<PlatformEvent, 'seq'>
      const result = await bus.ingest({
        ...snapshot,
        // 归档重放不保留原 occurredAt 以外的任何存储位；seq 由本地重新分配（ingest 契约）
        occurredAt: snapshot.occurredAt || Date.now(),
      })
      // 快照 id 理论上已随归档删除；若竟仍占用（归档半截），视为重复入库失败
      if (result === 'duplicate') {
        throw new Error(`事件快照 id 已在库（ingest 去重命中），请人工核查：${snapshot.id}`)
      }
      logger.info(
        `[EventAdmin] 死信重投递（归档重放入库）：consumer=${dl.consumerName} 原 seq=${dl.eventSeq}`
      )
    }
    await this.repo.updateDeadLetterStatus(deadLetterId, 'requeued')
  }

  async discard(deadLetterId: string): Promise<void> {
    const dl = await this.repo.findDeadLetterById(deadLetterId)
    if (!dl) throw new Error(`死信不存在：${deadLetterId}`)
    if (dl.status !== 'pending') {
      throw new Error(`死信已收口（status=${dl.status}），不可重复操作`)
    }
    await this.repo.updateDeadLetterStatus(deadLetterId, 'discarded')
    logger.info(`[EventAdmin] 死信已丢弃：consumer=${dl.consumerName} seq=${dl.eventSeq}`)
  }

  /** 消费者水位：lag = 该消费者作用域内 seq > last_seq 的事件数（与扫表同口径） */
  async consumerStats(): Promise<
    Array<{ consumerName: string; lastSeq: number; lag: number; retrying: boolean }>
  > {
    const cursors = await this.repo.listCursors()
    const stats = await Promise.all(
      cursors.map(async c => ({
        consumerName: c.consumerName,
        lastSeq: Number(c.lastSeq),
        lag: await this.repo.countEventsAfterSeq(Number(c.lastSeq), c.userScope),
        retrying: c.retryingSeq != null,
      }))
    )
    return stats.sort((a, b) => a.consumerName.localeCompare(b.consumerName))
  }
}

// ─── 单例（管理面 IPC/REST 取用；惰性——数据源未就绪返回 null） ────────────────

let adminSingleton: PlatformEventAdmin | null = null

/** 获取 EventAdmin 单例；数据源未就绪（boot 早期/无库测试）返回 null，调用方据此报可读错误 */
export function getEventAdmin(): PlatformEventAdmin | null {
  if (adminSingleton) return adminSingleton
  const ds = getCoreDatabaseManager().dataSource
  if (!ds) return null
  adminSingleton = new PlatformEventAdmin(ds)
  return adminSingleton
}

/** 关停单例（应用退出/测试用） */
export function resetEventAdmin(): void {
  adminSingleton = null
}
