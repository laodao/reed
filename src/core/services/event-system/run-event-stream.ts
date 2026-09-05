/**
 * run 事件混合流源（10-event-system §5.4 sse 通道平台化）
 * @module core/services/event-system/run-event-stream
 * @description 把"某次 workflow run 的事件"以 replay+订阅混合流形式提供给
 *              SSE 端点（web/server/api/workflow-api-router.ts 的 streamRunEvents）：
 *              1. 先挂匿名订阅（缓冲实时事件，防 replay 期间漏投）；
 *              2. 再 replay 聚合 {kind:'workflow_run', id:runId} 的历史事件（按 seq 有序）；
 *              3. replay 完成后按 seq 冲刷缓冲，按 event.id 去重（§7.9 边界重叠约定）；
 *              4. 此后实时事件直通。
 *              平台事件经 translateRunPlatformEvent 翻译回 WorkflowRunEvent 五型载荷——
 *              SSE 端点契约（快照先行/心跳/终态关流/五型载荷）不变，前端零改动。
 *
 *              租户隔离双保险：replay 走 scoped（按 ownerUserId 的 ALS 过滤）；
 *              实时订阅为匿名（至多一次，无 DB 侧过滤），在回调处按事件自带
 *              userId === ownerUserId 过滤（与存量 tap 的 emitUserId 校验等价）。
 */

import { runWithUser } from '@core/context/user-context'
import type { EventBus, PlatformEvent, Subscription } from '@shared/types/event.types'
import type { WorkflowRunEvent } from '@shared/types/workflow.types'
import { createLogger } from '@core/utils/logger'
import {
  DEFAULT_RUN_EVENT_CHANNEL_TYPES,
  WORKFLOW_RUN_AGGREGATE_KIND,
  translateRunPlatformEvent,
} from './workflow-run-event-map'

const logger = createLogger('RunEventStream')

export interface RunEventStreamSource {
  /**
   * 启动混合流：replay 历史（含订阅窗口补偿）→ 实时直通。
   * onEvent 收到的是翻译后的五型载荷（未登记映射的扩展类型跳过）。
   * 幂等：重复 start 不重复订阅。
   */
  start(onEvent: (ev: WorkflowRunEvent) => void): Promise<void>
  close(): Promise<void>
}

export function createRunEventStream(
  bus: EventBus,
  runId: string,
  ownerUserId: string
): RunEventStreamSource {
  const filter = {
    types: [...DEFAULT_RUN_EVENT_CHANNEL_TYPES],
    aggregate: { kind: WORKFLOW_RUN_AGGREGATE_KIND, id: runId },
  }

  let subscription: Subscription | null = null
  let replayDone = false
  let closed = false
  /** replay 期间到达的实时事件缓冲（replay 完成后按 seq 有序冲刷） */
  const liveBuffer: PlatformEvent[] = []
  /** 已投递事件 id 去重集（replay 与实时窗口重叠，§7.9） */
  const seenIds = new Set<string>()
  let onEvent: ((ev: WorkflowRunEvent) => void) | null = null

  const emit = (event: PlatformEvent): void => {
    if (closed || !onEvent) return
    if (seenIds.has(event.id)) return
    seenIds.add(event.id)
    const wfEvent = translateRunPlatformEvent(event)
    if (!wfEvent) return // 未登记映射的 workflow.run.* 扩展类型不推（与 ipc/ws 通道一致）
    onEvent(wfEvent)
  }

  const handleLive = (event: PlatformEvent): void => {
    if (closed) return
    // 匿名订阅无 DB 侧租户过滤（M1 偏差 4）——按事件自带 userId 过滤，等价存量 tap 校验
    if (event.userId !== ownerUserId) return
    if (!replayDone) {
      liveBuffer.push(event)
      return
    }
    emit(event)
  }

  return {
    async start(cb: (ev: WorkflowRunEvent) => void): Promise<void> {
      if (subscription) return // 幂等
      onEvent = cb
      // 1) 先订阅（缓冲实时事件），堵住 replay 窗口
      subscription = bus.subscribe(filter, handleLive)
      try {
        // 2) replay 历史：ALS 必须在同步调用点捕获（async generator 不传播 ALS，
        //    event-bus.service.ts 的既有坑），故在此显式包裹 ownerUserId
        const iterable = runWithUser(ownerUserId, () => bus.replay(filter))
        for await (const event of iterable) {
          if (closed) return
          emit(event) // replay 按 seq 有序；seenIds 去重
        }
      } catch (e) {
        // replay 失败不致命：实时订阅仍在（降级为纯实时流，与存量 tap 语义等价）
        logger.warn(`[RunEventStream] 历史回放失败（runId=${runId}，降级纯实时）`, e)
      }
      // 3) 冲刷订阅窗口缓冲（先置 replayDone 再同步冲刷——单线程内无交错，
      //    之后到达的实时事件直通 emit，保证 seq 有序）
      replayDone = true
      liveBuffer.sort((a, b) => a.seq - b.seq)
      for (const event of liveBuffer.splice(0)) emit(event)
    },

    async close(): Promise<void> {
      if (closed) return
      closed = true
      const sub = subscription
      subscription = null
      if (sub) await sub.unsubscribe()
    },
  }
}
