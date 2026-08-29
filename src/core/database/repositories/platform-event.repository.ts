/**
 * 通用事件系统仓库
 * @module database/repositories/platform-event.repository
 *
 * 维护 platform_events / platform_event_cursors / platform_event_dead_letters 三表
 * （设计规格 tasks/2026-08-28-agent-loop-harness/10-event-system.md §4）。
 *
 * 多租户（§4.4）：
 * - platform_events 带 user_id 列，默认走 BaseRepository.scoped 行级隔离（ALS 注入/过滤）；
 * - cursors / dead_letters 无 user_id 列，租户语义由 user_scope 字段承担，
 *   scoped 对它们等同裸操作（基类按有无 userId 列自动判定）；
 * - ⚠️ dispatcher 扫表补偿是跨租户裸扫描（§4.4 既定例外流程）——安全性确认：
 *   扫描结果只投递给持有匹配订阅的消费者，投递前按消费者 user_scope 过滤，
 *   不向任何租户泄露其他租户事件。
 */

import { randomUUID } from 'node:crypto'
import { MoreThan, type DataSource, type EntityManager, type SelectQueryBuilder } from 'typeorm'
import type { PlatformEvent, ReplayQuery } from '@shared/types/event.types'
import {
  PlatformEventCursorEntity,
  PlatformEventDeadLetterEntity,
  PlatformEventEntity,
} from '../entities/platform-event.entities'
import { BaseRepository } from '../base-repository'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('PlatformEventRepository')

/** JSON 列安全解析（context 传实体定位信息，损坏可排查） */
function safeParse<T>(raw: string | null, fallback: T, context = ''): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    logger.warn(`[PlatformEventRepository] JSON 列解析失败（${context}），降级处理`)
    return fallback
  }
}

function toMs(d: Date | string | number | null | undefined): number {
  if (d == null) return 0
  if (d instanceof Date) return d.getTime()
  return new Date(d).getTime()
}

/** LIKE 前缀转义（事件名按规范不含 %/_，仍防御性转义） */
function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/[\\%_]/g, ch => `\\${ch}`)
}

export class PlatformEventRepository extends BaseRepository<PlatformEventEntity, PlatformEvent> {
  constructor(dataSource: DataSource) {
    super(dataSource, PlatformEventEntity)
  }

  protected toDto(e: PlatformEventEntity): PlatformEvent {
    return {
      seq: Number(e.seq),
      id: e.id,
      userId: e.userId ?? null,
      type: e.type,
      aggregate: { kind: e.aggregateKind, id: e.aggregateId },
      actor: { kind: e.actorKind as PlatformEvent['actor']['kind'], id: e.actorId ?? null },
      payload: safeParse<unknown>(e.payloadJson, null, `seq=${e.seq}.payload`),
      causationId: e.causationId ?? null,
      correlationId: e.correlationId ?? null,
      occurredAt: toMs(e.occurredAt),
      schemaVersion: e.schemaVersion,
    }
  }

  /** Entity → 信封（公开版，EventBus 投递/DLQ 快照用） */
  toPlatformEvent(e: PlatformEventEntity): PlatformEvent {
    return this.toDto(e)
  }

  // ─── platform_events ────────────────────────────────────────────────────

  /**
   * 发布落库（scoped：userId 由 ALS 快照注入，与调用方传入的 userId 一致）。
   * 返回带 seq 的实体。
   */
  async appendEvent(entity: Partial<PlatformEventEntity>): Promise<PlatformEventEntity> {
    return (await this.scoped.save(entity)) as PlatformEventEntity
  }

  /**
   * LAN ingest 落库（§5.1）：保留远端事件自带的 id / userId，不能用 scoped.save
   * （会被当前 ALS userId 覆盖）。安全性：ingest 契约本身就是跨进程写入，
   * userId 来自事件自身且仅用于后续按消费者 user_scope 的投递过滤。
   */
  async appendRemoteEvent(entity: Partial<PlatformEventEntity>): Promise<PlatformEventEntity> {
    return await this.repo.save(entity as PlatformEventEntity)
  }

  /** 按 seq 取单条（dispatcher 重试路径；跨租户裸读，仅用于已匹配消费者的重投） */
  async findBySeq(seq: number): Promise<PlatformEventEntity | null> {
    return await this.repo.findOne({ where: { seq } })
  }

  /** 当前最大 seq（无事件返回 0；命名消费者 startFrom='latest' 游标初始化用，§5.2） */
  async getMaxSeq(): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('e')
      .select('MAX(e.seq)', 'maxSeq')
      .getRawOne<{ maxSeq: number | string | null }>()
    return row?.maxSeq == null ? 0 : Number(row.maxSeq)
  }

  /**
   * 统计 seq > afterSeq 且命中消费者作用域的事件数（EventAdmin.consumerStats 的 lag）。
   * 与 scanAfterSeq 同口径的跨租户裸扫描（§4.4 既定例外，仅计数不外泄事件内容）。
   */
  async countEventsAfterSeq(afterSeq: number, userScope: string): Promise<number> {
    return await this.repo.count({
      where: {
        seq: MoreThan(afterSeq),
        ...(userScope === '*' ? {} : { userId: userScope }),
      },
    })
  }

  /**
   * dispatcher 扫表补偿（§6.3，跨租户裸扫描，§4.4 既定例外，安全性见文件头）：
   * seq > afterSeq 且命中消费者作用域（userScope='*' 系统级可见全部）的下一批事件。
   */
  async scanAfterSeq(
    afterSeq: number,
    userScope: string,
    limit: number
  ): Promise<PlatformEventEntity[]> {
    return await this.repo.find({
      where: {
        seq: MoreThan(afterSeq),
        ...(userScope === '*' ? {} : { userId: userScope }),
      },
      order: { seq: 'ASC' },
      take: limit,
    })
  }

  /**
   * 重放查询（§5.2；scoped.qb 自动按 ALS userId 过滤——订阅方默认只见自己租户）。
   * 类型模式：'*' 全量；'前缀*' LIKE 前缀；其余全等（与订阅匹配规则一致）。
   * occurred_at 时间窗为闭区间（§7.9 允许边界重叠，调用方按 id 去重）。
   */
  async replayBatch(
    query: ReplayQuery,
    afterSeqExclusive: number,
    limit: number
  ): Promise<PlatformEventEntity[]> {
    // 注意：必须用 andWhere——scoped.qb 已注入租户条件，.where() 会清空既有 wheres（TypeORM 语义）
    const qb = this.scoped.qb('e').andWhere('e.seq > :afterSeq', { afterSeq: afterSeqExclusive })
    applyTypeCondition(qb, query.types)
    if (query.aggregate?.kind) {
      qb.andWhere('e.aggregate_kind = :aggKind', { aggKind: query.aggregate.kind })
    }
    if (query.aggregate?.id) {
      qb.andWhere('e.aggregate_id = :aggId', { aggId: query.aggregate.id })
    }
    if (query.since !== undefined) {
      qb.andWhere('e.occurred_at >= :since', { since: new Date(query.since) })
    }
    if (query.until !== undefined) {
      qb.andWhere('e.occurred_at <= :until', { until: new Date(query.until) })
    }
    return await qb.orderBy('e.seq', 'ASC').take(limit).getMany()
  }

  /**
   * 归档候选扫描（§7.10，系统级作业跨租户裸扫描，§4.4 既定例外——只导出/删除，
   * 不向任何租户泄露内容）：seq < beforeSeqExclusive 且 occurred_at < occurredBefore
   * 且类型不命中全量保留模式（§12.2：人工/挂起类 workflow.run.review-* 等）。
   */
  async findArchivableEvents(
    beforeSeqExclusive: number,
    occurredBefore: Date,
    keepForeverPatterns: string[],
    limit: number
  ): Promise<PlatformEventEntity[]> {
    const qb = this.repo
      .createQueryBuilder('e')
      .where('e.seq < :bound', { bound: beforeSeqExclusive })
      .andWhere('e.occurred_at < :cutoff', { cutoff: occurredBefore })
    if (keepForeverPatterns.length > 0) {
      const conds: string[] = []
      const params: Record<string, unknown> = {}
      keepForeverPatterns.forEach((p, i) => {
        if (p === '*') {
          conds.push('1=1')
          return
        }
        if (p.endsWith('*')) {
          conds.push(`e.type LIKE :kf${i} ESCAPE '\\'`)
          params[`kf${i}`] = escapeLikePrefix(p.slice(0, -1)) + '%'
          return
        }
        conds.push(`e.type = :kf${i}`)
        params[`kf${i}`] = p
      })
      qb.andWhere(`NOT (${conds.join(' OR ')})`, params)
    }
    return await qb.orderBy('e.seq', 'ASC').take(limit).getMany()
  }

  /**
   * 归档删除（§6.1 archived）。manager 透传走事务（与游标下界重读同事务，§7.10）。
   * 返回实际删除行数。
   */
  async deleteEventsBySeqs(seqs: number[], manager?: EntityManager): Promise<number> {
    if (seqs.length === 0) return 0
    const result = await (manager ?? this.dataSource)
      .createQueryBuilder()
      .delete()
      .from(PlatformEventEntity)
      .where('seq IN (:...seqs)', { seqs })
      .execute()
    return result.affected ?? seqs.length
  }

  // ─── platform_event_cursors（无 userId 列，scoped 等同裸操作） ────────────

  private get cursorRepo() {
    return this.dataSource.getRepository(PlatformEventCursorEntity)
  }

  async getCursor(
    consumerName: string,
    userScope: string
  ): Promise<PlatformEventCursorEntity | null> {
    return await this.cursorRepo.findOne({ where: { consumerName, userScope } })
  }

  /**
   * 建/续游标（唯一键 uq_pec_consumer 兜底并发重复建）。
   * initialLastSeq：仅新建时生效的起始位（startFrom='latest' 传当前最大 seq，
   * 避免新消费者重放全部历史，§5.2 startFrom 语义）；续跑忽略。
   */
  async ensureCursor(
    consumerName: string,
    userScope: string,
    initialLastSeq = 0
  ): Promise<PlatformEventCursorEntity> {
    const existing = await this.getCursor(consumerName, userScope)
    if (existing) return existing
    try {
      return await this.cursorRepo.save({
        id: generateUuid(),
        consumerName,
        userScope,
        lastSeq: initialLastSeq,
        retryingSeq: null,
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
        updatedAt: new Date(),
      } as Partial<PlatformEventCursorEntity>)
    } catch (e) {
      // 并发建游标撞唯一键 → 读已有行（单实例假设下几乎不触发，§7.11）
      const raced = await this.getCursor(consumerName, userScope)
      if (raced) return raced
      throw e
    }
  }

  /**
   * 管理面回拨游标（EventAdmin.requeue 的"事件仍在库"分支，§5.3）：
   * 故意打破"单调不退"——运维显式重投死信事件；同时清重试态。
   * 游标不存在时按 newLastSeq 新建（消费者下次订阅/boot 时从该位续扫）。
   */
  async rewindCursor(
    consumerName: string,
    userScope: string,
    newLastSeq: number
  ): Promise<void> {
    const result = await this.cursorRepo
      .createQueryBuilder()
      .update()
      .set({
        lastSeq: newLastSeq,
        retryingSeq: null,
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where('consumer_name = :name', { name: consumerName })
      .andWhere('user_scope = :scope', { scope: userScope })
      .execute()
    if ((result.affected ?? 0) === 0) {
      await this.ensureCursor(consumerName, userScope, newLastSeq)
    }
  }

  /**
   * ack：handler 成功后游标前移（§5.5）。
   * 乐观条件 WHERE last_seq < newSeq 防多实例/并发回拨（§7.11）；单调不退。
   */
  async ackAdvance(consumerName: string, userScope: string, seq: number): Promise<void> {
    await this.cursorRepo
      .createQueryBuilder()
      .update()
      .set({
        lastSeq: seq,
        retryingSeq: null,
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where('consumer_name = :name', { name: consumerName })
      .andWhere('user_scope = :scope', { scope: userScope })
      .andWhere('last_seq < :seq', { seq })
      .execute()
  }

  /**
   * 失败进入/推进重试态（§6.1 游标状态迁移）。
   * skipToSeq：本次扫描中失败事件之前已跳过（不匹配订阅）的最大 seq，随失败一并前推，
   * 避免毒消息反复回扫前面的无关事件。
   */
  async markRetrying(
    consumerName: string,
    userScope: string,
    retryingSeq: number,
    skipToSeq: number | null,
    retryCount: number,
    nextRetryAt: Date,
    error: string
  ): Promise<void> {
    const qb = this.cursorRepo
      .createQueryBuilder()
      .update()
      .set({
        retryingSeq,
        retryCount,
        nextRetryAt,
        lastError: error,
        updatedAt: new Date(),
      })
      .where('consumer_name = :name', { name: consumerName })
      .andWhere('user_scope = :scope', { scope: userScope })
    if (skipToSeq !== null) {
      qb.set({ lastSeq: skipToSeq } as Partial<PlatformEventCursorEntity>)
    }
    await qb.execute()
  }

  /** 死信收口：清重试态 + 游标跳过该 seq 前移（毒消息不阻塞后续事件，§7.4） */
  async markDeadAdvance(consumerName: string, userScope: string, seq: number): Promise<void> {
    await this.cursorRepo
      .createQueryBuilder()
      .update()
      .set({
        lastSeq: seq,
        retryingSeq: null,
        retryCount: 0,
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where('consumer_name = :name', { name: consumerName })
      .andWhere('user_scope = :scope', { scope: userScope })
      .andWhere('last_seq < :seq', { seq })
      .execute()
  }

  async listCursors(): Promise<PlatformEventCursorEntity[]> {
    return await this.cursorRepo.find()
  }

  /**
   * 全部游标的最小 last_seq（归档安全上界，§7.10）。
   * 无任何游标返回 null——调用方（归档作业）保守处理：不归档
   * （未来 startFrom='earliest' 的新消费者可能依赖历史事件）。
   * manager 透传用于"导出后删除前同事务重读下界"的竞态守卫（§7.10）。
   */
  async getMinCursorLastSeq(manager?: EntityManager): Promise<number | null> {
    const repo = manager ? manager.getRepository(PlatformEventCursorEntity) : this.cursorRepo
    const row = await repo
      .createQueryBuilder('c')
      .select('MIN(c.lastSeq)', 'minSeq')
      .getRawOne<{ minSeq: number | string | null }>()
    return row?.minSeq == null ? null : Number(row.minSeq)
  }

  // ─── platform_event_dead_letters ─────────────────────────────────────────

  async insertDeadLetter(
    entity: Partial<PlatformEventDeadLetterEntity>
  ): Promise<PlatformEventDeadLetterEntity> {
    return await this.dataSource.getRepository(PlatformEventDeadLetterEntity).save(entity)
  }

  async listDeadLetters(consumerName?: string): Promise<PlatformEventDeadLetterEntity[]> {
    return await this.dataSource.getRepository(PlatformEventDeadLetterEntity).find({
      where: consumerName ? { consumerName } : {},
      order: { createdAt: 'ASC' },
    })
  }

  /** 按 id 取死信（EventAdmin.requeue/discard 用） */
  async findDeadLetterById(id: string): Promise<PlatformEventDeadLetterEntity | null> {
    return await this.dataSource.getRepository(PlatformEventDeadLetterEntity).findOne({
      where: { id },
    })
  }

  /** 死信状态迁移（pending → requeued / discarded，§5.3 人工收口） */
  async updateDeadLetterStatus(
    id: string,
    status: 'pending' | 'requeued' | 'discarded'
  ): Promise<void> {
    await this.dataSource.getRepository(PlatformEventDeadLetterEntity).update(id, { status })
  }
}

/** 把订阅/重放的类型模式翻译成 SQL 条件（'*' / '前缀*' / 全等，OR 关系） */
function applyTypeCondition(
  qb: SelectQueryBuilder<PlatformEventEntity>,
  types: string[] | undefined
): void {
  if (!types || types.length === 0) return
  const conds: string[] = []
  const params: Record<string, unknown> = {}
  types.forEach((t, i) => {
    if (t === '*') {
      conds.push('1=1')
      return
    }
    if (t.endsWith('*')) {
      conds.push(`e.type LIKE :rt${i} ESCAPE '\\'`)
      params[`rt${i}`] = escapeLikePrefix(t.slice(0, -1)) + '%'
      return
    }
    conds.push(`e.type = :rt${i}`)
    params[`rt${i}`] = t
  })
  qb.andWhere(`(${conds.join(' OR ')})`, params)
}

function generateUuid(): string {
  // node:crypto 而非 globalThis.crypto——Electron 主进程未暴露 WebCrypto 全局（M1 收尾实测踩坑）
  return randomUUID()
}
