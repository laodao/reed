/**
 * 生产者侧限流单测（10-event-system §7.8）
 *
 * - EventRateLimiter 纯函数面：类型族默认阈值 / 首条命中生效 / 滑动窗口 / marker 节流
 * - bus 接线：超限丢弃（返回 null）+ 记 system.event.rate-limited（每 key 每窗口至多一条）；
 *   workflow.run.* 高频进度事件默认不误杀；限流键含 aggregate（不同聚合各自计数）
 */
import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { PlatformEventBus } from '@core/platform/services/event-system/event-bus.service'
import {
  DEFAULT_EVENT_RATE_LIMITS,
  EventRateLimiter,
  RATE_LIMITED_EVENT_TYPE,
  EventRateLimitError,
} from '@core/platform/services/event-system/event-rate-limit'
import {
  PlatformEventCursorEntity,
  PlatformEventDeadLetterEntity,
  PlatformEventEntity,
} from '@core/database/entities/platform-event.entities'

const ENTITIES = [PlatformEventEntity, PlatformEventCursorEntity, PlatformEventDeadLetterEntity]

async function makeDs() {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: ENTITIES,
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

function input(type: string, aggregateId = 'agg-1') {
  return { type, aggregate: { kind: 'test', id: aggregateId }, payload: { n: 1 } }
}

let cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const fn of cleanup) await fn()
  cleanup = []
})

describe('EventRateLimiter 纯函数面（§7.8）', () => {
  it('默认阈值按类型族区分：system.event.* 与 workflow.run.* 不限，其余为风暴兜底量级', () => {
    const l = new EventRateLimiter()
    // 不限流族：同 key 连发 100 次全放行
    for (let i = 0; i < 100; i++) {
      expect(l.allow('workflow.run.node-progress', 'workflow.run.node-progress|workflow_run|r1')).toBe(true)
      expect(l.allow('system.event.rate-limited', 'system.event.rate-limited|test|agg')).toBe(true)
    }
    // 兜底族：额度内全放行，超一次拒绝（阈值读常量——2026-09-06 起为风暴兜底量级 600）
    const key = 'kb:document-completed|kb_doc|d1'
    const cap = DEFAULT_EVENT_RATE_LIMITS.find(r => r.pattern === '*')!.maxPerMinute
    for (let i = 0; i < cap; i++) expect(l.allow('kb:document-completed', key)).toBe(true)
    expect(l.allow('kb:document-completed', key)).toBe(false)
  })

  it('首条命中生效：具体规则优先于兜底 *', () => {
    const l = new EventRateLimiter([
      { pattern: 'kb:*', maxPerMinute: 2 },
      { pattern: '*', maxPerMinute: 5 },
    ])
    const kbKey = 'kb:a|test|agg'
    expect(l.allow('kb:a', kbKey)).toBe(true)
    expect(l.allow('kb:a', kbKey)).toBe(true)
    expect(l.allow('kb:a', kbKey)).toBe(false) // kb:* 限 2
    const voiceKey = 'voice:a|test|agg'
    for (let i = 0; i < 5; i++) expect(l.allow('voice:a', voiceKey)).toBe(true)
    expect(l.allow('voice:a', voiceKey)).toBe(false) // 兜底限 5
  })

  it('滑动窗口：窗口滑出后额度恢复', () => {
    let t = 1_000_000
    // 注入显式小阈值，测试独立于默认常量（2026-09-06 默认上调为风暴兜底量级）
    const l = new EventRateLimiter([{ pattern: '*', maxPerMinute: 2 }], 60_000, () => t)
    const key = 'kb:x|test|agg'
    expect(l.allow('kb:x', key)).toBe(true)
    expect(l.allow('kb:x', key)).toBe(true)
    expect(l.allow('kb:x', key)).toBe(false)
    t += 30_000 // 半窗口：最早 2 条仍在窗口内
    expect(l.allow('kb:x', key)).toBe(false)
    t += 31_000 // 整窗滑出
    expect(l.allow('kb:x', key)).toBe(true)
  })

  it('marker 节流：同窗口第二次拒绝，跨窗口恢复', () => {
    let t = 1_000_000
    const l = new EventRateLimiter(DEFAULT_EVENT_RATE_LIMITS, 60_000, () => t)
    expect(l.shouldMark('k')).toBe(true)
    expect(l.shouldMark('k')).toBe(false)
    t += 61_000
    expect(l.shouldMark('k')).toBe(true)
  })
})

describe('publish 限流接线（§7.8）', () => {
  it('超限抛 EventRateLimitError（清晰报错）+ 每 key 每窗口记一条 system.event.rate-limited', async () => {
    const ds = await makeDs()
    const bus = new PlatformEventBus(ds) // 默认规则
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    let dropped = 0
    for (let i = 0; i < DEFAULT_EVENT_RATE_LIMITS.find(r => r.pattern === '*')!.maxPerMinute + 5; i++) {
      try {
        await bus.publish(input('kb:flood', 'agg-f'))
      } catch (e) {
        if (e instanceof EventRateLimitError) dropped++ // 超限：清晰报错（fail-fast）
        else throw e
      }
    }
    expect(dropped).toBe(5) // 额度放行 + 5 超限拒绝（阈值读常量）

    const rows = await ds.query(
      `SELECT type, COUNT(*) AS c FROM platform_events GROUP BY type ORDER BY type`
    )
    const byType = Object.fromEntries(rows.map((r: { type: string; c: number }) => [r.type, Number(r.c)]))
    expect(byType['kb:flood']).toBe(DEFAULT_EVENT_RATE_LIMITS.find(r => r.pattern === '*')!.maxPerMinute)
    expect(byType[RATE_LIMITED_EVENT_TYPE]).toBe(1) // marker 节流：5 条超限只记 1 条

    const marker = await ds.query(
      `SELECT payload_json, aggregate_id, actor_kind FROM platform_events WHERE type = ?`,
      [RATE_LIMITED_EVENT_TYPE]
    )
    const payload = JSON.parse(marker[0].payload_json)
    expect(payload.limitedType).toBe('kb:flood')
    expect(payload.maxPerMinute).toBe(DEFAULT_EVENT_RATE_LIMITS.find(r => r.pattern === '*')!.maxPerMinute)
    expect(marker[0].aggregate_id).toBe('agg-f') // 沿用被限事件聚合
    expect(marker[0].actor_kind).toBe('system')
  })

  it('workflow.run.* 高频进度事件默认不限（§7.8 不误杀前端推送）', async () => {
    const ds = await makeDs()
    const bus = new PlatformEventBus(ds)
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    for (let i = 0; i < 50; i++) {
      const r = await bus.publish(input('workflow.run.node-progress', 'run-1'))
      expect(r).not.toBeNull() // 正常发布
    }
    const rows = await ds.query(
      `SELECT COUNT(*) AS c FROM platform_events WHERE type = 'system.event.rate-limited'`
    )
    expect(Number(rows[0].c)).toBe(0) // 无限流 marker
  })

  it('限流键含 (type, aggregate)：不同聚合各自计数', async () => {
    const ds = await makeDs()
    const bus = new PlatformEventBus(ds)
    cleanup.push(async () => { await bus.stop(); await ds.destroy() })

    for (let i = 0; i < 20; i++) {
      expect(await bus.publish(input('kb:x', 'agg-a'))).not.toBeNull()
      expect(await bus.publish(input('kb:x', 'agg-b'))).not.toBeNull()
    }
    await expect(bus.publish(input('kb:x', 'agg-a'))).rejects.toThrow(EventRateLimitError) // agg-a 超限：清晰报错
    await expect(bus.publish(input('kb:x', 'agg-b'))).rejects.toThrow(EventRateLimitError) // agg-b 超限
    expect(await bus.publish(input('kb:x', 'agg-c'))).not.toBeNull() // 新聚合独立窗口
  })
})
