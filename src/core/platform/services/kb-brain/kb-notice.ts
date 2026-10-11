/**
 * 知识大脑通知发布（弹窗超时关闭后的可回看保障）
 * @module platform/services/kb-brain/kb-notice
 *
 * 背景需求：通知弹窗改为"超时自动关闭"后，凡是"待办/有产物"的消息必须保证
 * 用户漏看后仍能找回——否则关了弹窗就真的"找不到产物"了。
 *
 * 做法与 dl-notice 一致：直接写 platform_events（类型进 NotificationService 白名单
 * 即自动进顶栏铃铛）。fire-and-forget：发布失败仅 warn，不影响提炼主流程。
 */

import { randomUUID } from 'crypto'
import { createLogger } from '@core/utils/logger'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getCurrentUserId } from '@core/context/user-context'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'

const logger = createLogger('KbNotice')

/** 知识大脑通知类型（与 NotificationService 白名单保持一致） */
export type KbNoticeType =
  | 'kb:brain:goal-proposed'
  | 'kb:brain:goal-duplicate'
  | 'kb:brain:goal-empty'

export interface KbNoticePayload {
  /** 知识库 id（铃铛点击直达该库大脑面板） */
  kbId: string
  /** 提取目标名称 */
  goalName: string
  /** 生成经验卡数（proposed 时） */
  cards?: number
  /** 收集素材数 */
  fragments?: number
}

/**
 * 发布知识大脑通知（写平台事件 → 通知中心铃铛可见）。
 * 失败不抛出：通知属于旁路，不能拖垮提炼主流程。
 */
export async function kbPublishNotice(type: KbNoticeType, payload: KbNoticePayload): Promise<void> {
  try {
    const m = getCoreDatabaseManager()
    if (!m.dataSource) return
    const repo = new PlatformEventRepository(m.dataSource)
    const now = new Date()
    await repo.appendEvent({
      id: randomUUID(),
      userId: getCurrentUserId() ?? null,
      type,
      aggregateKind: 'kb',
      aggregateId: payload.kbId,
      actorKind: 'system',
      actorId: null,
      payloadJson: JSON.stringify({
        kbId: payload.kbId,
        goalName: payload.goalName,
        cards: payload.cards ?? null,
        fragments: payload.fragments ?? null,
      }),
      occurredAt: now,
      createdAt: now,
      schemaVersion: 1,
    } as never)
  } catch (e) {
    logger.warn(
      `[kb-notice] 发布 ${type} 失败（不影响主流程）：${e instanceof Error ? e.message : String(e)}`
    )
  }
}