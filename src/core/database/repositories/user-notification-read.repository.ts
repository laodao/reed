/**
 * 通知已读状态仓库
 * @module core/database/repositories/user-notification-read.repository
 *
 * 维护 user_notification_reads 表：一行 = 当前用户对某条平台事件(seq)的已读标记。
 * 复合主键 (user_id, seq) 保证幂等——重复标记撞主键，用 orIgnore 吞掉并发。
 *
 * 多租户：userId 列由 BaseRepository 按 ALS 注入/过滤（§4.4 行级隔离）；
 * 写路径显式校验当前用户存在（通知是用户功能，绝不写无主行）。
 */

import type { DataSource } from 'typeorm'
import { UserNotificationReadEntity } from '../entities/user-notification-read.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('UserNotificationReadRepository')

export class UserNotificationReadRepository extends BaseRepository<
  UserNotificationReadEntity,
  UserNotificationReadEntity
> {
  constructor(dataSource: DataSource) {
    super(dataSource, UserNotificationReadEntity)
  }

  protected toDto(e: UserNotificationReadEntity): UserNotificationReadEntity {
    return e
  }

  /**
   * 读取当前用户全部已读 seq（通知列表标记已读 / 统计未读用）。
   * 走 scoped.qb：自动按 ALS userId 过滤（只见自己租户）。
   */
  async readSeqSet(): Promise<Set<number>> {
    const rows = await this.scoped
      .qb('r')
      .select('r.seq', 'seq')
      .getRawMany<{ seq: number | string }>()
    const set = new Set<number>()
    for (const row of rows) {
      set.add(Number(row.seq))
    }
    return set
  }

  /**
   * 标记一组 seq 已读（当前用户）。幂等：已读的跳过，重复标记撞主键被吞。
   * 返回本次新增的已读条数。
   */
  async markRead(seqs: number[]): Promise<number> {
    if (seqs.length === 0) return 0
    const userId = getCurrentUserId()
    if (!userId) {
      throw new Error('[UserNotificationReadRepository] 当前请求未设置 userId，无法标记已读')
    }
    const existing = await this.readSeqSet()
    const toInsert = Array.from(new Set(seqs)).filter((s) => !existing.has(s))
    if (toInsert.length === 0) return 0

    const now = new Date()
    const rows = toInsert.map((seq) => ({ userId, seq, readAt: now }))
    // orIgnore：SQLite 走 INSERT OR IGNORE、PG 走 ON CONFLICT DO NOTHING——并发重复标记幂等
    await this.repo
      .createQueryBuilder()
      .insert()
      .values(rows)
      .orIgnore()
      .execute()
    logger.debug(`[UserNotificationReadRepository] 标记已读 ${rows.length} 条`)
    return rows.length
  }

  /**
   * 全部标记已读（当前用户）。入参为当前用户通知类事件的 seq 全集，
   * 由 NotificationService 计算后传入；内部复用 markRead（幂等）。
   */
  async markAllRead(seqs: number[]): Promise<number> {
    return this.markRead(seqs)
  }
}
