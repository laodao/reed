/**
 * WorkflowNodeRunRepository 真实 DataSource 契约测试
 * @module tests/core/database/workflow-node-run.repository.spec
 *
 * 背景（P4 真模型冒烟实证的两个生产断点，曾被 tsc 基线噪音掩盖）：
 * 1. update 缺 stateJson 映射——引擎 ctx.saveState 的补丁被静默丢弃（E2 全链路失效）
 * 2. makeEngineDeps 适配层调用不存在的 listByRun（仓储实为 getByRun）——rehydrate 必炸
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { WorkflowNodeRunRepository } from '@core/database/repositories/workflow-node-run.repository'
import { createWorkflowTables } from '@core/database/migrations/create-workflow-tables'
import { addWorkflowNodeRunStateJson } from '@core/database/migrations/add-workflow-node-run-state-json'
import { runWithUserAsync } from '@core/context/user-context'

let ds: DataSource | null = null

async function buildDs(): Promise<DataSource> {
  const { WorkflowNodeRunEntity } = await import('@core/database/entities/workflow-node-run.entity')
  const d = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [WorkflowNodeRunEntity],
    synchronize: false,
  })
  await d.initialize()
  await createWorkflowTables(d)
  await addWorkflowNodeRunStateJson(d)
  return d
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('E2 落库链路（P4 冒烟断点回归）', () => {
  it('update 映射 stateJson：引擎 saveState 补丁不再被静默丢弃；getByRun 读回', async () => {
    ds = await buildDs()
    const repo = new WorkflowNodeRunRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.start({
        runId: 'r1',
        nodeId: 'ag1',
        nodeType: 'agent-loop',
        nodeName: 'Agent',
        iterationIndex: 0,
        input: {},
      } as never)
      // 引擎 ctx.saveState 的实际补丁形态：{ stateJson: serialized }
      await repo.update('r1', 'ag1', 0, { stateJson: '{"iteration":2,"messages":[1,2,3]}' } as never)
      const rows = await repo.getByRun('r1')
      expect(rows[0].stateJson).toBe('{"iteration":2,"messages":[1,2,3]}')
      // 覆盖写语义（第二次 saveState 替换第一次）
      await repo.update('r1', 'ag1', 0, { stateJson: '{"iteration":3}' } as never)
      expect((await repo.getByRun('r1'))[0].stateJson).toBe('{"iteration":3}')
    })
  })
})
