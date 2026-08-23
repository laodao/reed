/**
 * Agent 事件推送
 * @module core/services/longwriting/agent/agent-events
 * channel: longwriting:agent:${projectId}
 */

import { getEventEmitter } from '@core/interfaces/event.interface'
import type { AgentEvent } from './agent.types'

export function emitAgentEvent(projectId: string, event: AgentEvent): void {
  getEventEmitter().emit(`longwriting:agent:${projectId}`, event)
}

export function agentEventChannel(projectId: string): string {
  return `longwriting:agent:${projectId}`
}
