/**
 * ws 投递通道（Web 端 WebSocket 推送）
 * @module core/services/event-system/channels/ws.channel
 * @description 10-event-system §5.4 ws 通道：与 ipc 通道同角色，订阅约定类型集
 *              （默认 workflow.run.*），翻译回 WorkflowRunEvent 五型载荷后经
 *              IEventEmitter（WebSocketEventEmitter）推送到原
 *              WORKFLOW_RUN_EVENT_CHANNEL（'wf:run-event'）——前端零改动（§9）。
 *
 *              路由语义变化（§5.4 ws 条目）：不再依赖 emit 时刻的 ALS 上下文，
 *              改为按事件自带 userId（发布时 ALS 快照，§8 落库即固化）包裹
 *              runWithUser 后 emit——WebSocketEventEmitter 按该上下文路由到
 *              目标用户的全部 WS 连接；userId 为 null 的系统级事件不广播
 *              （emitter 既有防串数据语义）。
 */

import { getEventEmitter, type IEventEmitter } from '@core/interfaces/event.interface'
import { runWithUser, runWithoutUser } from '@core/context/user-context'
import { WORKFLOW_RUN_EVENT_CHANNEL } from '@shared/types/workflow.types'
import type { EventBus, EventChannel, PlatformEvent, Subscription } from '@shared/types/event.types'
import { createLogger } from '@core/utils/logger'
import {
  DEFAULT_RUN_EVENT_CHANNEL_TYPES,
  translateRunPlatformEvent,
} from '../workflow-run-event-map'

const logger = createLogger('WsEventChannel')

export class WsEventChannel implements EventChannel {
  readonly kind = 'ws' as const

  private subscription: Subscription | null = null

  constructor(
    /** 测试注入：emitter 访问器（默认全局注册实例，Web 端即 WebSocketEventEmitter） */
    private readonly emitter: () => IEventEmitter = getEventEmitter,
    /** 订阅类型集（默认 workflow.run.*，§5.4 约定） */
    private readonly types: readonly string[] = DEFAULT_RUN_EVENT_CHANNEL_TYPES
  ) {}

  start(bus: EventBus): void {
    if (this.subscription) return // 幂等
    this.subscription = bus.subscribe({ types: [...this.types] }, event => this.forward(event))
    logger.info(`[WsEventChannel] 已挂接（订阅 ${this.types.join(', ')} → ${WORKFLOW_RUN_EVENT_CHANNEL}）`)
  }

  stop(): void {
    const sub = this.subscription
    this.subscription = null
    if (sub) void sub.unsubscribe()
  }

  private forward(event: PlatformEvent): void {
    const wfEvent = translateRunPlatformEvent(event)
    if (!wfEvent) return // 未登记映射的 workflow.run.* 扩展类型不推前端
    const emit = (): void => {
      try {
        this.emitter().emit(WORKFLOW_RUN_EVENT_CHANNEL, wfEvent)
      } catch (e) {
        logger.warn('[WsEventChannel] 事件推送失败（不影响执行）', e)
      }
    }
    // 按事件自带 userId 路由（不再依赖 emit 时刻 ALS 上下文，§5.4）
    if (event.userId) runWithUser(event.userId, emit)
    else runWithoutUser(emit)
  }
}
