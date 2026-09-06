/**
 * 平台事件 producer 公共底座（2026-09-06 抽象共用）
 * @module core/platform/services/event-system/event-producer
 *
 * 动机：workflow-run-producer 与 agent-runtime EventBridge 各自实现了同一套
 * 「总线发布保序链 + 失败降级」骨架——按架构统一性要求抽象为共用件。
 *
 * 共用职责（本模块）：
 * - 同一 producer 的发布经 Promise 链串行化（按 publish 调用顺序落库→按序分发）
 * - 失败降级不抛调用方主流程：publish 抛错 / safePublish 返回 null → 回调或 warn
 * - 总线不可用同步可知（queued:false；降级策略属调用方——引擎回退存量直推，
 *   agent 侧直推已先行、仅丢审计，两方语义不同故不在本层）
 *
 * 不在本层：事件类型映射（各 producer 的 map）、直推通道（IEventEmitter）、
 * delta 合批（agent 侧流式整形）。
 */

import { createLogger } from '@core/utils/logger'
import type { EventBus, PublishInput } from '@shared/types/event.types'
import { getEventBusIfReady } from './event-bus.service'

/** 消费方（如 agent EventBridge）的总线注入面别名 */
export type PlatformBusPortLike = EventBus

const logger = createLogger('PlatformEventProducer')

export interface PublishHandlers {
  /** 发布失败（publish 抛错 err / safePublish 落库返回 null 时 err=null）；缺省 warn */
  onFailed?: (input: PublishInput, err: unknown) => void
  /** 总线不可用（publish 未入队，同步回调）；缺省仅返回 queued:false */
  onUnavailable?: (input: PublishInput) => void
}

export interface PlatformEventProducer {
  /**
   * 排队发布（保序）。queued:false = 总线不可用未入队（调用方自行降级）。
   * handlers 按本次发布生效（失败回退常需引用当次的原始事件，闭包传入）。
   */
  publish(input: PublishInput, handlers?: PublishHandlers): { queued: boolean }
  /** 等待发布链排空（测试/关停） */
  flush(): Promise<void>
}

export function createPlatformEventProducer(
  opts: { getBus?: () => EventBus | null } = {},
): PlatformEventProducer {
  const getBus = opts.getBus ?? getEventBusIfReady
  let chain: Promise<unknown> = Promise.resolve()

  return {
    publish(input, handlers) {
      const bus = getBus()
      if (!bus) {
        handlers?.onUnavailable?.(input)
        return { queued: false }
      }
      chain = chain
        .then(() => bus.publish(input))
        .then((published) => {
          if (published === null || published === undefined) {
            if (handlers?.onFailed) handlers.onFailed(input, null)
            else logger.warn('[event-producer] safePublish 未落库（未注册降级，仅告警）')
          }
          return published
        })
        .catch((e) => {
          if (handlers?.onFailed) handlers.onFailed(input, e)
          else logger.warn('[event-producer] 发布失败（未注册降级，仅告警）', e)
        })
      return { queued: true }
    },
    async flush() {
      await chain
    },
  }
}
