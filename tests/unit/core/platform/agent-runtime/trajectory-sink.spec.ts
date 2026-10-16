/**
 * TrajectorySink 契约测试（25 号 M2 批1）
 *
 * 钉死：flush 串行排空、seq 从 maxSeq 续接（崩溃恢复不重不漏）、port=null 降级
 * no-op、落库失败不外泄（观测面纪律）、并发 flush 不撕裂。
 */

import { describe, it, expect } from 'vitest'
import { TrajectorySink, type TrajectoryAppendPort } from '@core/platform/agent-runtime/trajectory/sink'
import type { TrajectoryEntry } from '@core/platform/agent-runtime/types'

type PortRow = Parameters<TrajectoryAppendPort['appendBatch']>[0][number]

function entry(partial: Partial<TrajectoryEntry> = {}): TrajectoryEntry {
  return { iteration: 0, kind: 'decision', payload: {}, ...partial }
}

interface FakePort extends TrajectoryAppendPort {
  batches: PortRow[][]
}

function fakePort(overrides: Partial<TrajectoryAppendPort> = {}): FakePort {
  const port: FakePort = {
    batches: [],
    async appendBatch(rows) {
      port.batches.push(rows)
    },
    async maxSeq() {
      return 0
    },
  }
  return Object.assign(port, overrides)
}

describe('TrajectorySink', () => {
  it('append 只入缓冲；flush 排空并按 buffer 序分配连续 seq', async () => {
    const port = fakePort()
    const sink = new TrajectorySink(port, { scope: 'workflow', scopeKey: 'r1:n1:0' })
    sink.append(entry({ kind: 'decision' }))
    sink.append(entry({ kind: 'tool_call', name: 'http_get' }))
    expect(port.batches).toHaveLength(0)
    await sink.flush()
    expect(port.batches).toHaveLength(1)
    expect(port.batches[0].map((r) => r.seq)).toEqual([1, 2])
    expect(port.batches[0][1].name).toBe('http_get')
    expect(sink.flushedCount).toBe(2)
    await sink.flush() // 空缓冲 no-op
    expect(port.batches).toHaveLength(1)
  })

  it('seq 从库内 maxSeq 续接（崩溃恢复重放不产生重复主键）', async () => {
    const port = fakePort({ maxSeq: async () => 5 })
    const sink = new TrajectorySink(port, { scope: 'workflow', scopeKey: 'r1:n1:0' })
    sink.append(entry())
    sink.append(entry())
    await sink.flush()
    expect(port.batches[0].map((r) => r.seq)).toEqual([6, 7])
  })

  it('port=null 降级 no-op（flush 正常返回，不落库）', async () => {
    const sink = new TrajectorySink(null, { scope: 'session', scopeKey: 'session:d:s' })
    sink.append(entry())
    await expect(sink.flush()).resolves.toBeUndefined()
    expect(sink.flushedCount).toBe(0)
  })

  it('appendBatch 抛错不外泄（flush resolves，批丢弃只留痕）', async () => {
    const port = fakePort({
      appendBatch: async () => {
        throw new Error('db down')
      },
    })
    const sink = new TrajectorySink(port, { scope: 'workflow', scopeKey: 'r1:n1:0' })
    sink.append(entry())
    await expect(sink.flush()).resolves.toBeUndefined()
    expect(sink.flushedCount).toBe(0)
  })

  it('maxSeq 抛错批丢弃（观测面失败不外泄）且 seq 起点未锁死，下次 flush 重新初始化续接（review D5）', async () => {
    let failMaxSeq = true
    const port = fakePort({
      maxSeq: async () => {
        if (failMaxSeq) throw new Error('maxSeq failed')
        return 3
      },
    })
    const sink = new TrajectorySink(port, { scope: 'workflow', scopeKey: 'r1:n1:0' })
    sink.append(entry({ kind: 'decision' }))
    await expect(sink.flush()).resolves.toBeUndefined() // 失败不外泄，批丢弃
    expect(port.batches).toHaveLength(0)
    expect(sink.flushedCount).toBe(0)
    failMaxSeq = false
    sink.append(entry({ kind: 'final' }))
    await sink.flush()
    // nextSeq 未被锁死在错误态：重新读 maxSeq=3 续接 → final 落 seq 4
    expect(port.batches).toHaveLength(1)
    expect(port.batches[0].map((r) => r.seq)).toEqual([4])
    expect(port.batches[0][0].kind).toBe('final')
  })

  it('并发 flush 串行化且不丢条目（chained promise），seq 跨批接续', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const port = fakePort({
      appendBatch: async (rows) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight--
        port.batches.push(rows)
      },
    })
    const sink = new TrajectorySink(port, { scope: 'workflow', scopeKey: 'r1:n1:0' })
    sink.append(entry({ kind: 'decision' }))
    const f1 = sink.flush()
    sink.append(entry({ kind: 'final' }))
    const f2 = sink.flush()
    await Promise.all([f1, f2])
    expect(maxInFlight).toBe(1) // 串行
    expect(sink.flushedCount).toBe(2)
    expect(port.batches[0][0].seq).toBe(1)
    expect(port.batches[1][0].seq).toBe(2) // 第二批接续
  })

  it('scope/scopeKey 透传给仓储行', async () => {
    const port = fakePort()
    const sink = new TrajectorySink(port, { scope: 'session', scopeKey: 'session:d1:s1' })
    sink.append(entry())
    await sink.flush()
    expect(port.batches[0][0]).toMatchObject({ scope: 'session', scopeKey: 'session:d1:s1' })
  })
})
