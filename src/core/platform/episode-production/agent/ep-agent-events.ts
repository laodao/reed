/**
 * 剧集制作 Agent 事件推送
 * @module platform/episode-production/agent/ep-agent-events
 * channel: ep-agent:${projectId}:${episodeId}（无域全局会话）
 *          ep-agent:${projectId}:${episodeId}:${scope}（界面域会话——各界面独立订阅互不串扰）
 */

import { getEventEmitter } from '@core/interfaces/event.interface'
import type { EpAgentEvent } from './ep-agent.types'

export function epAgentEventChannel(projectId: string, episodeId: string, scope?: string): string {
  return scope ? `ep-agent:${projectId}:${episodeId}:${scope}` : `ep-agent:${projectId}:${episodeId}`
}

export function emitEpAgentEvent(
  projectId: string,
  episodeId: string,
  event: EpAgentEvent,
  scope?: string,
): void {
  getEventEmitter().emit(epAgentEventChannel(projectId, episodeId, scope), event)
}
