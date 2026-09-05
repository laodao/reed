/**
 * run 事件混合流源单测（10-event-system §5.4 sse 行）：
 * replay 历史 + 订阅窗口缓冲 + id 去重 + seq 保序 + 租户过滤 + 类型翻译 + close
 *
 * 用假 EventBus 精确控制 replay/实时的交错时序（真实 bus 的集成路径见
 * tests/unit/web/workflow-api-router-sse-bus.spec.ts）。
 */
import { describe, it, expect, vi } from 'vitest'
import { createRunEventStream } from '@core/platform/services/event-system/run-event-stream'
import type { EventBus, EventHandler, PlatformEvent, SubscriptionFilter } from '@shared/types/event.types'
import type { WorkflowRunEvent } from '@shared/types/workflow.types'

function evt(over: Partial<PlatformEvent> & { seq: number; id: string }): PlatformEvent {
  return {
    userId: 'u1',
    type: 'workflow.run.node-status',
    aggregate: { kind: 'workflow_run', id: 'run_1' },
    actor: { kind: 'workflow', id: null },
    payload: { runId: 'run_1', nodeId: 'n1', status: 'running' },
    causationId: null,
    correlationId: 'run_1',
    occurredAt: Date.now(),
    schemaVersion: 1,
    ...over,
  }
}

function fakeBus(opts: {
  history: PlatformEvent[]
}): { bus: EventBus; fireLive: (e: PlatformEvent) => void; unsub: ReturnType<typeof vi.fn>; state: { subscribedFilter: SubscriptionFilter | null } } {
  let liveHandler: EventHandler | null = null
  const state = { subscribedFilter: null as SubscriptionFilter | null }
  const unsub = vi.fn(async () => {})
  const bus = {
    subscribe(filter: SubscriptionFilter, handler: EventHandler) {
      state.subscribedFilter = filter
      liveHandler = handler
      return { id: 'sub-1', unsubscribe: unsub }
    },
    replay() {
      return (async function* () {
        for (const e of opts.history) yield e
      })()
    },
  } as unknown as EventBus
  return { bus, fireLive: e => { void liveHandler?.(e) }, unsub, state }
}

describe('createRunEventStream', () => {
  it('replay 历史先行（翻译回五型载荷）→ 实时直通', async () => {
    const { bus, fireLive } = fakeBus({
      history: [evt({ seq: 1, id: 'e1', payload: { runId: 'run_1', nodeId: 'a', status: 'running' } })],
    })
    const stream = createRunEventStream(bus, 'run_1', 'u1')
    const got: WorkflowRunEvent[] = []
    await stream.start(e => got.push(e))

    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ type: 'node-status', runId: 'run_1', nodeId: 'a' }) // type 由映射表重建

    fireLive(evt({ seq: 2, id: 'e2', payload: { runId: 'run_1', nodeId: 'b', status: 'running' } }))
    expect(got).toHaveLength(2)
    expect(got[1]).toMatchObject({ type: 'node-status', nodeId: 'b' })
  })

  it('订阅窗口内到达的实时事件被缓冲并按 seq 有序冲刷（不与 replay 交错）', async () => {
    let liveHandler: EventHandler | null = null
    const history = [
      evt({ seq: 1, id: 'e1', payload: { runId: 'run_1', nodeId: 'a', status: 'running' } }),
      evt({ seq: 2, id: 'e2', payload: { runId: 'run_1', nodeId: 'b', status: 'running' } }),
    ]
    const bus = {
      subscribe(_f: SubscriptionFilter, h: EventHandler) {
        liveHandler = h
        return { id: 's', unsubscribe: async () => {} }
      },
      replay() {
        return (async function* () {
          yield history[0]
          // replay 中途到达实时事件（seq 比剩余历史大）——必须缓冲，不能插队
          void liveHandler!(evt({ seq: 3, id: 'e3', payload: { runId: 'run_1', nodeId: 'c', status: 'running' } }))
          yield history[1]
        })()
      },
    } as unknown as EventBus

    const stream = createRunEventStream(bus, 'run_1', 'u1')
    const got: WorkflowRunEvent[] = []
    await stream.start(e => got.push(e))
    expect(got.map(e => (e as { nodeId?: string }).nodeId)).toEqual(['a', 'b', 'c']) // seq 保序
  })

  it('replay 与实时重叠按 event.id 去重；异租户/未映射类型跳过', async () => {
    const dup = evt({ seq: 1, id: 'e1', payload: { runId: 'run_1', nodeId: 'a', status: 'running' } })
    const { bus, fireLive } = fakeBus({ history: [dup] })
    const stream = createRunEventStream(bus, 'run_1', 'u1')
    const got: WorkflowRunEvent[] = []
    await stream.start(e => got.push(e))
    expect(got).toHaveLength(1)

    fireLive(dup) // 同 id 实时重复（窗口重叠）→ 去重
    fireLive(evt({ seq: 2, id: 'e2', userId: 'u2' })) // 异租户 → 不推
    fireLive(evt({ seq: 3, id: 'e3', type: 'workflow.run.future-ext' })) // 未登记映射 → 跳过
    fireLive(evt({ seq: 4, id: 'e4', payload: { runId: 'run_1', nodeId: 'd', status: 'running' } }))
    expect(got).toHaveLength(2)
    expect(got[1]).toMatchObject({ nodeId: 'd' })
  })

  it('订阅过滤面：workflow.run.* + 聚合 {workflow_run, runId}；close 注销订阅', async () => {
    const { bus, unsub, state } = fakeBus({ history: [] })
    const stream = createRunEventStream(bus, 'run_1', 'u1')
    const got: WorkflowRunEvent[] = []
    await stream.start(e => got.push(e))

    expect(state.subscribedFilter).toEqual({
      types: ['workflow.run.*'],
      aggregate: { kind: 'workflow_run', id: 'run_1' },
    })

    await stream.close()
    expect(unsub).toHaveBeenCalledOnce()
  })

  it('replay 抛错降级为纯实时流（不致命）', async () => {
    let liveHandler: EventHandler | null = null
    const bus = {
      subscribe(_f: SubscriptionFilter, h: EventHandler) {
        liveHandler = h
        return { id: 's', unsubscribe: async () => {} }
      },
      replay() {
        // 首拉即抛错的 async iterable（模拟 DB 抖动）
        return {
          [Symbol.asyncIterator]() {
            return {
              next: async (): Promise<IteratorResult<PlatformEvent>> => {
                throw new Error('DB 抖动')
              }
            }
          }
        } as AsyncIterable<PlatformEvent>
      },
    } as unknown as EventBus
    const stream = createRunEventStream(bus, 'run_1', 'u1')
    const got: WorkflowRunEvent[] = []
    await stream.start(e => got.push(e)) // 不抛
    void liveHandler!(evt({ seq: 1, id: 'e1', payload: { runId: 'run_1', nodeId: 'a', status: 'running' } }))
    expect(got).toHaveLength(1)
  })
})
