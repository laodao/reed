/**
 * 工作流领域事件总线（进程内 pub/sub）
 * @module core/modules/workflow/trigger/domain-event-bus
 * @description 与 IEventEmitter（前端推送，单向广播）完全独立的进程内订阅机制，
 *              供"事件触发器"消费系统领域事件（kb 入库完成/图像完成/翻译完成…）。
 *
 *              - publish 自动捕获发布时的 ALS userId（同租户匹配依据）
 *              - 源服务埋点统一走 safePublish（try/catch，绝不影响主流程）
 *              - 订阅方（片6 事件触发器）按 userId === 定义所属用户过滤
 */

import { EventEmitter } from 'events'
import { getCurrentUserId } from '@core/context/user-context'

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

/** 源服务埋点统一入口（try/catch 包裹，不影响业务主流程） */
export function publishDomainEvent(name: string, payload: Record<string, unknown>): void {
  try {
    bus.publish(name, payload)
  } catch (e) {
    console.warn(`[WorkflowEventBus] 事件发布失败：${name}`, e)
  }
}

/** 订阅（片6 事件触发器接线用；测试也可用） */
export function subscribeDomainEvents(handler: (event: DomainEvent) => void): () => void {
  return bus.subscribe(handler)
}
