/**
 * 引擎 run 事件 producer 适配器（10-event-system §9 工作流引擎行）
 * @module core/platform/services/event-system/workflow-run-producer
 * @description 引擎 WorkflowEventPort.emit 的适配实现：把 WorkflowRunEvent 五型
 *              派生为平台事件（workflow.run.* 族，§9 映射表）发布到平台事件总线，
 *              由 ipc/ws 通道翻译回五型载荷推前端（前端零改动）。
 *
 *              可靠性契约（§9 第一行 / §7.3）：
 *              - 平台事件失败不影响执行与恢复——publish 任何失败（落库 null /
 *                载荷违规抛错）都回退存量直推路径，前端实时推送不断；
 *              - 总线未启动（boot 早期/无库测试）时等价于存量直推；
 *              - 同一 producer 的发布经 Promise 链串行化，保证按序落库→按序分发
 *                （publish 的即时分发在 INSERT 提交后，乱序发布会乱序推送）。
 *
 *              causationId 透传位（§9：回填 journal 事件 id）已就绪；
 *              引擎 journal（11-run-journal）尚未实施，当前调用点不传、恒为 null，
 *              journal 落地后由引擎 emit 调用点补传。
 */

import type { EventBus } from '@shared/types/event.types'
import type { WorkflowRunEvent } from '@shared/types/workflow.types'
import type { WorkflowEventPort } from '@core/platform/workflow/engine/ports'
import { createLogger } from '@core/utils/logger'
import { getEventBusIfReady } from './event-bus.service'
import { createPlatformEventProducer } from './event-producer'
import { toRunPlatformEventType, WORKFLOW_RUN_AGGREGATE_KIND } from './workflow-run-event-map'

const logger = createLogger('WorkflowRunProducer')

export interface WorkflowRunProducerOptions {
  /** 取总线（默认平台单例访问器；测试注入） */
  getBus?: () => EventBus | null
}

/**
 * 创建引擎事件端口：平台总线可用时走"平台事件 → 通道"路径，否则回退存量直推。
 * @param fallbackEmit 存量直推（getEventEmitter().emit('wf:run-event', ...) 包装）
 */
export function createWorkflowRunEventProducer(
  fallbackEmit: (event: WorkflowRunEvent) => void,
  opts: WorkflowRunProducerOptions = {}
): WorkflowEventPort {
  // 保序链 + 失败降级改用公共底座（event-producer.ts，2026-09-06 架构统一性抽象）；
  // 引擎的降级策略 = 回退存量直推通道（前端推送不断，§7.3/§9 语义不变）
  const producer = createPlatformEventProducer({ getBus: opts.getBus ?? getEventBusIfReady })

  return {
    emit(event, emitOpts) {
      const platformType = toRunPlatformEventType(event.type)
      if (!platformType) {
        fallbackEmit(event) // 未登记映射的类型：不进平台，直接走存量通道
        return
      }
      // 平台事件载荷 = 五型载荷剥离 type（type 由平台类型承载，通道侧重建）
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { type: _wfType, ...payload } = event
      const { queued } = producer.publish(
        {
          type: platformType,
          aggregate: { kind: WORKFLOW_RUN_AGGREGATE_KIND, id: event.runId },
          actor: { kind: 'workflow', id: event.runId },
          payload,
          causationId: emitOpts?.causationId, // journal 事件 id（11 落地后回填；不传=undefined）
          correlationId: event.runId,
        },
        {
          // 落库失败（safePublish null）/ 发布抛错 → 回退直推（异步链内）
          onFailed: (_input, e) => {
            if (e) {
              logger.warn(
                `[WorkflowRunProducer] 平台事件发布失败，回退直推（type=${event.type}）`,
                e,
              )
            }
            fallbackEmit(event)
          },
        },
      )
      if (!queued) fallbackEmit(event) // 总线未启动：存量直推路径兜底（行为与改动前等价）
    },
  }
}
