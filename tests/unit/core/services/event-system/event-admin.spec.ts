/**
 * EventAdmin 单测（10-event-system §5.3）：死信列表 / requeue 两分支 / discard / consumerStats
 *
 * 内存 SQLite + 真实 PlatformEventBus/Repository；退避序列注入缩短（同 event-bus.spec 纪律）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { PlatformEventBus, type EventBusDriverOptions } from '@core/services/event-system/event-bus.service'
import { PlatformEventAdmin } from '@core/services/event-system/event-admin.service'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'
import {
  PlatformEventCursorEntity,
  PlatformEventDeadLetterEntity,
  PlatformEventEntity,
} from '@core/database/entities/platform-event.entities'
import type { PlatformEvent } from '@shared/types/event.types'

const ENTITIES = [PlatformEventEntity, PlatformEventCursorEntity, PlatformEventDeadLetterEntity]

async function makeEnv(busOpts?: EventBusDriverOptions) {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: ENTITIES,
    synchronize: true,
  })
  await ds.initialize()
  const bus = new PlatformEventBus(ds, { sweepIntervalMs: 15, ...busOpts })
  const repo = new PlatformEventRepository(ds)
  const admin = new PlatformEventAdmin(ds, () => bus)
  return { ds, bus, repo, admin }
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

function snapshotOf(over: Partial<PlatformEvent> = {}): Omit<PlatformEvent, 'seq'> {
  return {
    id: 'evt-archived-1',
    userId: null,
    type: 'kb:archived',
    aggregate: { kind: 'test', id: 'agg-archived' },
    actor: { kind: 'system', id: null },
    payload: { n: 42 },
    causationId: null,
    correlationId: null,
    occurredAt: Date.now(),
    schemaVersion: 1,
    ...over,
  }
}

let cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const fn of cleanup) await fn()
  cleanup = []
})

describe('listDeadLetters', () => {
  it('按 consumerName / status 过滤 + DTO 映射（事件快照解析回信封）', async () => {
    const { ds, bus, repo, admin } = await makeEnv()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    const snap = snapshotOf()
    await repo.insertDeadLetter({
      id: 'dl-1', consumerName: 'c-a', userScope: '*', eventSeq: 10,
      eventJson: JSON.stringify({ ...snap, seq: 10 }), error: 'boom', attempts: 6,
      firstFailedAt: new Date(), lastFailedAt: new Date(), status: 'pending', createdAt: new Date(),
    })
    await repo.insertDeadLetter({
      id: 'dl-2', consumerName: 'c-b', userScope: 'u1', eventSeq: 11,
      eventJson: JSON.stringify({ ...snap, seq: 11 }), error: null, attempts: 6,
      firstFailedAt: new Date(), lastFailedAt: new Date(), status: 'discarded', createdAt: new Date(),
    })

    const all = await admin.listDeadLetters({})
    expect(all).toHaveLength(2)
    expect(all[0]).toMatchObject({
      id: 'dl-1', consumerName: 'c-a', userScope: '*', eventSeq: 10,
      error: 'boom', attempts: 6, status: 'pending',
    })
    expect(all[0].event.type).toBe('kb:archived') // 快照解析回信封
    expect(all[0].event.payload).toEqual({ n: 42 })
    expect(all[0].firstFailedAt).toBeGreaterThan(0)

    expect((await admin.listDeadLetters({ consumerName: 'c-b' })).map(d => d.id)).toEqual(['dl-2'])
    expect((await admin.listDeadLetters({ status: 'pending' })).map(d => d.id)).toEqual(['dl-1'])
    expect(await admin.listDeadLetters({ consumerName: 'c-a', status: 'discarded' })).toHaveLength(0)
  })
})

describe('requeue：事件仍在库分支（游标回拨 event_seq-1）', () => {
  it('毒消息进 DLQ 后 requeue → 游标回拨 + 状态 requeued + 事件被重投成功', async () => {
    const { ds, bus, repo, admin } = await makeEnv({ retryDelaysMs: [10, 10, 10, 10, 10], maxAttempts: 1 })
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    // 先产一条毒消息进 DLQ（maxAttempts=1：首投失败 + 1 次重试 → DLQ）
    let fail = true
    const delivered: number[] = []
    const sub = bus.subscribe(
      { types: ['kb:*'] },
      e => {
        if (fail) throw new Error('毒消息')
        delivered.push(e.seq)
      },
      { consumerName: 'c-rq' }
    )
    const saved = await bus.publish(input('kb:poison'))
    await waitFor(async () => (await repo.listDeadLetters('c-rq')).length === 1)
    const dl = (await repo.listDeadLetters('c-rq'))[0]
    expect(dl.eventSeq).toBe(saved!.seq)
    // DLQ 后游标已跳过毒消息
    expect(Number((await repo.getCursor('c-rq', '*'))!.lastSeq)).toBeGreaterThanOrEqual(dl.eventSeq)

    // requeue：游标回拨到 event_seq-1，重投（handler 已恢复）
    fail = false
    await admin.requeue(dl.id)

    // 重投成功 → 游标再次前移过该 seq；死信收口为 requeued
    await waitFor(() => delivered.includes(dl.eventSeq))
    await waitFor(async () => Number((await repo.getCursor('c-rq', '*'))!.lastSeq) >= dl.eventSeq)
    expect((await repo.findDeadLetterById(dl.id))!.status).toBe('requeued')

    await sub.unsubscribe()
  })

  it('游标不存在时 requeue → 按 event_seq-1 新建游标（消费者下次订阅续扫）', async () => {
    const { ds, bus, repo, admin } = await makeEnv()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const saved = await bus.publish(input('kb:in-lib'))
    await repo.insertDeadLetter({
      id: 'dl-nocursor', consumerName: 'c-new', userScope: '*', eventSeq: saved!.seq,
      eventJson: JSON.stringify({ ...snapshotOf(), seq: saved!.seq }), error: 'x', attempts: 6,
      firstFailedAt: new Date(), lastFailedAt: new Date(), status: 'pending', createdAt: new Date(),
    })

    await admin.requeue('dl-nocursor')
    const cursor = await repo.getCursor('c-new', '*')
    expect(cursor).not.toBeNull()
    expect(Number(cursor!.lastSeq)).toBe(saved!.seq - 1)
    expect(cursor!.retryingSeq).toBeNull()
  })
})

describe('requeue：已归档分支（重放入库新 seq）', () => {
  it('event_seq 行不存在 → 按快照 ingest 入库（保留原 id、分配新 seq）+ 正常分发', async () => {
    const { ds, bus, repo, admin } = await makeEnv()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    await bus.start()

    const received: PlatformEvent[] = []
    bus.subscribe({ types: ['kb:*'] }, e => { received.push(e) }, { consumerName: 'c-arch' })

    const snap = snapshotOf({ id: 'evt-arch-9', type: 'kb:requeue-me' })
    await repo.insertDeadLetter({
      id: 'dl-arch', consumerName: 'c-arch', userScope: '*', eventSeq: 9999, // 库中无此 seq
      eventJson: JSON.stringify({ ...snap, seq: 9999 }), error: 'x', attempts: 6,
      firstFailedAt: new Date(), lastFailedAt: new Date(), status: 'pending', createdAt: new Date(),
    })

    await admin.requeue('dl-arch')

    // 重放入库：同 id 新行、新 seq
    const rows = await ds.query(`SELECT seq, id, type FROM platform_events WHERE id = 'evt-arch-9'`)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].seq)).not.toBe(9999)
    expect(rows[0].type).toBe('kb:requeue-me')

    // 走正常分发路径（消费者实时收到）
    await waitFor(() => received.length === 1)
    expect(received[0].id).toBe('evt-arch-9')
    expect((await repo.findDeadLetterById('dl-arch'))!.status).toBe('requeued')
  })

  it('已归档但总线未就绪 → 报可读错误（不落库）', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true,
    })
    await ds.initialize()
    cleanup.push(async () => { await ds.destroy() })
    const repo = new PlatformEventRepository(ds)
    const adminNoBus = new PlatformEventAdmin(ds, () => null)

    await repo.insertDeadLetter({
      id: 'dl-nobus', consumerName: 'c-x', userScope: '*', eventSeq: 8888,
      eventJson: JSON.stringify({ ...snapshotOf(), seq: 8888 }), error: 'x', attempts: 6,
      firstFailedAt: new Date(), lastFailedAt: new Date(), status: 'pending', createdAt: new Date(),
    })
    await expect(adminNoBus.requeue('dl-nobus')).rejects.toThrow('事件总线未就绪')
    expect((await repo.findDeadLetterById('dl-nobus'))!.status).toBe('pending') // 未收口
  })
})

describe('requeue / discard 状态守卫', () => {
  it('非 pending 死信拒绝重复操作；不存在的 id 报错', async () => {
    const { ds, bus, repo, admin } = await makeEnv()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    await repo.insertDeadLetter({
      id: 'dl-done', consumerName: 'c-a', userScope: '*', eventSeq: 1,
      eventJson: JSON.stringify({ ...snapshotOf(), seq: 1 }), error: null, attempts: 6,
      firstFailedAt: new Date(), lastFailedAt: new Date(), status: 'discarded', createdAt: new Date(),
    })
    await expect(admin.requeue('dl-done')).rejects.toThrow('已收口')
    await expect(admin.discard('dl-done')).rejects.toThrow('已收口')
    await expect(admin.requeue('missing')).rejects.toThrow('死信不存在')
    await expect(admin.discard('missing')).rejects.toThrow('死信不存在')
  })

  it('discard：pending → discarded', async () => {
    const { ds, bus, repo, admin } = await makeEnv()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    await repo.insertDeadLetter({
      id: 'dl-drop', consumerName: 'c-a', userScope: '*', eventSeq: 1,
      eventJson: JSON.stringify({ ...snapshotOf(), seq: 1 }), error: 'x', attempts: 6,
      firstFailedAt: new Date(), lastFailedAt: new Date(), status: 'pending', createdAt: new Date(),
    })
    await admin.discard('dl-drop')
    expect((await repo.findDeadLetterById('dl-drop'))!.status).toBe('discarded')
  })
})

describe('consumerStats', () => {
  it('返回游标水位 + lag（作用域内未消费数）+ retrying 标记', async () => {
    const { ds, bus, repo, admin } = await makeEnv({ sweepIntervalMs: 10_000 }) // 关兜底扫描干扰
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    // 不 start bus：纯游标/事件数据布景

    // c1（系统级）：last_seq=1；c2（u1 租户）：last_seq=0 且重试中
    await repo.ensureCursor('c1', '*', 1)
    await repo.ensureCursor('c2', 'u1', 0)
    await repo.markRetrying('c2', 'u1', 2, null, 1, new Date(Date.now() + 1000), 'err')

    await bus.publish(input('kb:e1')) // seq 1（无 ALS → userId null）
    const e2 = await bus.publish(input('kb:e2')) // seq 2
    expect(e2!.seq).toBe(2)

    const stats = await admin.consumerStats()
    const c1 = stats.find(s => s.consumerName === 'c1')!
    const c2 = stats.find(s => s.consumerName === 'c2')!
    // c1：lastSeq=1，系统级可见全部 → lag=1（seq2）
    expect(c1).toMatchObject({ lastSeq: 1, lag: 1, retrying: false })
    // c2：lastSeq=0，user_scope='u1' 只见 u1 事件 → 两条事件 userId 均为 null，lag=0
    expect(c2).toMatchObject({ lastSeq: 0, lag: 0, retrying: true })
  })
})
