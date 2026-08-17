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

class WorkflowDomainEventBus {
  private emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(50)
  }

  publish(name: string, payload: Record<string, unknown>): void {
    const event: DomainEvent = {
      name,
      userId: getCurrentUserId(),
      payload,
      occurredAt: Date.now(),
    }
    this.emitter.emit('event', event)
  }

  subscribe(handler: (event: DomainEvent) => void): () => void {
    this.emitter.on('event', handler)
    return () => this.emitter.off('event', handler)
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
