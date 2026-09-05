/**
 * 剧集制作 Agent 事件推送
 * @module platform/episode-production/agent/ep-agent-events
 * channel: ep-agent:${projectId}:${episodeId}
 */

import { getEventEmitter } from '@core/interfaces/event.interface'
import type { EpAgentEvent } from './ep-agent.types'

export function epAgentEventChannel(projectId: string, episodeId: string): string {
  return `ep-agent:${projectId}:${episodeId}`
}

export function emitEpAgentEvent(
  projectId: string,
  episodeId: string,
  event: EpAgentEvent,
): void {
  getEventEmitter().emit(epAgentEventChannel(projectId, episodeId), event)
}
