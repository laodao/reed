/**
 * 领域学习平台通知发布（M4-A P1-5）
 * @module packs/domain-learning/services/dl-notice
 *
 * 直接写 platform_events（类型进 NotificationService 白名单即可进铃铛）。
 * fire-and-forget：发布失败仅 warn，不影响业务主流程；无 ALS 时取默认用户（Electron）。
 * 路由统一进 /domain-learning/:spaceId（铃铛点击直达空间页）。
 */

import { randomUUID } from 'crypto'
import { createLogger } from '@core/utils/logger'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getCurrentUserId } from '@core/context/user-context'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'

const logger = createLogger('DlNotice')

export type DlNoticeType = 'dl:card-ready' | 'dl:research-failed' | 'dl:review-due'

export interface DlNoticePayload {
  spaceId: string
  spaceName?: string
  conceptName?: string
}

export async function dlPublishNotice(type: DlNoticeType, payload: DlNoticePayload): Promise<void> {
  try {
    const m = getCoreDatabaseManager()
    if (!m.dataSource) return
    const repo = new PlatformEventRepository(m.dataSource)
    const now = new Date()
    await repo.appendEvent({
      id: randomUUID(),
      userId: getCurrentUserId() ?? null,
      type,
      aggregateKind: 'dl_space',
      aggregateId: payload.spaceId,
      actorKind: 'system',
      actorId: null,
      payloadJson: JSON.stringify({
        spaceId: payload.spaceId,
        spaceName: payload.spaceName ?? null,
        conceptName: payload.conceptName ?? null,
      }),
      occurredAt: now,
      createdAt: now,
      schemaVersion: 1,
    } as never)
  } catch (e) {
    logger.warn(`[dl-notice] 发布 ${type} 失败（不影响主流程）：${e instanceof Error ? e.message : String(e)}`)
  }
}
