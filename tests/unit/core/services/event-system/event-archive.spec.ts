/**
 * 保留与归档作业单测（10-event-system §6.1 archived / §7.10 / §12.2）
 *
 * - 正常归档：只清 seq < min(所有游标.last_seq) 且超保留期的事件；
 *   全量保留类型（workflow.run.review-*）跳过；导出 JSONL.gz 可还原
 * - 无游标保守跳过；多批次分文件
 * - §7.10 竞态：导出后删除前新建游标（last_seq=0）→ 本轮一条不删
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { PlatformEventBus } from '@core/services/event-system/event-bus.service'
import {
  EventArchiveService,
  type EventArchiveOptions,
} from '@core/services/event-system/event-archive.service'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'
import {
  PlatformEventCursorEntity,
  PlatformEventDeadLetterEntity,
  PlatformEventEntity,
} from '@core/database/entities/platform-event.entities'
import type { PlatformEvent } from '@shared/types/event.types'

const ENTITIES = [PlatformEventEntity, PlatformEventCursorEntity, PlatformEventDeadLetterEntity]

async function makeCtx(opts?: EventArchiveOptions) {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: ENTITIES,
    synchronize: true,
  })
  await ds.initialize()
  // 不 start 的 bus：只写库不分发（归档只关心存储层）
  const bus = new PlatformEventBus(ds)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-archive-'))
  const svc = new EventArchiveService(ds, { archiveDir: dir, ...opts })
  const repo = new PlatformEventRepository(ds)
  return { ds, bus, svc, dir, repo }
}

function input(type: string, aggregateId = 'agg-arch') {
  return { type, aggregate: { kind: 'test', id: aggregateId }, payload: { n: 1 } }
}

/** sqlite datetime 文本（对齐 TypeORM mixedDateToDatetimeString，UTC） */
function sqliteDatetime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '')
}

/** 把 seq ≤ upto 的事件 occurred_at 改为 daysAgo 天前（模拟超保留期） */
async function ageEvents(ds: DataSource, uptoSeq: number, daysAgo: number): Promise<void> {
  await ds.query(`UPDATE platform_events SET occurred_at = ? WHERE seq <= ?`, [
    sqliteDatetime(Date.now() - daysAgo * 86_400_000),
    uptoSeq,
  ])
}

async function eventCount(ds: DataSource): Promise<number> {
  const rows = await ds.query(`SELECT COUNT(*) AS c FROM platform_events`)
  return Number(rows[0].c)
}

function readArchiveFile(file: string): PlatformEvent[] {
  return gunzipSync(fs.readFileSync(file))
    .toString('utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as PlatformEvent)
}

let cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const fn of cleanup) await fn()
  cleanup = []
})

describe('保留与归档（§7.10 / §12.2）', () => {
  it('只清 seq < min(游标) 且超保留期的事件；全量保留类型跳过；JSONL.gz 可还原', async () => {
    const { ds, bus, svc, repo } = await makeCtx()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    // seq1: 人工审核类（全量保留）；seq2-3: 普通事件
    await bus.publish(input('workflow.run.review-requested', 'run-1'))
    await bus.publish(input('kb:doc'))
    await bus.publish(input('kb:doc'))
    // 游标 last_seq=4 → 归档上界 seq < 4
    await repo.ensureCursor('c-arch', '*', 4)
    // seq4: 老事件但未被上界覆盖（seq 不 < 4）；seq5: 新事件（未超保留期）
    await bus.publish(input('kb:doc'))
    await bus.publish(input('kb:doc'))
    await ageEvents(ds, 4, 100) // seq1-4 均超 90 天保留期

    const summary = await svc.runArchiveOnce()
    expect(summary.skippedNoCursors).toBe(false)
    expect(summary.archived).toBe(2) // seq2、seq3
    expect(summary.files).toHaveLength(1)

    // 归档文件可还原：gzip → 每行一个事件信封
    const events = readArchiveFile(summary.files[0])
    expect(events.map(e => e.seq)).toEqual([2, 3])
    expect(events[0].type).toBe('kb:doc')
    expect(events[0].aggregate).toEqual({ kind: 'test', id: 'agg-arch' })

    // 剩余：seq1（全量保留）/ seq4（未越游标）/ seq5（未超保留期）
    expect(await eventCount(ds)).toBe(3)
    const rest = await ds.query(`SELECT seq FROM platform_events ORDER BY seq`)
    expect(rest.map((r: { seq: number }) => Number(r.seq))).toEqual([1, 4, 5])
  })

  it('无任何游标 → 保守跳过（未来 earliest 消费者可能依赖历史）', async () => {
    const { ds, bus, svc } = await makeCtx()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    await bus.publish(input('kb:doc'))
    await bus.publish(input('kb:doc'))
    await ageEvents(ds, 2, 100)

    const summary = await svc.runArchiveOnce()
    expect(summary.skippedNoCursors).toBe(true)
    expect(summary.archived).toBe(0)
    expect(summary.files).toHaveLength(0)
    expect(await eventCount(ds)).toBe(2)
  })

  it('§7.10 竞态：导出后删除前新建游标（last_seq=0）→ 本轮一条不删', async () => {
    const { ds, bus, svc, repo } = await makeCtx({
      beforeDelete: async () => {
        // 模拟归档扫描与删除之间：新消费者以 last_seq=0 建游标（或 requeue 回拨）
        await repo.ensureCursor('c-new', '*', 0)
      },
    })
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    await bus.publish(input('kb:doc'))
    await bus.publish(input('kb:doc'))
    await bus.publish(input('kb:doc'))
    await repo.ensureCursor('c-old', '*', 10) // 扫描时下界 10，三条均可归档
    await ageEvents(ds, 3, 100)

    const summary = await svc.runArchiveOnce()
    // 删除前事务内重读下界被新游标拉到 0 → 本轮不删任何行（文件已导出，下轮重估）
    expect(summary.archived).toBe(0)
    expect(summary.files).toHaveLength(1)
    expect(await eventCount(ds)).toBe(3)
  })

  it('多批次：batchSize 限制下分文件导出，全部归档', async () => {
    const { ds, bus, svc, repo } = await makeCtx({ batchSize: 2 })
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    // 不同聚合避开限流（每 (type,aggregate) 20/分钟）
    for (let i = 0; i < 5; i++) await bus.publish(input('kb:doc', `agg-${i}`))
    await repo.ensureCursor('c-arch', '*', 10)
    await ageEvents(ds, 5, 100)

    const summary = await svc.runArchiveOnce()
    expect(summary.archived).toBe(5)
    expect(summary.files).toHaveLength(3) // 2 + 2 + 1
    const all = summary.files.flatMap(readArchiveFile)
    expect(all.map(e => e.seq)).toEqual([1, 2, 3, 4, 5])
    expect(await eventCount(ds)).toBe(0)
  })

  it('start/stop 幂等；runArchiveOnce 防重入', async () => {
    const { ds, bus, svc, repo } = await makeCtx()
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })
    svc.start()
    svc.start() // 幂等
    svc.stop()
    svc.stop() // 幂等

    await bus.publish(input('kb:doc'))
    await repo.ensureCursor('c-arch', '*', 10)
    await ageEvents(ds, 1, 100)
    const [s1, s2] = await Promise.all([svc.runArchiveOnce(), svc.runArchiveOnce()])
    expect(s1).toBe(s2) // 在途复用同一 Promise
    expect(s1.archived).toBe(1)
  })
})
