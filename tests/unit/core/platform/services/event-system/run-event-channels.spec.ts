/**
 * ipc/ws 投递通道单测（10-event-system §5.4 / §9 前端推送行）
 *
 * 覆盖：
 * - 五型平台事件 → WorkflowRunEvent 载荷字段级相等（前端零改动契约）
 * - 按事件自带 userId 包裹 emit（ws 路由语义；ipc 的 tap 消费者租户上下文一致）
 * - 未登记映射类型跳过；stop 幂等退订
 */
import { describe, it, expect } from 'vitest'
import { IpcEventChannel } from '@core/platform/services/event-system/channels/ipc.channel'
import { WsEventChannel } from '@core/platform/services/event-system/channels/ws.channel'
import { getCurrentUserId } from '@core/context/user-context'
import type { IEventEmitter } from '@core/interfaces/event.interface'
import type {
  EventBus,
  EventChannel,
  EventHandler,
  PlatformEvent,
  SubscriptionFilter,
} from '@shared/types/event.types'
import type { WorkflowRunEvent } from '@shared/types/workflow.types'

interface EmitCall {
  channel: string
  data: unknown
  /** emit 时刻 ALS userId（断言按事件自带 userId 路由的依据） */
  userIdAtEmit: string | null
}

function makeFakeEmitter() {
  const calls: EmitCall[] = []
  const emitter: IEventEmitter = {
    emit: (channel, data) => {
      calls.push({ channel, data, userIdAtEmit: getCurrentUserId() })
    },
    emitProgress: () => {},
    emitStatus: () => {},
  }
  return { emitter, calls }
}

function makeFakeBus() {
  const handlers: EventHandler[] = []
  const filters: SubscriptionFilter[] = []
  let unsubscribeCount = 0
  const bus = {
    subscribe(filter: SubscriptionFilter, handler: EventHandler) {
      filters.push(filter)
      handlers.push(handler)
      return { id: `sub-${handlers.length}`, unsubscribe: async () => { unsubscribeCount++ } }
    },
  } as unknown as EventBus
  return {
    bus,
    filters,
    get handler() { return handlers[0] },
    get unsubscribeCount() { return unsubscribeCount },
  }
}

function makePlatformEvent(type: string, payload: unknown, userId: string | null = 'u1'): PlatformEvent {
  return {
    seq: 7,
    id: 'evt-1',
    userId,
    type,
    aggregate: { kind: 'workflow_run', id: (payload as { runId?: string }).runId ?? 'run-1' },
    actor: { kind: 'workflow', id: 'run-1' },
    payload,
    causationId: null,
    correlationId: 'run-1',
    occurredAt: Date.now(),
    schemaVersion: 1,
  }
}

/** 五型代表性载荷（剥离 type 后作为平台事件 payload；期望重建后与原件字段级相等） */
const FIVE_TYPE_CASES: Array<{ platformType: string; wfEvent: WorkflowRunEvent }> = [
  {
    platformType: 'workflow.run.run-status',
    wfEvent: {
      type: 'run-status',
      runId: 'run-1',
      definitionId: 'def-1',
      status: 'succeeded',
      stats: { totalNodes: 3, doneNodes: 3, failedNodes: 0, recoveredNodes: 1 },
    },
  },
  {
    platformType: 'workflow.run.node-status',
    wfEvent: {
      type: 'node-status',
      runId: 'run-1',
      nodeId: 'node-a',
      iterationIndex: 2,
      status: 'failed',
      error: 'boom',
      routeTaken: 'fail',
      startedAt: 1000,
      finishedAt: 2000,
    },
  },
  {
    platformType: 'workflow.run.node-progress',
    wfEvent: {
      type: 'node-progress',
      runId: 'run-1',
      nodeId: 'node-b',
      iterationIndex: 0,
      progress: 42,
      message: '生成中',
    },
  },
  {
    platformType: 'workflow.run.review-requested',
    wfEvent: {
      type: 'review-requested',
      runId: 'run-1',
      definitionId: 'def-1',
      nodeId: 'node-c',
      nodeName: '人工审核',
      payload: { form: true, fields: [{ key: 'reason' }] },
      waitExpiresAt: 9999,
    },
  },
  {
    platformType: 'workflow.run.notify',
    wfEvent: {
      type: 'notify',
      runId: 'run-1',
      level: 'warning',
      title: '注意',
      message: '存在失败节点',
    },
  },
]

/** ipc / ws 两通道同构断言（§5.4：同角色、不同平台绑定） */
describe.each([
  ['ipc', (emitter: IEventEmitter): EventChannel => new IpcEventChannel(() => emitter)],
  ['ws', (emitter: IEventEmitter): EventChannel => new WsEventChannel(() => emitter)],
] as const)('%s 通道', (kind, makeChannel) => {
  it(`kind='${kind}'，start 订阅默认类型集 workflow.run.*`, () => {
    const { emitter } = makeFakeEmitter()
    const fake = makeFakeBus()
    const channel = makeChannel(emitter)
    expect(channel.kind).toBe(kind)
    channel.start(fake.bus)
    expect(fake.filters).toEqual([{ types: ['workflow.run.*'] }])
    channel.stop()
  })

  it('五型平台事件翻译为 wf:run-event 载荷（字段级相等）', () => {
    const { emitter, calls } = makeFakeEmitter()
    const fake = makeFakeBus()
    const channel = makeChannel(emitter)
    channel.start(fake.bus)

    for (const { platformType, wfEvent } of FIVE_TYPE_CASES) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { type: _t, ...payload } = wfEvent as Record<string, unknown>
      fake.handler(makePlatformEvent(platformType, payload))
    }
    expect(calls.map(c => c.channel)).toEqual(FIVE_TYPE_CASES.map(() => 'wf:run-event'))
    expect(calls.map(c => c.data)).toEqual(FIVE_TYPE_CASES.map(c => c.wfEvent))
    channel.stop()
  })

  it('emit 时 ALS userId 取事件自带 userId（不依赖 emit 时刻上下文）；null 则不携带', () => {
    const { emitter, calls } = makeFakeEmitter()
    const fake = makeFakeBus()
    const channel = makeChannel(emitter)
    channel.start(fake.bus)

    fake.handler(makePlatformEvent('workflow.run.run-status', {
      runId: 'run-1', definitionId: 'def-1', status: 'running',
    }, 'u-42'))
    fake.handler(makePlatformEvent('workflow.run.run-status', {
      runId: 'run-2', definitionId: 'def-1', status: 'running',
    }, null))

    expect(calls[0].userIdAtEmit).toBe('u-42')
    expect(calls[1].userIdAtEmit).toBeNull()
    channel.stop()
  })

  it('未登记映射的 workflow.run.* 扩展类型跳过不推前端', () => {
    const { emitter, calls } = makeFakeEmitter()
    const fake = makeFakeBus()
    const channel = makeChannel(emitter)
    channel.start(fake.bus)

    fake.handler(makePlatformEvent('workflow.run.review-decided', { runId: 'run-1' }))
    expect(calls).toEqual([])
    channel.stop()
  })

  it('stop 退订且幂等；start 幂等（重复挂接不产生第二个订阅）', () => {
    const { emitter } = makeFakeEmitter()
    const fake = makeFakeBus()
    const channel = makeChannel(emitter)
    channel.start(fake.bus)
    channel.start(fake.bus) // 幂等
    expect(fake.filters).toHaveLength(1)
    channel.stop()
    channel.stop() // 幂等
    expect(fake.unsubscribeCount).toBe(1)
  })
})
