/**
 * 工作流三仓库测试
 * @description 双方言（sqlite + postgres）验证：
 *              定义：CRUD/JSON 往返/分页关键词/发布字段更新/跨租户 cron 扫描
 *              运行：CRUD/互斥查询/历史分页/boot 扫描
 *              节点运行：start+唯一约束/update 生命周期/checkpoint 查询/待审核查询/超时扫描
 *              多租户：scoped 隔离 + 裸扫描跨租户可见性
 *              迁移：createWorkflowTables 幂等
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDataSource, getTestDialects, type TestDataSource } from '../helpers/create-test-data-source'
import { WorkflowDefinitionRepository } from '@core/database/repositories/workflow-definition.repository'
import { WorkflowRunRepository } from '@core/database/repositories/workflow-run.repository'
import { WorkflowNodeRunRepository } from '@core/database/repositories/workflow-node-run.repository'
import { createWorkflowTables } from '@core/database/migrations/create-workflow-tables'
import { runWithUser, runWithoutUser } from '@core/context/user-context'
import type { WorkflowGraph } from '@shared/types/workflow.types'

/** 最小合法图 */
function makeGraph(): WorkflowGraph {
  return {
    version: 1,
    nodes: [
      { id: 'start', type: 'start', name: '开始', position: { x: 0, y: 0 }, config: { inputs: [] } },
      { id: 'end', type: 'end', name: '结束', position: { x: 200, y: 0 }, config: {} },
    ],
    edges: [{ id: 'e1', sourceNodeId: 'start', targetNodeId: 'end', kind: 'normal' }],
  }
}

/** 跨 runWithUser 执行的辅助（测试里显示切换租户） */
async function asUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  if (userId === null) return runWithoutUser(fn)
  return runWithUser(userId, fn)
}

describe.each(getTestDialects())('Workflow Repositories [%s]', dialect => {
  let tds: TestDataSource
  let definitions: WorkflowDefinitionRepository
  let runs: WorkflowRunRepository
  let nodeRuns: WorkflowNodeRunRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    definitions = new WorkflowDefinitionRepository(tds.ds)
    runs = new WorkflowRunRepository(tds.ds)
    nodeRuns = new WorkflowNodeRunRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ==================== 定义仓库 ====================

  describe('WorkflowDefinitionRepository', () => {
    it('create + getById：JSON 列往返一致', async () => {
      const record = await asUser('user-a', () =>
        definitions.create({
          name: '测试工作流',
          description: '描述',
          draftGraph: makeGraph(),
          triggers: [{ type: 'cron', expression: '0 9 * * *', preset: 'daily', enabled: true }],
          settings: { maxDurationMs: 60_000 },
        })
      )
      expect(record.id).toMatch(/^wfdef_/)
      expect(record.draftGraph?.nodes).toHaveLength(2)
      expect(record.triggers).toHaveLength(1)
      expect(record.triggers[0]).toMatchObject({ type: 'cron', expression: '0 9 * * *' })
      expect(record.settings?.maxDurationMs).toBe(60_000)
      expect(record.publishedVersion).toBe(0)

      const fetched = await asUser('user-a', () => definitions.getById(record.id))
      expect(fetched?.name).toBe('测试工作流')
      expect(fetched?.draftGraph?.edges).toHaveLength(1)
    })

    it('损坏 JSON 降级为 null/[]（不抛错）', async () => {
      const record = await asUser('user-a', () => definitions.create({ name: 'x' }))
      // 直接写入损坏 JSON 模拟历史脏数据
      await tds.ds.query(
        `UPDATE workflow_definitions SET draft_graph = 'not-json', triggers = '{bad' WHERE id = $1`.replace(
          '$1',
          dialect === 'postgres' ? '$1' : '?'
        ),
        [record.id]
      )
      const fetched = await asUser('user-a', () => definitions.getById(record.id))
      expect(fetched?.draftGraph).toBeNull()
      expect(fetched?.triggers).toEqual([])
    })

    it('update 浅合并：只改提供的字段', async () => {
      const record = await asUser('user-a', () =>
        definitions.create({ name: '旧名', draftGraph: makeGraph() })
      )
      const updated = await asUser('user-a', () =>
        definitions.update(record.id, { name: '新名' })
      )
      expect(updated?.name).toBe('新名')
      expect(updated?.draftGraph?.nodes).toHaveLength(2) // 未动
    })

    it('list 分页 + keyword 过滤', async () => {
      await asUser('user-a', async () => {
        await definitions.create({ name: '翻译流水线' })
        await definitions.create({ name: '摘要任务', description: '每日摘要' })
        await definitions.create({ name: '另一个' })
      })
      const all = await asUser('user-a', () => definitions.list({ page: 1, pageSize: 10 }))
      expect(all.total).toBe(3)

      const hit = await asUser('user-a', () =>
        definitions.list({ keyword: '摘要', page: 1, pageSize: 10 })
      )
      expect(hit.total).toBe(1)
      expect(hit.items[0].name).toBe('摘要任务')

      const page = await asUser('user-a', () => definitions.list({ page: 2, pageSize: 2 }))
      expect(page.items).toHaveLength(1)
    })

    it('多租户隔离：A 看不到 B 的定义', async () => {
      const record = await asUser('user-b', () => definitions.create({ name: 'B 的' }))
      const fromA = await asUser('user-a', () => definitions.getById(record.id))
      expect(fromA).toBeNull()
      const listA = await asUser('user-a', () => definitions.list({ page: 1, pageSize: 10 }))
      expect(listA.total).toBe(0)
    })

    it('scanDueCronTriggers：跨租户可见，只返回已发布且到期且 cron 启用', async () => {
      const now = new Date()
      // A：已发布 + 到期 + cron 启用 → 命中
      const a = await asUser('user-a', async () => {
        const d = await definitions.create({ name: 'A 的定时' })
        return definitions.update(d.id, {
          publishedGraph: makeGraph(),
          publishedVersion: 1,
          publishedAt: now,
          triggers: [{ type: 'cron', expression: '* * * * *', enabled: true }],
          nextFireAt: new Date(now.getTime() - 60_000),
        })
      })
      // B：已发布 + 到期 + cron 停用 → 不命中
      const b = await asUser('user-b', async () => {
        const d = await definitions.create({ name: 'B 停用' })
        return definitions.update(d.id, {
          publishedGraph: makeGraph(),
          publishedVersion: 1,
          triggers: [{ type: 'cron', expression: '* * * * *', enabled: false }],
          nextFireAt: new Date(now.getTime() - 60_000),
        })
      })
      // A：已发布 + 未到期 → 不命中
      await asUser('user-a', async () => {
        const d = await definitions.create({ name: 'A 未到期' })
        return definitions.update(d.id, {
          publishedGraph: makeGraph(),
          publishedVersion: 1,
          triggers: [{ type: 'cron', expression: '* * * * *', enabled: true }],
          nextFireAt: new Date(now.getTime() + 600_000),
        })
      })
      // A：未发布但 nextFireAt 有值 → 不命中
      await asUser('user-a', async () => {
        const d = await definitions.create({ name: 'A 未发布' })
        return definitions.update(d.id, {
          triggers: [{ type: 'cron', expression: '* * * * *', enabled: true }],
          nextFireAt: new Date(now.getTime() - 60_000),
        })
      })

      const due = await tds.ds.transaction(async () =>
        definitions.scanDueCronTriggers(now)
      )
      expect(due).toHaveLength(1)
      expect(due[0].id).toBe(a!.id)
      expect(due[0].userId).toBe('user-a')
      expect(b!.publishedVersion).toBe(1) // B 正常发布过但 cron 停用
    })

    it('delete', async () => {
      const record = await asUser('user-a', () => definitions.create({ name: '删我' }))
      const n = await asUser('user-a', () => definitions.delete(record.id))
      expect(n).toBe(1)
      expect(await asUser('user-a', () => definitions.getById(record.id))).toBeNull()
    })
  })

  // ==================== 运行仓库 ====================

  describe('WorkflowRunRepository', () => {
    it('create + getById：快照与输入往返', async () => {
      const record = await asUser('user-a', () =>
        runs.create({
          definitionId: 'def1',
          definitionVersion: 3,
          graphSnapshot: makeGraph(),
          triggerType: 'cron',
          triggerInfo: { expression: '0 9 * * *' },
          startInputs: { topic: 'AI' },
          status: 'running',
          timeoutAt: new Date(Date.now() + 60_000),
        })
      )
      expect(record.id).toMatch(/^wfrun_/)
      expect(record.startedAt).not.toBeNull() // running 状态自动打点
      expect(record.graphSnapshot?.nodes).toHaveLength(2)
      expect(record.triggerInfo).toEqual({ expression: '0 9 * * *' })
      expect(record.startInputs).toEqual({ topic: 'AI' })

      const fetched = await asUser('user-a', () => runs.getById(record.id))
      expect(fetched?.status).toBe('running')
    })

    it('update 状态推进 + stats JSON', async () => {
      const record = await asUser('user-a', () =>
        runs.create({
          definitionId: 'def1',
          definitionVersion: 1,
          graphSnapshot: makeGraph(),
          triggerType: 'manual',
          status: 'running',
        })
      )
      const updated = await asUser('user-a', () =>
        runs.update(record.id, {
          status: 'succeeded',
          finishedAt: new Date(),
          durationMs: 1234,
          stats: { totalNodes: 5, doneNodes: 5, failedNodes: 0, recoveredNodes: 1 },
        })
      )
      expect(updated?.status).toBe('succeeded')
      expect(updated?.stats).toEqual({ totalNodes: 5, doneNodes: 5, failedNodes: 0, recoveredNodes: 1 })
      expect(updated?.finishedAt).not.toBeNull()
    })

    it('transitionIfStatus：条件迁移原子生效，终态不被覆盖（评审#34/#35）', async () => {
      const pending = await asUser('user-a', () =>
        runs.create({ definitionId: 'd10', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'manual', status: 'pending' })
      )
      const done = await asUser('user-a', () =>
        runs.create({ definitionId: 'd10', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'manual', status: 'succeeded' })
      )
      // pending → cancelled：命中
      const moved = await asUser('user-a', () =>
        runs.transitionIfStatus(pending.id, ['pending', 'waiting_review'], {
          status: 'cancelled',
          finishedAt: new Date(),
          cancelRequestedAt: new Date(),
        })
      )
      expect(moved).toBe(true)
      expect((await asUser('user-a', () => runs.getById(pending.id)))?.status).toBe('cancelled')
      // 已终态行：不命中、不覆盖
      const moved2 = await asUser('user-a', () =>
        runs.transitionIfStatus(done.id, ['pending', 'waiting_review'], { status: 'cancelled', finishedAt: new Date() })
      )
      expect(moved2).toBe(false)
      expect((await asUser('user-a', () => runs.getById(done.id)))?.status).toBe('succeeded')
    })

    it('findMutexHolders：只返回 pending/running/waiting_review', async () => {
      await asUser('user-a', async () => {
        await runs.create({ definitionId: 'd1', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'manual', status: 'running' })
        await runs.create({ definitionId: 'd1', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'manual', status: 'waiting_review' })
        await runs.create({ definitionId: 'd1', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'manual', status: 'succeeded' })
        await runs.create({ definitionId: 'd1', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'manual', status: 'skipped', skipReason: '测试' })
        await runs.create({ definitionId: 'd2', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'manual', status: 'running' })
      })
      const holders = await asUser('user-a', () => runs.findMutexHolders('d1'))
      expect(holders).toHaveLength(2)
      expect(holders.every(r => ['running', 'waiting_review'].includes(r.status))).toBe(true)
    })

    it('listByDefinition 状态过滤 + 分页', async () => {
      await asUser('user-a', async () => {
        for (let i = 0; i < 5; i++) {
          await runs.create({
            definitionId: 'd1', definitionVersion: 1, graphSnapshot: makeGraph(),
            triggerType: 'manual',
            status: i < 3 ? 'succeeded' : 'failed',
          })
        }
      })
      const failed = await asUser('user-a', () =>
        runs.listByDefinition('d1', { status: 'failed', page: 1, pageSize: 10 })
      )
      expect(failed.total).toBe(2)
      const page = await asUser('user-a', () =>
        runs.listByDefinition('d1', { page: 2, pageSize: 2 })
      )
      expect(page.items).toHaveLength(2)
    })

    it('scanBootRecoverable：跨租户扫描在途运行', async () => {
      await asUser('user-a', () =>
        runs.create({ definitionId: 'd1', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'manual', status: 'running' })
      )
      await asUser('user-b', () =>
        runs.create({ definitionId: 'd2', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'cron', status: 'waiting_review' })
      )
      await asUser('user-a', () =>
        runs.create({ definitionId: 'd3', definitionVersion: 1, graphSnapshot: makeGraph(), triggerType: 'manual', status: 'succeeded' })
      )
      const recoverable = await runs.scanBootRecoverable()
      expect(recoverable).toHaveLength(2)
      expect(recoverable.map(r => r.userId).sort()).toEqual(['user-a', 'user-b'])
    })
  })

  // ==================== 节点运行仓库 ====================

  describe('WorkflowNodeRunRepository', () => {
    it('start + update 生命周期：running → succeeded 带 checkpoint', async () => {
      const started = await asUser('user-a', () =>
        nodeRuns.start({ runId: 'run1', nodeId: 'llm1', nodeType: 'llm-chat', nodeName: '生成', iterationIndex: 0, input: { prompt: 'hi' } })
      )
      expect(started.status).toBe('running')
      expect(started.input).toEqual({ prompt: 'hi' })

      const done = await asUser('user-a', () =>
        nodeRuns.update('run1', 'llm1', 0, {
          status: 'succeeded',
          output: { content: '回复' },
          routeTaken: 'out',
          finishedAt: new Date(),
          durationMs: 500,
        })
      )
      expect(done?.status).toBe('succeeded')
      expect(done?.output).toEqual({ content: '回复' })
      expect(done?.routeTaken).toBe('out')
    })

    it('(runId, nodeId, iterationIndex) 唯一：重复 start 抛约束错误', async () => {
      await asUser('user-a', () =>
        nodeRuns.start({ runId: 'run1', nodeId: 'n1', nodeType: 'delay', nodeName: '延时', iterationIndex: 0, input: null })
      )
      await expect(
        asUser('user-a', () =>
          nodeRuns.start({ runId: 'run1', nodeId: 'n1', nodeType: 'delay', nodeName: '延时', iterationIndex: 0, input: null })
        )
      ).rejects.toThrow()
    })

    it('同节点不同迭代可并存（循环节点 checkpoint）', async () => {
      await asUser('user-a', async () => {
        await nodeRuns.start({ runId: 'run1', nodeId: 'body', nodeType: 'llm-chat', nodeName: '体', iterationIndex: 0, input: { item: 'a' } })
        await nodeRuns.start({ runId: 'run1', nodeId: 'body', nodeType: 'llm-chat', nodeName: '体', iterationIndex: 1, input: { item: 'b' } })
      })
      const all = await asUser('user-a', () => nodeRuns.getByRun('run1'))
      expect(all).toHaveLength(2)
    })

    it('findSucceededWithOutput：只返回成功且有输出的行', async () => {
      await asUser('user-a', async () => {
        const s1 = await nodeRuns.start({ runId: 'run1', nodeId: 'n1', nodeType: 'delay', nodeName: 'a', iterationIndex: 0, input: null })
        await nodeRuns.update('run1', 'n1', 0, { status: 'succeeded', output: { waitedMs: 1 }, finishedAt: new Date() })
        void s1
        await nodeRuns.start({ runId: 'run1', nodeId: 'n2', nodeType: 'delay', nodeName: 'b', iterationIndex: 0, input: null })
        await nodeRuns.update('run1', 'n2', 0, { status: 'failed', error: 'x', finishedAt: new Date() })
        // 成功但输出为空（如 end 节点）→ 不算 checkpoint
        await nodeRuns.start({ runId: 'run1', nodeId: 'n3', nodeType: 'end', nodeName: 'c', iterationIndex: 0, input: null })
        await nodeRuns.update('run1', 'n3', 0, { status: 'succeeded', output: null, finishedAt: new Date() })
      })
      const checkpoints = await asUser('user-a', () => nodeRuns.findSucceededWithOutput('run1'))
      expect(checkpoints).toHaveLength(1)
      expect(checkpoints[0].nodeId).toBe('n1')
    })

    it('findWaitingReview 按用户隔离；scanExpiredWaitingReview 跨租户', async () => {
      const past = new Date(Date.now() - 1000)
      await asUser('user-a', () =>
        nodeRuns.start({ runId: 'run1', nodeId: 'rev1', nodeType: 'human-review', nodeName: '审核', iterationIndex: 0, input: null })
      )
      await asUser('user-a', () => nodeRuns.update('run1', 'rev1', 0, { status: 'waiting_review', waitExpiresAt: past }))
      await asUser('user-b', () =>
        nodeRuns.start({ runId: 'run2', nodeId: 'rev1', nodeType: 'human-review', nodeName: '审核', iterationIndex: 0, input: null })
      )
      await asUser('user-b', () => nodeRuns.update('run2', 'rev1', 0, { status: 'waiting_review', waitExpiresAt: new Date(Date.now() + 600_000) }))

      const mine = await asUser('user-a', () => nodeRuns.findWaitingReview())
      expect(mine).toHaveLength(1)
      expect(mine[0].runId).toBe('run1')

      const expired = await nodeRuns.scanExpiredWaitingReview(new Date())
      expect(expired).toHaveLength(1)
      expect(expired[0].runId).toBe('run1')
    })

    it('deleteByRun', async () => {
      await asUser('user-a', async () => {
        await nodeRuns.start({ runId: 'run1', nodeId: 'n1', nodeType: 'delay', nodeName: 'a', iterationIndex: 0, input: null })
        await nodeRuns.start({ runId: 'run1', nodeId: 'n2', nodeType: 'delay', nodeName: 'b', iterationIndex: 0, input: null })
        await nodeRuns.start({ runId: 'run2', nodeId: 'n1', nodeType: 'delay', nodeName: 'a', iterationIndex: 0, input: null })
      })
      const n = await asUser('user-a', () => nodeRuns.deleteByRun('run1'))
      expect(n).toBe(2)
      expect(await asUser('user-a', () => nodeRuns.getByRun('run2'))).toHaveLength(1)
    })
  })

  // ==================== 迁移幂等 ====================

  describe('createWorkflowTables 幂等', () => {
    it('对 synchronize 已建的表重复执行不抛错（索引补齐路径）', async () => {
      await createWorkflowTables(tds.ds)
      await createWorkflowTables(tds.ds) // 第二次：全部走"已存在"分支
    })
  })
})
