/**
 * 工作流领域事件总线（进程内 pub/sub + 平台事件系统适配器）
 * @module core/modules/workflow/trigger/domain-event-bus
 * @description 与 IEventEmitter（前端推送，单向广播）完全独立的进程内订阅机制，
 *              供"事件触发器"消费系统领域事件（kb 入库完成/图像完成/翻译完成…）。
 *
 *              - publish 自动捕获发布时的 ALS userId（同租户匹配依据）
 *              - 源服务埋点统一走 safePublish（try/catch，绝不影响主流程）
 *              - 订阅方（片6 事件触发器）按 userId === 定义所属用户过滤
 *
 *              M1 适配（10-event-system §9 触发器行）：publishDomainEvent 保留签名，
 *              存量进程内同步分发不变（触发器等订阅方零改动），同时转发到平台事件总线
 *              bus.publish 落库持久化（at-least-once 游标消费/重放能力的载体）。
 *              平台总线未启动（boot 早期/测试无库）时静默跳过，行为与存量纯内存等价。
 */

import { EventEmitter } from 'events'
import { getCurrentUserId } from '@core/context/user-context'
import { getEventBusIfReady } from '@core/services/event-system/event-bus.service'

export interface DomainEvent {
  name: string
  userId: string | null
  payload: Record<string, unknown>
  occurredAt: number
}

/** 事件总线监听上限（量级假设见构造内注释） */
const EVENT_BUS_MAX_LISTENERS = 50
/** 总线内部事件名（publish/subscribe 同文件唯一写法） */
const BUS_EVENT = 'event'

class WorkflowDomainEventBus {
  private emitter = new EventEmitter()

  constructor() {
    // 监听上限：当前订阅方仅调度器 1 个；预留给多模块订阅（超限 Node 告警而非静默漏收）
    this.emitter.setMaxListeners(EVENT_BUS_MAX_LISTENERS)
  }

  publish(name: string, payload: Record<string, unknown>): void {
    const event: DomainEvent = {
      name,
      userId: getCurrentUserId(),
      payload,
      occurredAt: Date.now(),
    }
    this.emitter.emit(BUS_EVENT, event)
  }

  subscribe(handler: (event: DomainEvent) => void): () => void {
    this.emitter.on(BUS_EVENT, handler)
    return () => this.emitter.off(BUS_EVENT, handler)
  }
}

const globalBus = globalThis as unknown as { __wfDomainEventBus?: WorkflowDomainEventBus }
const bus = (globalBus.__wfDomainEventBus ??= new WorkflowDomainEventBus())

/**
 * 从存量埋点推导平台事件聚合（§3 Aggregate）：
 * kind 取事件名首段（'kb:document-completed' → 'kb'；'workflow.run.*' → 'workflow'）；
 * id 取 payload 首个以 Id 结尾的 string 值（如 documentId / taskId / recordId），
 * 兜底用事件名本身（无实体 id 的全局广播类事件）。
 */
function inferAggregate(
  name: string,
  payload: Record<string, unknown>
): { kind: string; id: string } {
  const kind = name.split(/[:.]/)[0] || 'event'
  for (const [key, value] of Object.entries(payload)) {
    if (/Id$/.test(key) && typeof value === 'string' && value) return { kind, id: value }
  }
  return { kind, id: name }
}

/** 源服务埋点统一入口（try/catch 包裹，不影响业务主流程） */
export function publishDomainEvent(name: string, payload: Record<string, unknown>): void {
  // 1. 存量进程内同步分发（事件触发器链路，零改动）
  try {
    bus.publish(name, payload)
  } catch (e) {
    console.warn(`[WorkflowEventBus] 事件发布失败：${name}`, e)
  }
  // 2. M1 起转发平台事件总线落库持久化（bus.publish 自身即 safePublish；
  //    载荷违规等生产者 bug 也在此 catch 降级为 warn，绝不抛给主流程）
  try {
    const platformBus = getEventBusIfReady()
    if (platformBus) {
      void platformBus
        .publish({
          type: name,
          aggregate: inferAggregate(name, payload),
          payload,
        })
        .catch(e => console.warn(`[WorkflowEventBus] 平台事件落库失败：${name}`, e))
    }
  } catch (e) {
    console.warn(`[WorkflowEventBus] 平台事件发布失败：${name}`, e)
  }
}

/** 订阅（片6 事件触发器接线用；测试也可用） */
export function subscribeDomainEvents(handler: (event: DomainEvent) => void): () => void {
  return bus.subscribe(handler)
}
