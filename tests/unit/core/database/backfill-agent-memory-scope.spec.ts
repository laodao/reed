/**
 * 飞轮记忆存量回填迁移（六扇门复盘）单测
 *
 * 真实 better-sqlite3 + 迁移（生产路径零 mock，同 agent-task-memory.repository.spec）。
 * 钉死：deriveScopeFromTaskSpec 容错；backfillAgentMemoryScope 按源任务
 * spec.scopeTag 回填 biz_module/project_id；无 scopeTag 的源任务保持 L1；幂等。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AgentTaskRepository } from '@core/database/repositories/agent-task.repository'
import { AgentMemoryEntryRepository } from '@core/database/repositories/agent-memory-entry.repository'
import { createAgentTasks } from '@core/database/migrations/create-agent-tasks'
import { createAgentMemoryEntries } from '@core/database/migrations/create-agent-memory-entries'
import { addAgentMemoryScopeColumns } from '@core/database/migrations/add-agent-memory-scope-columns'
import { backfillAgentMemoryScope, deriveScopeFromTaskSpec } from '@core/database/migrations/backfill-agent-memory-scope'
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
  await addAgentMemoryScopeColumns(d)
  return d
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('deriveScopeFromTaskSpec', () => {
  it('提取合法 scopeTag；坏 JSON/缺字段/形状不符返回 null', () => {
    expect(deriveScopeFromTaskSpec('{"scopeTag":{"bizModule":"longwriting","projectId":"p1"}}')).toEqual({ bizModule: 'longwriting', projectId: 'p1' })
    expect(deriveScopeFromTaskSpec('{"scopeTag":{"bizModule":"domain-learning"}}')).toEqual({ bizModule: 'domain-learning', projectId: undefined })
    expect(deriveScopeFromTaskSpec('{"goal":"无打标"}')).toBeNull()
    expect(deriveScopeFromTaskSpec('not-json')).toBeNull()
    expect(deriveScopeFromTaskSpec(null)).toBeNull()
    expect(deriveScopeFromTaskSpec('{"scopeTag":"oops"}')).toBeNull()
  })
})

describe('backfillAgentMemoryScope', () => {
  it('按源任务 scopeTag 回填；无 scopeTag 保持 L1；幂等', async () => {
    ds = await buildDs()
    const taskRepo = new AgentTaskRepository(ds)
    const memRepo = new AgentMemoryEntryRepository(ds)
    await runWithUserAsync('u1', async () => {
      await taskRepo.create({ id: 't_tag', parentId: null, rootId: 't_tag', depth: 0, title: '有标', spec: { goal: 'g', scopeTag: { bizModule: 'domain-learning', projectId: 'sp1' } }, status: 'succeeded', executor: 'agent_loop' })
      await taskRepo.create({ id: 't_bare', parentId: null, rootId: 't_bare', depth: 0, title: '无标', spec: { goal: 'g2' }, status: 'succeeded', executor: 'agent_loop' })
      await memRepo.create({ id: 'm1', kind: 'sop', content: { title: 'a', content: 'a' }, confidence: 0.9, status: 'active', sourceTaskId: 't_tag', bizModule: null, projectId: null })
      await memRepo.create({ id: 'm2', kind: 'fact', content: { title: 'b', content: 'b' }, confidence: 0.9, status: 'active', sourceTaskId: 't_bare', bizModule: null, projectId: null })
    })

    // 迁移与断言都要在租户上下文内（getById/update 走 ALS 过滤）
    await runWithUserAsync('u1', async () => {
      await backfillAgentMemoryScope(ds)
      let m1 = await memRepo.getById('m1')
      let m2 = await memRepo.getById('m2')
      expect(m1?.bizModule).toBe('domain-learning')
      expect(m1?.projectId).toBe('sp1')
      expect(m2?.bizModule).toBeNull()

      // 幂等：已回填行不被改写（源任务删除后重跑不报错、不改值）
      await taskRepo.deleteByRoot('t_tag')
      await backfillAgentMemoryScope(ds)
      m1 = await memRepo.getById('m1')
      m2 = await memRepo.getById('m2')
      expect(m1?.bizModule).toBe('domain-learning')
      expect(m2?.bizModule).toBeNull()
    })
  })
})
