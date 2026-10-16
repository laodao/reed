/**
 * AgentTaskRepository / AgentMemoryEntryRepository 真实 DataSource 契约测试（26 号 M3 批1）
 *
 * 钉死：租户隔离（ALS 注入与过滤）、树查询、patch 映射（JSON 列）、代谢归档、
 * 双端迁移幂等。真实 better-sqlite3 + 迁移（生产路径零 mock）。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AgentTaskRepository } from '@core/database/repositories/agent-task.repository'
import { AgentMemoryEntryRepository } from '@core/database/repositories/agent-memory-entry.repository'
import { createAgentTasks } from '@core/database/migrations/create-agent-tasks'
import { createAgentMemoryEntries } from '@core/database/migrations/create-agent-memory-entries'
import { runWithUserAsync } from '@core/context/user-context'

let ds: DataSource | null = null

async function buildDs(): Promise<DataSource> {
  const d = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      (await import('@core/database/entities/agent-task.entity')).AgentTaskEntity,
      (await import('@core/database/entities/agent-memory-entry.entity')).AgentMemoryEntryEntity,
    ],
    synchronize: false,
  })
  await d.initialize()
  await createAgentTasks(d)
  await createAgentMemoryEntries(d)
  return d
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('AgentTaskRepository', () => {
  it('create/listByRoot 树查询（深度序）；属主可见、他人不可见', async () => {
    ds = await buildDs()
    const repo = new AgentTaskRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'r1', parentId: null, rootId: 'r1', depth: 0, title: '根', spec: { goal: 'g' }, status: 'ready', executor: 'agent_loop' })
      await repo.create({ id: 'c1', parentId: 'r1', rootId: 'r1', depth: 1, title: '叶', spec: { goal: 'g2', acceptance: 'a' }, status: 'ready', executor: 'agent_loop' })
      const tree = await repo.listByRoot('r1')
      expect(tree.map((t) => t.id)).toEqual(['r1', 'c1'])
      expect(tree[1].spec).toEqual({ goal: 'g2', acceptance: 'a' })
    })
    await runWithUserAsync('u2', async () => {
      expect(await repo.listByRoot('r1')).toHaveLength(0)
    })
  })

  it('patch 映射（status/qualityScore/result/retryCount）与重复创建冲突', async () => {
    ds = await buildDs()
    const repo = new AgentTaskRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'r2', parentId: null, rootId: 'r2', depth: 0, title: 't', spec: { goal: 'g' }, status: 'running', executor: 'agent_loop' })
      await repo.patch('r2', { status: 'succeeded', qualityScore: 0.88, result: { answer: 'x' }, retryCount: 1 })
      const row = await repo.getById('r2')
      expect(row).toMatchObject({ status: 'succeeded', qualityScore: 0.88, retryCount: 1 })
      expect(row?.result).toEqual({ answer: 'x' })
      await expect(repo.create({ id: 'r2', parentId: null, rootId: 'r2', depth: 0, title: 'dup', spec: {}, status: 'ready', executor: 'agent_loop' })).rejects.toThrow()
    })
  })
})

describe('AgentMemoryEntryRepository', () => {
  it('create/listByStatus/patch（use_count/success_count 回写）+ 租户过滤', async () => {
    ds = await buildDs()
    const repo = new AgentMemoryEntryRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'm1', kind: 'sop', content: { title: 't', content: 'c' }, status: 'active', confidence: 0.9 })
      await repo.create({ id: 'm2', kind: 'fact', content: { title: 't2', content: 'c2' }, status: 'pending_review' })
      expect((await repo.listActive()).map((r) => r.id)).toEqual(['m1'])
      expect((await repo.listByStatus('pending_review')).map((r) => r.id)).toEqual(['m2'])
      await repo.patch('m1', { useCount: 3, successCount: 2 })
      expect(await repo.getById('m1')).toMatchObject({ useCount: 3, successCount: 2 })
    })
    await runWithUserAsync('u2', async () => {
      expect(await repo.listActive()).toHaveLength(0)
    })
  })

  it('archiveStaleBefore：零命中且超期归档，新条目不受影响', async () => {
    ds = await buildDs()
    const repo = new AgentMemoryEntryRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'old', kind: 'fact', content: { title: 'o', content: 'x' }, status: 'active' })
      await repo.create({ id: 'fresh', kind: 'fact', content: { title: 'f', content: 'y' }, status: 'active' })
      // 手动把 old 的 created_at 拨回 40 天前
      await ds!.query("UPDATE agent_memory_entries SET created_at = datetime('now', '-40 days') WHERE id = 'old'")
      const n = await repo.archiveStaleBefore(new Date(Date.now() - 30 * 86_400_000))
      expect(n).toBe(1)
      expect((await repo.getById('old'))?.status).toBe('archived')
      expect((await repo.getById('fresh'))?.status).toBe('active')
    })
  })
})
