/**
 * 引擎 run 事件 producer 适配器单测（10-event-system §9 工作流引擎行）
 *
 * 覆盖：
 * - 五型事件 → 平台事件派生（类型映射 / 聚合 / actor / correlationId / 载荷剥离 type）
 * - causationId 透传（journal 事件 id 回填位；不传则 null）
 * - 失败隔离：落库 null / 抛错 / 总线未就绪 → 回退存量直推，绝不抛给引擎主流程
 * - 保序：同一 producer 的发布按 emit 顺序进入总线
 */
import { describe, it, expect, vi } from 'vitest'
import { createWorkflowRunEventProducer } from '@core/platform/services/event-system/workflow-run-producer'
import type { EventBus, PlatformEvent, PublishInput } from '@shared/types/event.types'
import type { WorkflowRunEvent } from '@shared/types/workflow.types'

const flush = (): Promise<void> => new Promise(r => setTimeout(r, 0))

function makeFakeBus(behavior: 'ok' | 'null' | 'throw' = 'ok') {
  const published: PublishInput[] = []
  const bus = {
    publish: vi.fn(async (input: PublishInput) => {
      if (behavior === 'throw') throw new Error('载荷违规')
      if (behavior === 'null') return null
      published.push(input)
      return { seq: published.length, id: `evt-${published.length}` } as PlatformEvent
    }),
  } as unknown as EventBus
  return { bus, published }
}

const runStatusEvent: WorkflowRunEvent = {
  type: 'run-status',
  runId: 'run-1',
  definitionId: 'def-1',
  status: 'running',
}

describe('createWorkflowRunEventProducer', () => {
  it('五型事件派生平台事件：类型映射 + 聚合 + actor + correlationId + 载荷剥离 type', async () => {
    const { bus, published } = makeFakeBus()
    const fallback = vi.fn()
    const producer = createWorkflowRunEventProducer(fallback, { getBus: () => bus })

    const reviewEvent: WorkflowRunEvent = {
      type: 'review-requested',
      runId: 'run-1',
      definitionId: 'def-1',
      nodeId: 'node-c',
      nodeName: '人工审核',
      payload: { form: true, fields: [{ key: 'reason' }] },
      waitExpiresAt: 9999,
    }
    producer.emit(runStatusEvent)
    producer.emit(reviewEvent)
    await flush()

    expect(fallback).not.toHaveBeenCalled()
    expect(published).toHaveLength(2)

    expect(published[0]).toEqual({
      type: 'workflow.run.run-status',
      aggregate: { kind: 'workflow_run', id: 'run-1' },
      actor: { kind: 'workflow', id: 'run-1' },
      payload: { runId: 'run-1', definitionId: 'def-1', status: 'running' }, // type 已剥离
      correlationId: 'run-1',
    })
    expect(published[0].causationId).toBeUndefined() // journal 未实施（11-run-journal 落地后回填）
    expect(published[1].type).toBe('workflow.run.review-requested')
    expect(published[1].payload).toEqual({
      runId: 'run-1',
      definitionId: 'def-1',
      nodeId: 'node-c',
      nodeName: '人工审核',
      payload: { form: true, fields: [{ key: 'reason' }] },
      waitExpiresAt: 9999,
    })
  })

  it('causationId 透传（journal 事件 id 回填位）；不传则 null', async () => {
    const { bus, published } = makeFakeBus()
    const producer = createWorkflowRunEventProducer(vi.fn(), { getBus: () => bus })

    producer.emit(runStatusEvent, { causationId: 'journal-evt-9' })
    producer.emit(runStatusEvent)
    await flush()

    expect(published[0].causationId).toBe('journal-evt-9')
    expect(published[1].causationId).toBeUndefined()
  })

  it('同一 producer 的发布按 emit 顺序进入总线（保序链）', async () => {
    const { bus, published } = makeFakeBus()
    const producer = createWorkflowRunEventProducer(vi.fn(), { getBus: () => bus })

    producer.emit({ ...runStatusEvent, status: 'pending' })
    producer.emit({ ...runStatusEvent, status: 'running' })
    producer.emit({ ...runStatusEvent, status: 'succeeded' })
    await flush()

    expect(published.map(p => (p.payload as { status: string }).status)).toEqual([
      'pending', 'running', 'succeeded',
    ])
  })

  it('落库失败（publish 返回 null）→ 回退存量直推，前端推送不断', async () => {
    const { bus } = makeFakeBus('null')
    const fallback = vi.fn()
    const producer = createWorkflowRunEventProducer(fallback, { getBus: () => bus })

    producer.emit(runStatusEvent)
    await flush()

    expect(fallback).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledWith(runStatusEvent) // 原五型载荷原样直推
  })

  it('publish 抛错（载荷违规等）→ 降级 warn + 回退直推，绝不抛给引擎主流程', async () => {
    const { bus } = makeFakeBus('throw')
    const fallback = vi.fn()
    const producer = createWorkflowRunEventProducer(fallback, { getBus: () => bus })

    expect(() => producer.emit(runStatusEvent)).not.toThrow()
    await flush()
    expect(fallback).toHaveBeenCalledWith(runStatusEvent)
  })

  it('总线未就绪（getBus 返回 null）→ 存量直推，行为与改动前等价', async () => {
    const fallback = vi.fn()
    const producer = createWorkflowRunEventProducer(fallback, { getBus: () => null })

    producer.emit(runStatusEvent)
    await flush()

    expect(fallback).toHaveBeenCalledWith(runStatusEvent)
  })

  it('单个事件失败不影响后续事件（保序链不被 reject 卡死）', async () => {
    const { published } = makeFakeBus('ok')
    // 第二次发布抛错，第一次与第三次正常
    let call = 0
    const flakyBus = {
      publish: vi.fn(async (input: PublishInput) => {
        call++
        if (call === 2) throw new Error('载荷违规')
        published.push(input)
        return { seq: call } as PlatformEvent
      }),
    } as unknown as EventBus
    const fallback = vi.fn()
    const producer = createWorkflowRunEventProducer(fallback, { getBus: () => flakyBus })

    producer.emit({ ...runStatusEvent, status: 'pending' })
    producer.emit({ ...runStatusEvent, status: 'running' })
    producer.emit({ ...runStatusEvent, status: 'succeeded' })
    await flush()

    expect(published.map(p => (p.payload as { status: string }).status)).toEqual(['pending', 'succeeded'])
    expect(fallback).toHaveBeenCalledTimes(1)
    expect((fallback.mock.calls[0][0] as WorkflowRunEvent).type).toBe('run-status')
    expect((fallback.mock.calls[0][0] as { status: string }).status).toBe('running')
  })
})
