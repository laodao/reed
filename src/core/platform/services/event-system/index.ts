/**
 * 通用事件系统（Platform Event System）
 * @module core/platform/services/event-system
 * @description 设计规格：tasks/2026-08-28-agent-loop-harness/10-event-system.md。
 *              平台级公共底座（非工作流引擎私有）。M1 核心：publish/subscribe/replay/ingest +
 *              inproc dispatcher（扫表补偿 + 兜底扫描 + 退避/DLQ）。
 */

export { PlatformEventBus, getEventBus, getEventBusIfReady, stopEventBus } from './event-bus.service'
export type { EventBusDriverOptions } from './event-bus.service'
export { matchTypePattern, matchesFilter } from './event-matcher'
export {
  EventPayloadError,
  MAX_PAYLOAD_BYTES,
  SECRET_KEY_PATTERN,
  assertPayloadSafe,
} from './payload-guard'
export {
  DEFAULT_RUN_EVENT_CHANNEL_TYPES,
  WORKFLOW_RUN_AGGREGATE_KIND,
  WORKFLOW_RUN_EVENT_TYPE_MAP,
  toRunPlatformEventType,
  toWorkflowRunEventType,
  translateRunPlatformEvent,
} from './workflow-run-event-map'
export { createWorkflowRunEventProducer } from './workflow-run-producer'
export { createPlatformEventProducer } from './event-producer'
export type { PlatformEventProducer, PublishHandlers, PlatformBusPortLike } from './event-producer'
export type { WorkflowRunProducerOptions } from './workflow-run-producer'
export { IpcEventChannel } from './channels/ipc.channel'
export { WsEventChannel } from './channels/ws.channel'
export { PlatformEventAdmin, getEventAdmin, resetEventAdmin } from './event-admin.service'
export { createRunEventStream } from './run-event-stream'
export type { RunEventStreamSource } from './run-event-stream'
export {
  DEFAULT_EVENT_RATE_LIMITS,
  DEFAULT_EVENT_RATE_LIMIT_WINDOW_MS,
  EventRateLimiter,
  RATE_LIMITED_EVENT_TYPE,
} from './event-rate-limit'
export type { EventRateLimitRule } from './event-rate-limit'
export {
  DEFAULT_EVENT_RETENTION_DAYS,
  DEFAULT_KEEP_FOREVER_PATTERNS,
  EventArchiveService,
  startEventArchiveJob,
  stopEventArchiveJob,
} from './event-archive.service'
export type { EventArchiveOptions, EventArchiveSummary } from './event-archive.service'
