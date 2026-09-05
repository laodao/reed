/**
 * 背压拉模式单测（10-event-system §7.7 / §10 背压测试）
 *
 * - 命名持久消费者：阻塞 handler + 100 条事件 → in-flight 达 maxInFlight 切拉模式，
 *   兜底扫描按游标追赶：无丢失、无重复、聚合内 seq 单调；水位回落切回推模式
 * - 匿名订阅者：队列满丢弃并 warn（至多一次语义允许）
 */
import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { PlatformEventBus, type EventBusDriverOptions } from '@core/platform/services/event-system/event-bus.service'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'
import {
  PlatformEventCursorEntity,
  PlatformEventDeadLetterEntity,
  PlatformEventEntity,
} from '@core/database/entities/platform-event.entities'
import type { PlatformEvent } from '@shared/types/event.types'

const ENTITIES = [PlatformEventEntity, PlatformEventCursorEntity, PlatformEventDeadLetterEntity]

async function makeBus(opts?: EventBusDriverOptions) {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: ENTITIES,
    synchronize: true,
  })
  await ds.initialize()
  const bus = new PlatformEventBus(ds, { sweepIntervalMs: 15, ...opts })
  return { ds, bus }
}

async function waitFor(cond: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await cond()) return
    if (Date.now() > deadline) throw new Error('waitFor 超时')
    await new Promise(r => setTimeout(r, 10))
  }
}

function input(type: string, aggregateId = 'agg-1') {
  return { type, aggregate: { kind: 'test', id: aggregateId }, payload: { n: 1 } }
}

let cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const fn of cleanup) await fn()
  cleanup = []
})

describe('背压拉模式（§7.7）', () => {
  it('阻塞 handler + 100 条事件：切拉模式 → 追赶无丢失无重复、聚合内 seq 单调、水位回落切回推模式', async () => {
    // 关闭限流（§7.8 默认 20/分钟/key 会丢掉同聚合高频事件，与背压正交）
    const { ds, bus } = await makeBus({ rateLimits: [{ pattern: '*', maxPerMinute: 0 }] })
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const received: number[] = []
    bus.subscribe(
      { types: ['kb:*'] },
      async e => {
        await gate
        received.push(e.seq)
      },
      { consumerName: 'c-bp', maxInFlight: 5 }
    )

    // 等游标建好（消费者就绪），避免初始 pump 时序干扰水位断言
    const repo = new PlatformEventRepository(ds)
    await waitFor(async () => (await repo.getCursor('c-bp', '*')) !== null)

    for (let i = 0; i < 100; i++) await bus.publish(input('kb:bp'))

    // handler 被 gate 阻塞：水位到 5 后实时分发切拉模式（兜底扫描接管）
    await waitFor(() => bus.getConsumerPressure('c-bp', '*')?.pullMode === true)

    release()
    await waitFor(() => received.length === 100, 15000)

    // 无丢失无重复；单聚合 → seq 严格单调（§5.5 聚合有序）
    expect(new Set(received).size).toBe(100)
    for (let i = 1; i < received.length; i++) {
      expect(received[i]).toBeGreaterThan(received[i - 1])
    }

    // 水位回落到一半以下 → 切回推模式
    await waitFor(() => bus.getConsumerPressure('c-bp', '*')?.pullMode === false)
    expect(bus.getConsumerPressure('c-bp', '*')!.inFlight).toBe(0)

    // 游标已推进到最大 seq（兜底追赶完成）
    const cursor = await repo.getCursor('c-bp', '*')
    expect(cursor!.lastSeq).toBe(received[received.length - 1])
  })

  it('推模式正常路径：水位充裕时实时分发不降级（不依赖兜底扫描）', async () => {
    const { ds, bus } = await makeBus({ sweepIntervalMs: 10_000 }) // 关掉兜底干扰
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const received: number[] = []
    bus.subscribe(
      { types: ['kb:*'] },
      e => { received.push(e.seq) },
      { consumerName: 'c-push' } // 缺省 maxInFlight=1000
    )
    const repo = new PlatformEventRepository(ds)
    await waitFor(async () => (await repo.getCursor('c-push', '*')) !== null)

    for (let i = 0; i < 3; i++) await bus.publish(input('kb:push'))
    await waitFor(() => received.length === 3)
    const pressure = bus.getConsumerPressure('c-push', '*')!
    expect(pressure.pullMode).toBe(false)
    expect(pressure.maxInFlight).toBe(1000)
    await waitFor(() => bus.getConsumerPressure('c-push', '*')!.inFlight === 0)
  })

  it('匿名订阅者队列满：丢弃并 warn（至多一次语义），水位内的事件正常投递', async () => {
    const { ds, bus } = await makeBus({ anonymousMaxInFlight: 3, sweepIntervalMs: 10_000 })
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const received: PlatformEvent[] = []
    bus.subscribe({ types: ['kb:*'] }, async e => {
      await gate
      received.push(e)
    })

    for (let i = 0; i < 10; i++) await bus.publish(input(`kb:anon-${i}`))
    await new Promise(r => setTimeout(r, 50))
    expect(received).toHaveLength(0) // gate 阻塞中

    release()
    await waitFor(() => received.length === 3) // 仅水位内的 3 条在途，其余 7 条已丢弃
    await new Promise(r => setTimeout(r, 50))
    expect(received).toHaveLength(3) // 丢弃的不补投
  })
})
