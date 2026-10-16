/**
 * 领域学习事件通道名（三端唯一实现；2026-09-09 复盘收敛）
 * @module shared/utils/domain-learning-event
 *
 * 背景：`dl:agent:<spaceId>[:<conceptId>]` 与 `dl:generate:<eventId>` 曾在
 * 后端 types、宿主、preload、web channel-map 四处各写一遍，改名容易漏一处导致
 * 事件静默失灵。这里收敛为唯一实现，三端共用。
 */

/** Agent 动作级事件通道（conceptId 为空 = 空间级） */
export function dlAgentEventChannel(spaceId: string, conceptId?: string | null): string {
  return conceptId ? `dl:agent:${spaceId}:${conceptId}` : `dl:agent:${spaceId}`
}

/** 流式正文通道（按 summaryEventId 拼装回复外观） */
export function dlStreamChannel(summaryEventId: string): string {
  return `dl:generate:${summaryEventId}`
}
