/**
 * 故事研讨室事件出口（v2.1 M2）
 * @module core/packs/longwriting/story-room/room-events
 *
 * 单一事件通道 `longwriting:room:{projectId}`，承载 message:delta / ledger:update /
 * card:ready / phase:changed / gate:suggest / error（设计文档 §9 v2.1 修订：
 * 流式正文直接走本通道，不复用 longwriting:generate 二次订阅）。
 */

import { getEventEmitter } from '@core/interfaces/event.interface'
import { createLogger } from '@core/utils/logger'
import type { RoomEvent } from '@shared/types/story-room.types'

const logger = createLogger('StoryRoomEvents')

export const ROOM_EVENT_PREFIX = 'longwriting:room:'

export function roomEventChannel(projectId: string): string {
  return `${ROOM_EVENT_PREFIX}${projectId}`
}

/** 事件发射永不抛错（观测面失败不影响主链路） */
export function emitRoomEvent(projectId: string, event: RoomEvent): void {
  try {
    getEventEmitter().emit(roomEventChannel(projectId), event)
  } catch (e) {
    logger.warn(`[story-room] 事件发射失败 project=${projectId} type=${(event as any)?.type}`, e)
  }
}
