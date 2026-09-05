/**
 * ipc 投递通道（Electron 主进程 → 渲染进程）
 * @module core/services/event-system/channels/ipc.channel
 * @description 10-event-system §5.4 ipc 通道：订阅约定类型集（默认 workflow.run.*），
 *              把平台事件翻译回既有 WorkflowRunEvent 五型载荷，经 IEventEmitter
 *              （ElectronBroadcastEventEmitter，广播所有窗口）推送到原
 *              WORKFLOW_RUN_EVENT_CHANNEL（'wf:run-event'）——前端零改动（§9）。
 *
 *              emit 时用事件自带 userId 包裹 ALS（runWithUser），让 emitter 的
 *              tap 消费者（app-session 事件桥等）拿到与存量直推一致的租户上下文。
 *              匿名订阅（至多一次，UI 推送类语义与存量 fire-and-forget 一致）。
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

const logger = createLogger('IpcEventChannel')

export class IpcEventChannel implements EventChannel {
  readonly kind = 'ipc' as const

  private subscription: Subscription | null = null

  constructor(
    /** 测试注入：emitter 访问器（默认全局注册实例） */
    private readonly emitter: () => IEventEmitter = getEventEmitter,
    /** 订阅类型集（默认 workflow.run.*，§5.4 约定） */
    private readonly types: readonly string[] = DEFAULT_RUN_EVENT_CHANNEL_TYPES
  ) {}

  start(bus: EventBus): void {
    if (this.subscription) return // 幂等
    this.subscription = bus.subscribe({ types: [...this.types] }, event => this.forward(event))
    logger.info(`[IpcEventChannel] 已挂接（订阅 ${this.types.join(', ')} → ${WORKFLOW_RUN_EVENT_CHANNEL}）`)
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
        logger.warn('[IpcEventChannel] 事件推送失败（不影响执行）', e)
      }
    }
    // 按事件自带 userId 包裹 emit：tap 消费者租户路由与存量直推语义一致
    if (event.userId) runWithUser(event.userId, emit)
    else runWithoutUser(emit)
  }
}
