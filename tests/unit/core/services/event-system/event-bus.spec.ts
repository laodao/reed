/**
 * 平台事件总线单测（10-event-system §10：投递语义 / 退避与 DLQ / 崩溃恢复 / 重放 / ingest）
 *
 * 用缩短退避序列注入（retryDelaysMs / sweepIntervalMs）替代 fake timer——
 * DB 异步操作与 fake timer 组合易挂起，缩序列更确定。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { PlatformEventBus, type EventBusDriverOptions } from '@core/services/event-system/event-bus.service'
import { EventPayloadError } from '@core/services/event-system/payload-guard'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'
import {
  PlatformEventCursorEntity,
  PlatformEventDeadLetterEntity,
  PlatformEventEntity,
} from '@core/database/entities/platform-event.entities'
import { runWithUser } from '@core/context/user-context'
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

function input(type: string, aggregateId = 'agg-1', payload: unknown = { n: 1 }) {
  return { type, aggregate: { kind: 'test', id: aggregateId }, payload }
}

let cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const fn of cleanup) await fn()
  cleanup = []
})

describe('publish', () => {
  it('写库分配 seq（单调递增）+ ALS userId 快照 + safePublish 返回信封', async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const e1 = await runWithUser('u1', () => bus.publish(input('kb:a')))
    const e2 = await runWithUser('u1', () => bus.publish(input('kb:a')))
    expect(e1).not.toBeNull()
    expect(e2!.seq).toBeGreaterThan(e1!.seq)
    expect(e1!.userId).toBe('u1')
    expect(e1!.actor).toEqual({ kind: 'system', id: null }) // 缺省 actor
    expect(e1!.schemaVersion).toBe(1)

    const rows = await ds.query(`SELECT COUNT(*) AS c FROM platform_events`)
    expect(Number(rows[0].c)).toBe(2)
  })

  it('载荷违规 fail-fast（密钥顶层键 / 超 64KB），基础设施故障才返回 null', async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await expect(bus.publish(input('kb:a', 'x', { password: 'p' }))).rejects.toThrow(
      EventPayloadError
    )
    await expect(
      bus.publish(input('kb:a', 'x', { data: 'x'.repeat(70 * 1024) }))
    ).rejects.toThrow(EventPayloadError)
    // 违规载荷不落库
    const rows = await ds.query(`SELECT COUNT(*) AS c FROM platform_events`)
    expect(Number(rows[0].c)).toBe(0)
  })

  it('tx 路径：同事务写入，不即时分发，由兜底扫描补投', async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()
    const received: PlatformEvent[] = []
    bus.subscribe({ types: ['kb:*'] }, e => { received.push(e) }, { consumerName: 'c-tx' })

    const event = await ds.transaction(manager =>
      bus.publish(input('kb:tx-event'), { tx: manager.queryRunner })
    )
    expect(event).not.toBeNull()
    expect(event!.seq).toBeGreaterThan(0)
    await waitFor(() => received.length === 1) // 提交后由 sweep 补投
    expect(received[0].type).toBe('kb:tx-event')
  })
})

describe('subscribe / 投递语义', () => {
  it('匿名订阅：至多一次即时分发 + 通配符过滤 + unsubscribe 生效', async () => {
    const { ds, bus } = await makeBus({ sweepIntervalMs: 10_000 }) // 关掉兜底干扰
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const received: PlatformEvent[] = []
    const sub = bus.subscribe({ types: ['kb:*'] }, e => { received.push(e) })
    await bus.publish(input('kb:a'))
    await bus.publish(input('voice:b'))
    await waitFor(() => received.length === 1)
    expect(received[0].type).toBe('kb:a')

    await sub.unsubscribe()
    await bus.publish(input('kb:c'))
    await new Promise(r => setTimeout(r, 50))
    expect(received).toHaveLength(1) // 不再收到
  })

  it('命名持久消费者：建游标 + at-least-once 按 seq 有序投递 + 游标前移', async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const received: number[] = []
    runWithUser('u1', () =>
      bus.subscribe({ types: ['kb:*'] }, e => { received.push(e.seq) }, { consumerName: 'c1' })
    )
    await runWithUser('u1', () => bus.publish(input('kb:1')))
    await runWithUser('u1', () => bus.publish(input('voice:无关')))
    await runWithUser('u1', () => bus.publish(input('kb:2')))

    await waitFor(() => received.length === 2)
    expect(received[0]).toBeLessThan(received[1]) // 有序

    const repo = new PlatformEventRepository(ds)
    // ack（游标前移）发生在 handler 之后，等游标追平再断言（消除固有时序竞态）
    await waitFor(async () => {
      const c = await repo.getCursor('c1', 'u1')
      return c !== null && Number(c.lastSeq) >= received[1]
    })
    const cursor = await repo.getCursor('c1', 'u1')
    expect(cursor).not.toBeNull()
    expect(cursor!.lastSeq).toBe(received[1]) // ack = 游标前移（不匹配事件随游标跳过）
  })

  it('聚合过滤：订阅只收指定 aggregate 的事件', async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const received: PlatformEvent[] = []
    bus.subscribe(
      { types: ['workflow.run.*'], aggregate: { kind: 'test', id: 'run-1' } },
      e => { received.push(e) },
      { consumerName: 'c-agg' }
    )
    await bus.publish(input('workflow.run.run-status', 'run-1'))
    await bus.publish(input('workflow.run.run-status', 'run-2'))
    await waitFor(() => received.length === 1)
    expect(received[0].aggregate.id).toBe('run-1')
  })

  it('租户作用域：消费者仅见自己 userId 的事件；* 系统级可见全部', async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const u1Events: PlatformEvent[] = []
    const sysEvents: PlatformEvent[] = []
    runWithUser('u1', () =>
      bus.subscribe({ types: ['kb:*'] }, e => { u1Events.push(e) }, { consumerName: 'c-u1' })
    )
    bus.subscribe({ types: ['kb:*'] }, e => { sysEvents.push(e) }, { consumerName: 'c-sys' }) // 无 ALS → '*'

    await runWithUser('u2', () => bus.publish(input('kb:u2-event')))
    await runWithUser('u1', () => bus.publish(input('kb:u1-event')))

    await waitFor(() => u1Events.length === 1 && sysEvents.length === 2)
    expect(u1Events[0].type).toBe('kb:u1-event') // u2 的事件对 u1 消费者不可见
    expect(sysEvents.map(e => e.type)).toEqual(['kb:u2-event', 'kb:u1-event'])
  })
})

describe('退避重试与死信（§6.1 / §7.4）', () => {
  it('handler 失败按退避序列重试 5 次 → DLQ + 游标跳过毒消息不阻塞后续', async () => {
    const delays = [30, 60, 120, 240, 480]
    const { ds, bus } = await makeBus({ retryDelaysMs: delays, maxAttempts: 5, sweepIntervalMs: 10 })
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const callTimes: number[] = []
    const delivered: string[] = []
    bus.subscribe(
      { types: ['kb:*'] },
      e => {
        if (e.type === 'kb:poison') {
          callTimes.push(Date.now())
          throw new Error('总是失败')
        }
        delivered.push(e.type)
      },
      { consumerName: 'c-retry' }
    )

    await bus.publish(input('kb:poison'))
    const repo = new PlatformEventRepository(ds)
    // 1 次首投 + 5 次重试 = 6 次调用后进 DLQ
    await waitFor(() => callTimes.length === 6, 8000)
    await waitFor(async () => (await repo.listDeadLetters('c-retry')).length === 1)

    // 退避间隔整体非递减（总量 ≥ 序列和的 0.8，留调度抖动余量）
    const total = callTimes[5] - callTimes[0]
    expect(total).toBeGreaterThanOrEqual(delays.reduce((a, b) => a + b, 0) * 0.8)

    const dlq = (await repo.listDeadLetters('c-retry'))[0]
    expect(dlq.status).toBe('pending')
    expect(dlq.attempts).toBe(6)
    expect(dlq.error).toContain('总是失败')
    expect(JSON.parse(dlq.eventJson).type).toBe('kb:poison')

    // 游标跳过毒消息：后续事件正常投递
    await bus.publish(input('kb:after-poison'))
    await waitFor(() => delivered.includes('kb:after-poison'))
    const cursor = await repo.getCursor('c-retry', '*')
    expect(cursor!.lastSeq).toBeGreaterThan(dlq.eventSeq)
    expect(cursor!.retryingSeq).toBeNull()
  })

  it('重试中途恢复：先失败后成功 → 游标前移清重试态', async () => {
    const { ds, bus } = await makeBus({ retryDelaysMs: [30, 60, 120, 240, 480], sweepIntervalMs: 10 })
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    let attempts = 0
    bus.subscribe(
      { types: ['kb:*'] },
      () => {
        attempts++
        if (attempts < 3) throw new Error('前两次失败')
      },
      { consumerName: 'c-flaky' }
    )
    await bus.publish(input('kb:flaky'))
    await waitFor(() => attempts >= 3)

    const repo = new PlatformEventRepository(ds)
    await waitFor(async () => {
      const c = await repo.getCursor('c-flaky', '*')
      return c !== null && c.retryingSeq === null && c.lastSeq > 0
    })
    expect((await repo.listDeadLetters('c-flaky')).length).toBe(0)
  })
})

describe('startFrom 起始位（§5.2，M2 新增）', () => {
  it("startFrom='latest'：新建游标从当前最大 seq 起订、不补历史；之后的事件正常投递", async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const e1 = await bus.publish(input('kb:hist-1'))
    await bus.publish(input('kb:hist-2'))

    const received: PlatformEvent[] = []
    bus.subscribe(
      { types: ['kb:*'] },
      e => { received.push(e) },
      { consumerName: 'c-late', startFrom: 'latest' }
    )

    // 游标建在当前最大 seq（历史两条不补投）
    const repo = new PlatformEventRepository(ds)
    await waitFor(async () => {
      const c = await repo.getCursor('c-late', '*')
      return c !== null && Number(c.lastSeq) >= 0
    })
    await new Promise(r => setTimeout(r, 60)) // 留一轮 pump 窗口
    expect(received).toHaveLength(0)
    expect(Number((await repo.getCursor('c-late', '*'))!.lastSeq)).toBeGreaterThanOrEqual(e1!.seq + 1)

    // 订阅之后的事件正常投递
    await bus.publish(input('kb:new-1'))
    await waitFor(() => received.length === 1)
    expect(received[0].type).toBe('kb:new-1')
  })

  it('缺省 earliest：新建游标补投历史匹配事件（§13 偏差 7 语义保持）', async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    await bus.publish(input('kb:hist'))
    const received: PlatformEvent[] = []
    bus.subscribe({ types: ['kb:*'] }, e => { received.push(e) }, { consumerName: 'c-early' })
    await waitFor(() => received.length === 1)
    expect(received[0].type).toBe('kb:hist')
  })
})

describe('崩溃恢复（§6.3 / §7.1）', () => {
  it('写库成功但未分发（崩溃窗口）→ 重建 bus 启动后补偿投递', async () => {
    const { ds, bus: bus1 } = await makeBus()
    cleanup.push(async () => { await bus1.stop(); await ds.destroy() })
    // bus1 不 start：模拟"INSERT 成功但崩溃于 notify 之前"（只写库不分发）
    const stale: PlatformEvent[] = []
    bus1.subscribe({ types: ['kb:*'] }, e => { stale.push(e) }, { consumerName: 'c-crash' })
    const saved = await bus1.publish(input('kb:lost-in-crash'))
    expect(saved).not.toBeNull()
    await new Promise(r => setTimeout(r, 50))
    expect(stale).toHaveLength(0) // 未 start → 未分发

    // 重建 bus（模拟重启）：同名消费者续游标，boot 扫表补偿
    const bus2 = new PlatformEventBus(ds, { sweepIntervalMs: 10 })
    cleanup.push(async () => { await bus2.stop() })
    const recovered: PlatformEvent[] = []
    bus2.subscribe({ types: ['kb:*'] }, e => { recovered.push(e) }, { consumerName: 'c-crash' })
    await bus2.start()

    await waitFor(() => recovered.length === 1)
    expect(recovered[0].id).toBe(saved!.id)
    expect(recovered[0].type).toBe('kb:lost-in-crash')
  })
})

describe('replay（§5.2）', () => {
  it('类型模式/聚合/时间窗/afterSeq/limit + 租户隔离', async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const base = Date.now()
    await runWithUser('u1', async () => {
      await bus.publish(input('kb:a', 'doc-1'))
      await bus.publish(input('kb:b', 'doc-2'))
      await bus.publish(input('voice:c', 'rec-1'))
    })
    await runWithUser('u2', () => bus.publish(input('kb:other-user', 'doc-9')))

    // u1 视角：kb:* 前缀匹配，只见自己租户（scoped）
    const kbEvents: PlatformEvent[] = []
    for await (const e of runWithUser('u1', () => bus.replay({ types: ['kb:*'] }))) {
      kbEvents.push(e)
    }
    expect(kbEvents.map(e => e.type)).toEqual(['kb:a', 'kb:b'])

    // 聚合过滤 AND
    const aggEvents: PlatformEvent[] = []
    for await (const e of runWithUser('u1', () =>
      bus.replay({ types: ['*'], aggregate: { kind: 'test', id: 'doc-2' } })
    )) {
      aggEvents.push(e)
    }
    expect(aggEvents.map(e => e.type)).toEqual(['kb:b'])

    // afterSeq 断点续放 + limit
    const continued: PlatformEvent[] = []
    for await (const e of runWithUser('u1', () =>
      bus.replay({ types: ['*'], afterSeq: kbEvents[0].seq, limit: 1 })
    )) {
      continued.push(e)
    }
    expect(continued.map(e => e.type)).toEqual(['kb:b'])

    // 时间窗（闭区间）
    const windowed: PlatformEvent[] = []
    for await (const e of runWithUser('u1', () =>
      bus.replay({ types: ['*'], since: base - 1000, until: Date.now() + 1000 })
    )) {
      windowed.push(e)
    }
    expect(windowed.length).toBe(3)
  })
})

describe('ingest（LAN 预留去重契约）', () => {
  it('首存 stored，同 id 再存 duplicate；入库后走正常分发', async () => {
    const { ds, bus } = await makeBus()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const received: PlatformEvent[] = []
    bus.subscribe({ types: ['agent:*'] }, e => { received.push(e) }, { consumerName: 'c-lan' })

    const remote: Omit<PlatformEvent, 'seq'> = {
      id: 'remote-evt-1',
      userId: 'u-remote',
      type: 'agent:task-terminal',
      aggregate: { kind: 'agent_task', id: 't-1' },
      actor: { kind: 'agent', id: 'a-1' },
      payload: { runId: 'r1', taskId: 't-1', outcome: 'succeeded' },
      causationId: null,
      correlationId: 'corr-1',
      occurredAt: Date.now(),
      schemaVersion: 1,
    }
    expect(await bus.ingest(remote)).toBe('stored')
    expect(await bus.ingest(remote)).toBe('duplicate') // id 去重

    const rows = await ds.query(`SELECT COUNT(*) AS c FROM platform_events WHERE id = 'remote-evt-1'`)
    expect(Number(rows[0].c)).toBe(1)

    await waitFor(() => received.length === 1)
    expect(received[0].aggregate).toEqual({ kind: 'agent_task', id: 't-1' })
    expect(received[0].seq).toBeGreaterThan(0) // 分配本地 seq
  })
})
