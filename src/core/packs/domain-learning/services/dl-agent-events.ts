/**
 * 领域学习 Agent 事件面
 * @module packs/domain-learning/services/dl-agent-events
 *
 * 事件通道与 EP/LW 对齐：动作级事件走业务通道（dl:agent:<spaceId>[:<conceptId>]，
 * 经 getEventEmitter().tapEvents 由宿主回收集成），reply 流式正文走
 * dl:generate:<eventId>（前端拼接为对话外观）。前端事件契约见 dl-agent.types。
 */

import { getEventEmitter } from '@core/interfaces/event.interface'
import { dlAgentEventChannel, type DlAgentEvent } from './dl-agent.types'

/** 发动作级事件（stage/reply:start/action:done/error…） */
export function emitDlAgentEvent(
  spaceId: string,
  conceptId: string | null | undefined,
  event: DlAgentEvent,
): void {
  getEventEmitter().emit(dlAgentEventChannel(spaceId, conceptId), event)
}

/** 流式正文（reply 增量；前端按 summaryEventId 拼装） */
export function emitDlStream(summaryEventId: string, text: string): void {
  getEventEmitter().emit(`dl:generate:${summaryEventId}`, { type: 'content', content: text })
}
