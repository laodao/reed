/**
 * 平台事件 producer 公共底座单测（workflow-run-producer 与 agent EventBridge 共用件）
 * 覆盖：保序串行化 / 总线不可用同步降级 / 失败回调（抛错与 safePublish null）/
 * 缺省降级 warn 不抛 / flush 排空。
 */

import { describe, it, expect, vi } from 'vitest'
import { createPlatformEventProducer } from '@core/platform/services/event-system/event-producer'
import type { EventBus, PublishInput } from '@shared/types/event.types'

function input(n: number): PublishInput {
  return {
    type: 'agent:test.event',
    aggregate: { kind: 'test', id: `a${n}` },
    actor: { kind: 'agent', id: 't' },
    payload: { n },
    correlationId: 'c',
  }
}

describe('createPlatformEventProducer', () => {
  it('① 保序：慢发布不乱序（链串行化）', async () => {
    const order: number[] = []
    const bus = {
      publish: async (i: PublishInput) => {
        await new Promise((r) => setTimeout(r, i.payload.n === 1 ? 10 : 1))
        order.push(i.payload.n as number)
        return i
      },
    } as unknown as EventBus
    const p = createPlatformEventProducer({ getBus: () => bus })
    p.publish(input(1))
    p.publish(input(2))
    p.publish(input(3))
    await p.flush()
    expect(order).toEqual([1, 2, 3])
  })

  it('② 总线不可用：同步返回 queued:false 并触发 onUnavailable（未入队）', async () => {
    const onUnavailable = vi.fn()
    const p = createPlatformEventProducer({ getBus: () => null })
    const r = p.publish(input(1), { onUnavailable })
    expect(r.queued).toBe(false)
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    await p.flush()
  })

  it('③ 发布抛错：触发 onFailed，链不断（后续仍可发布）', async () => {
    let fail = true
    const onFailed = vi.fn()
    const bus = {
      publish: async (i: PublishInput) => {
        if (fail) throw new Error('down')
        return i
      },
    } as unknown as EventBus
    const p = createPlatformEventProducer({ getBus: () => bus })
    p.publish(input(1), { onFailed })
    await p.flush()
    expect(onFailed).toHaveBeenCalledTimes(1)
    fail = false
    const ok: number[] = []
    const bus2 = { publish: async (i: PublishInput) => (ok.push(i.payload.n as number), i) } as unknown as EventBus
    const p2 = createPlatformEventProducer({ getBus: () => bus2 })
    p2.publish(input(2))
    await p2.flush()
    expect(ok).toEqual([2])
  })

  it('④ safePublish 返回 null：触发 onFailed(err=null)', async () => {
    const onFailed = vi.fn()
    const bus = { publish: async () => null } as unknown as EventBus
    const p = createPlatformEventProducer({ getBus: () => bus })
    p.publish(input(1), { onFailed })
    await p.flush()
    expect(onFailed).toHaveBeenCalledWith(expect.anything(), null)
  })

  it('⑤ 缺省降级：无 handler 时 warn 不抛', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const bus = { publish: async () => null } as unknown as EventBus
      const p = createPlatformEventProducer({ getBus: () => bus })
      expect(() => p.publish(input(1))).not.toThrow()
      await p.flush()
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('⑥ flush 等待全部入队发布完成', async () => {
    const seen: number[] = []
    const bus = {
      publish: async (i: PublishInput) => {
        await new Promise((r) => setTimeout(r, 5))
        seen.push(i.payload.n as number)
        return i
      },
    } as unknown as EventBus
    const p = createPlatformEventProducer({ getBus: () => bus })
    for (let n = 1; n <= 5; n++) p.publish(input(n))
    await p.flush()
    expect(seen).toEqual([1, 2, 3, 4, 5])
  })
})
