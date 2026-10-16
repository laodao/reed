/**
 * WorkflowRunEventRepository + DbJournal 真实 DataSource 契约测试
 * @module tests/core/database/workflow-run-event.repository.spec
 *
 * 背景（总收口 review P0×2 + P1）：此前 25 例引擎测试全用 InMemoryJournal，
 * 生产路径零覆盖——id 从不生成（SQLite NULL 主键 find 去重塌缩 / PG 违约）、
 * appendBatchAtomic 绕过租户 scoped（批事件 user_id=NULL 属主不可见）、
 * latestSnapshot 调不存在的 createQueryBuilder（死代码）。本 spec 用真实
 * better-sqlite3 + 迁移钉死这三条不再回退。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { WorkflowRunEventRepository } from '@core/database/repositories/workflow-run-event.repository'
import { createWorkflowRunEvents } from '@core/database/migrations/create-workflow-run-events'
import { DbJournal } from '@core/platform/workflow/engine/journal'
import { runWithUserAsync } from '@core/context/user-context'

let ds: DataSource | null = null

async function buildDs(): Promise<DataSource> {
  const d = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [(await import('@core/database/entities/workflow-run-event.entity')).WorkflowRunEventEntity],
    synchronize: false,
  })
  await d.initialize()
  await createWorkflowRunEvents(d)
  return d
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('事件行主键与租户注入（P0 回归）', () => {
  it('append/appendBatchAtomic 都生成非空 id；属主上下文 listByRun 返回全部行（NULL 主键去重塌缩回归）', async () => {
    ds = await buildDs()
    const repo = new WorkflowRunEventRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.append({ runId: 'r1', seq: 0, type: 'run_started', payload: { a: 1 } })
      await repo.appendBatchAtomic([
        { runId: 'r1', seq: 1, type: 'edge_activated', nodeId: 'n1' },
        { runId: 'r1', seq: 2, type: 'edge_activated', nodeId: 'n2' },
        { runId: 'r1', seq: 3, type: 'node_launched', nodeId: 'n1' },
      ])
      const rows = await repo.listByRun('r1')
      expect(rows.map((r) => r.seq)).toEqual([0, 1, 2, 3]) // 全量可见——塌缩回归
      expect(rows.every((r) => typeof r.id === 'string' && r.id.length > 0)).toBe(true)
      expect(rows.every((r) => r.createdAt !== null)).toBe(true) // created_at 不再恒 NULL
    })
  })

  it('appendBatchAtomic 注入 ALS userId（批事件与单条事件同轨，属主可见）', async () => {
    ds = await buildDs()
    const repo = new WorkflowRunEventRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.appendBatchAtomic([{ runId: 'r2', seq: 1, type: 'edge_activated', nodeId: 'n1' }])
    })
    // 裸查行（无 ALS）核对 user_id 落值
    const raw = await ds.query("SELECT user_id FROM workflow_run_events WHERE run_id = 'r2'")
    expect(raw[0].user_id).toBe('u1')
    // 属主读可见；他人读不可见
    await runWithUserAsync('u1', async () => {
      expect((await repo.listByRun('r2')).length).toBe(1)
    })
    await runWithUserAsync('u2', async () => {
      expect((await repo.listByRun('r2')).length).toBe(0)
    })
  })

  it('appendBatchAtomic 原子性：批内 seq 冲突整体回滚', async () => {
    ds = await buildDs()
    const repo = new WorkflowRunEventRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.append({ runId: 'r3', seq: 5, type: 'run_started' })
      await expect(
        repo.appendBatchAtomic([
          { runId: 'r3', seq: 6, type: 'edge_activated' },
          { runId: 'r3', seq: 5, type: 'edge_activated' }, // 冲突
          { runId: 'r3', seq: 7, type: 'edge_activated' },
        ]),
      ).rejects.toThrow()
      const rows = await repo.listByRun('r3')
      expect(rows.map((r) => r.seq)).toEqual([5]) // 批整体未写入
    })
  })
})

describe('latestSnapshot（死代码回归）', () => {
  it('返回最近快照行（此前恒 TypeError 被 .catch 吞成无快照）', async () => {
    ds = await buildDs()
    const journal = new DbJournal(new WorkflowRunEventRepository(ds))
    await runWithUserAsync('u1', async () => {
      await journal.append({ runId: 'r4', seq: 0, type: 'run_started', payload: {} })
      await journal.append({ runId: 'r4', seq: 1, type: 'snapshot', payload: { v: 1, state: { a: 1 } } })
      await journal.append({ runId: 'r4', seq: 2, type: 'snapshot', payload: { v: 1, state: { a: 2 } } })
      const snap = await journal.latestSnapshot!('r4')
      expect(snap?.seq).toBe(2)
      expect((snap?.payload as { state?: { a?: number } })?.state?.a).toBe(2)
      expect(await journal.latestSnapshot!('nonexistent')).toBeNull()
    })
  })
})
