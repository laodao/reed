/**
 * 工作流运行服务测试：互斥跳过 / 启动到终态 / 审核委托 / 续跑
 * @module tests/workflow/run-service
 */
import { describe, it, expect, vi } from 'vitest'
import { WorkflowRunService } from '@core/modules/workflow/workflow-run.service'
import { WorkflowEngineService } from '@core/modules/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/modules/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/modules/workflow/nodes/control-nodes'
import { TASK_NODE_HANDLERS } from '@core/modules/workflow/nodes/task-nodes'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import type { WorkflowNodeHandler } from '@core/modules/workflow/engine/node-handler'
import { runWithUser } from '@core/context/user-context'

// ---- 内存假仓库（结构与真仓库公共方法对齐的最小子集） ----

class MemRuns {
  rows: Map<string, any> = new Map()
  seq = 0
  async create(i: any) {
    // 模拟互斥部分唯一索引（评审#31/#40）：同 (userId, definitionId) 的活动行唯一
    if (['pending', 'running', 'waiting_review'].includes(i.status)) {
      const uid = i.userId ?? 'u1'
      const dup = [...this.rows.values()].some(r =>
        r.definitionId === i.definitionId && r.userId === uid &&
        ['pending', 'running', 'waiting_review'].includes(r.status))
      if (dup) {
        throw Object.assign(new Error('UNIQUE constraint failed: workflow_runs.user_id, workflow_runs.definition_id'), { code: 'SQLITE_CONSTRAINT_UNIQUE' })
      }
    }
    const id = `r${++this.seq}`
    this.rows.set(id, { id, userId: 'u1', status: i.status ?? 'pending', ...i, createdAt: new Date() })
    return this.rows.get(id)
  }
  async getById(id: string) {
    return this.rows.get(id) ?? null
  }
  async update(id: string, patch: any) {
    const row = this.rows.get(id)
    if (!row) return null
    Object.assign(row, patch)
    return row
  }
  // 评审 #34/#35：与真仓库同语义的条件迁移（真实原子性由 SQL WHERE 保证，见 workflow-repositories.spec）
  async transitionIfStatus(id: string, fromStatuses: readonly string[], patch: { status: string; finishedAt?: Date | null; error?: string | null; cancelRequestedAt?: Date }) {
    const row = this.rows.get(id)
    if (!row || !fromStatuses.includes(row.status)) return false
    Object.assign(row, patch)
    return true
  }
  async findMutexHolders(defId: string) {
    return [...this.rows.values()].filter(
      (r: any) => r.definitionId === defId && ['pending', 'running', 'waiting_review'].includes(r.status)
    )
  }
  async scanBootRecoverable() {
    return [...this.rows.values()].filter((r: any) =>
      ['pending', 'running', 'waiting_review'].includes(r.status)
    )
  }
  async listByDefinition(defId: string, p: any) {
    const items = [...this.rows.values()].filter((r: any) => r.definitionId === defId)
    return { items: items.slice((p.page - 1) * p.pageSize, p.page * p.pageSize), total: items.length }
  }
  async deleteById(id: string) {
    return this.rows.delete(id) ? 1 : 0
  }
}

class MemNodeRuns {
  rows: any[] = []
  async getByRun(runId: string) {
    return this.rows.filter(r => r.runId === runId)
  }
  async findSucceededWithOutput(runId: string) {
    return this.rows.filter(r => r.runId === runId && r.status === 'succeeded' && r.output)
  }
  async scanExpiredWaitingReview(_now: Date) { return [] }
  async findWaitingReview() {
    return this.rows.filter(r => r.status === 'waiting_review')
  }
  async deleteByRun(runId: string) {
    const n = this.rows.filter(r => r.runId === runId).length
    this.rows = this.rows.filter(r => r.runId !== runId)
    return n
  }
  // 引擎端口适配会调 start/update —— 由 EnginePortSpy 转发到内存行
  async start(i: any) {
    this.rows.push({ ...i, status: 'running' })
  }
  async update(runId: string, nodeId: string, iter: number, patch: any) {
    const row = this.rows.find(r => r.runId === runId && r.nodeId === nodeId && r.iterationIndex === iter)
    if (row) Object.assign(row, patch)
  }
}

class MemDefinitions {
  rows: Map<string, any> = new Map()
  async getById(id: string) {
    return this.rows.get(id) ?? null
  }
  async update(id: string, patch: any) {
    const row = this.rows.get(id)
    if (!row) return null
    Object.assign(row, patch)
    return row
  }
}

// ---- 装配 ----

const boomOnce: WorkflowNodeHandler = {
  type: 'boom' as any,
  controlKind: 'task',
  cancellable: false,
  outputSchema: [],
  validateConfig: () => [],
  async execute() {
    return { status: 'failed', error: '必失败', retryable: false }
  },
}

function setup(extraHandlers: WorkflowNodeHandler[] = []) {
  const runs = new MemRuns()
  const nodeRuns = new MemNodeRuns()
  const definitions = new MemDefinitions()
  const events: any[] = []
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS, boomOnce, ...extraHandlers])
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id, p) => runs.update(id, p).then(() => undefined) },
      nodeRuns: {
        startNode: i => nodeRuns.start(i),
        patchNode: (r, n, it, p) => nodeRuns.update(r, n, it, p),
      },
      events: { emit: (e: any) => events.push(e) },
    },
    registry
  )
  const service = new WorkflowRunService({
    runs: runs as any,
    nodeRuns: nodeRuns as any,
    definitions: definitions as any,
    engine,
  })
  return { service, runs, nodeRuns, definitions, engine, events }
}

let seq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as any }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string, string?]>): WorkflowGraph {
  return {
    version: 1,
    nodes,
    edges: edges.map(([s, t, k]) => ({ id: `e${seq++}`, sourceNodeId: s, targetNodeId: t, kind: (k ?? 'normal') as any })),
  }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

function def(id: string, graph: WorkflowGraph, published = false) {
  return {
    id,
    name: '测试工作流',
    description: null,
    category: null,
    draftGraph: graph,
    publishedGraph: published ? graph : null,
    publishedVersion: published ? 1 : 0,
    publishedAt: null,
    triggers: [],
    settings: null,
    nextFireAt: null,
    lastFireAt: null,
    lastRunAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('WorkflowRunService', () => {
  it('startRun：跑通到终态，运行记录 succeeded', async () => {
    const { service, runs, definitions } = setup()
    const graph = g(
      [n('start', 'start'), n('d', 'delay', { durationMs: 5 }), n('end', 'end')],
      [['start', 'd'], ['d', 'end']]
    )
    definitions.rows.set('def1', def('def1', graph))
    const run = await runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'manual' }))
    await wait(80)
    // startRun 返回启动时刻快照：快任务可能已完成
    expect(['pending', 'running', 'succeeded']).toContain(run.status)
    const final = await runs.getById(run.id)
    expect(final.status).toBe('succeeded')
  })

  it('互斥：同工作流运行中 → 新启动记 skipped（含原因）', async () => {
    const { service, runs, definitions } = setup()
    const graph = g(
      [n('start', 'start'), n('d', 'delay', { durationMs: 200 }), n('end', 'end')],
      [['start', 'd'], ['d', 'end']]
    )
    definitions.rows.set('def1', def('def1', graph))
    await runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'manual' }))
    await wait(20)
    const second = await runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'cron' }))
    expect(second.status).toBe('skipped')
    expect(second.skipReason).toContain('运行中')
  })

  it('并发 startRun 竞态：互斥唯一索引兜底转 skipped，绝不双跑（评审#31/#40）', async () => {
    const { service, runs, definitions } = setup()
    const graph = g(
      [n('start', 'start'), n('d', 'delay', { durationMs: 30 }), n('end', 'end')],
      [['start', 'd'], ['d', 'end']]
    )
    definitions.rows.set('def1', def('def1', graph))
    // 同时启动两次：互斥检查（check）都可能在对方插入（create）前通过——唯一索引兜底
    await Promise.all([
      runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'manual' })),
      runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'manual' })),
    ])
    await wait(120)
    const statuses = [...runs.rows.values()].map((r: any) => r.status)
    expect(statuses.filter(s => s === 'skipped')).toHaveLength(1)
    expect(statuses.filter(s => ['pending', 'running', 'succeeded'].includes(s))).toHaveLength(1)
  })

  it('审核：human-review 挂起 → reviewDecide 批准 → 终态 succeeded', async () => {
    const { service, runs, definitions } = setup()
    const graph = g(
      [n('start', 'start'), n('r1', 'human-review', { payload: '请审阅' }), n('end', 'end')],
      [['start', 'r1'], ['r1', 'end', 'approve']]
    )
    definitions.rows.set('def1', def('def1', graph))
    const run = await runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'manual' }))
    await wait(50)
    expect((await runs.getById(run.id)).status).toBe('waiting_review')
    const ok = await runWithUser('u1', () => service.reviewDecide(run.id, 'r1', { decision: 'approve' }, 'u1'))
    expect(ok.success).toBe(true)
    await wait(50)
    expect((await runs.getById(run.id)).status).toBe('succeeded')
  })

  it('续跑：新运行 resumed_from_run_id 链接源运行，triggerType=resume', async () => {
    const { service, runs, definitions } = setup()
    const graph = g(
      [n('start', 'start'), n('d', 'delay', { durationMs: 5 }), n('bad', 'boom'), n('end', 'end')],
      [['start', 'd'], ['d', 'bad'], ['bad', 'end']]
    )
    definitions.rows.set('def1', def('def1', graph))
    const first = await runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'manual' }))
    await wait(60)
    expect((await runs.getById(first.id)).status).toBe('failed')
    const resumed = await runWithUser('u1', () => service.resumeRun(first.id))
    expect(resumed.resumedFromRunId).toBe(first.id)
    expect(resumed.triggerType).toBe('resume')
  })

  it('boot 恢复：running 未超时 → interrupted；waiting_review 保持', async () => {
    const { service, runs } = setup()
    await runs.create({ definitionId: 'd1', definitionVersion: 1, graphSnapshot: g([], []), triggerType: 'manual', status: 'running', timeoutAt: new Date(Date.now() + 60000) })
    await runs.create({ definitionId: 'd2', definitionVersion: 1, graphSnapshot: g([], []), triggerType: 'manual', status: 'waiting_review', timeoutAt: null })
    const result = await service.recoverOnBoot()
    expect(result).toEqual({ timedOut: 0, interrupted: 1, keptWaiting: 1 })
  })

  it('续跑继承定义级执行设置与死线（评审#33）', async () => {
    const { service, runs, definitions, engine } = setup()
    const graph = g(
      [n('start', 'start'), n('d', 'delay', { durationMs: 5 }), n('bad', 'boom'), n('end', 'end')],
      [['start', 'd'], ['d', 'bad'], ['bad', 'end']]
    )
    definitions.rows.set('def1', def('def1', graph))
    const first = await runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'manual' }))
    await wait(60)
    expect((await runs.getById(first.id)).status).toBe('failed')

    // 定义配置执行设置：maxDurationMs=12345
    definitions.rows.get('def1').settings = { maxDurationMs: 12345 }
    const execSpy = vi.spyOn(engine, 'execute')
    const resumed = await runWithUser('u1', () => service.resumeRun(first.id))
    // 1) launch 收到的 settings 是定义级装配结果
    const execInput = execSpy.mock.calls[0][0] as any
    expect(execInput.settings?.maxDurationMs).toBe(12345)
    // 2) 运行行带死线（≈ now + 12345）
    const row = await runs.getById(resumed.id)
    expect(row.timeoutAt).not.toBeNull()
    const delta = new Date(row.timeoutAt as any).getTime() - new Date(row.createdAt as any).getTime()
    expect(delta).toBeGreaterThan(12000)
    expect(delta).toBeLessThanOrEqual(13000)
    vi.restoreAllMocks()
  })

  it('cancelRun 原子条件迁移：可取消状态生效；已终态不覆盖返回 false（评审#34）', async () => {
    const { service, runs } = setup()
    const pendingRun = await runs.create({ definitionId: 'd1', definitionVersion: 1, graphSnapshot: g([], []), triggerType: 'manual', status: 'pending' })
    expect(await runWithUser('u1', () => service.cancelRun(pendingRun.id, 'u1'))).toBe(true)
    expect((await runs.getById(pendingRun.id)).status).toBe('cancelled')

    const doneRun = await runs.create({ definitionId: 'd2', definitionVersion: 1, graphSnapshot: g([], []), triggerType: 'manual', status: 'succeeded' })
    expect(await runWithUser('u1', () => service.cancelRun(doneRun.id, 'u1'))).toBe(false)
    expect((await runs.getById(doneRun.id)).status).toBe('succeeded')
  })

  it('boot 恢复：未到期挂起审核在死线到点转 interrupted，释放互斥（评审#35）', async () => {
    vi.useFakeTimers()
    try {
      const { service, runs } = setup()
      await runs.create({ definitionId: 'd1', definitionVersion: 1, graphSnapshot: g([], []), triggerType: 'manual', status: 'waiting_review', timeoutAt: new Date(Date.now() + 60_000) })
      const result = await service.recoverOnBoot()
      expect(result.keptWaiting).toBe(1)
      expect((await runs.getById('r1'))?.status ?? [...runs.rows.values()][0].status).toBe('waiting_review')
      // 推进到死线之后
      vi.setSystemTime(Date.now() + 61_000)
      await vi.advanceTimersByTimeAsync(61_000)
      expect([...runs.rows.values()][0].status).toBe('interrupted')
    } finally {
      vi.useRealTimers()
    }
  })

  it('续跑 + parallel-merge：mergeArrivals 重建，merge 输出非空（评审#32）', async () => {
    const { service, runs, nodeRuns, definitions } = setup()
    const graph = g(
      [n('start', 'start'), n('a', 'delay', { durationMs: 1 }), n('b', 'delay', { durationMs: 1 }), n('m', 'parallel-merge', { waitPolicy: 'all' }), n('end', 'end')],
      [['start', 'a'], ['start', 'b'], ['a', 'm'], ['b', 'm'], ['m', 'end']]
    )
    definitions.rows.set('def1', def('def1', graph))
    // 源运行：a/b 已完成留 checkpoint，运行中断（模拟并行等齐前中断）
    const first = await runs.create({ definitionId: 'def1', definitionVersion: 1, graphSnapshot: graph, triggerType: 'manual', status: 'interrupted' })
    nodeRuns.rows.push({ runId: first.id, nodeId: 'start', nodeType: 'start', nodeName: 'start', iterationIndex: 0, status: 'succeeded', output: {} })
    nodeRuns.rows.push({ runId: first.id, nodeId: 'a', nodeType: 'delay', nodeName: 'a', iterationIndex: 0, status: 'succeeded', output: { text: 'A输出' } })
    nodeRuns.rows.push({ runId: first.id, nodeId: 'b', nodeType: 'delay', nodeName: 'b', iterationIndex: 0, status: 'succeeded', output: { text: 'B输出' } })
    const resumed = await runWithUser('u1', () => service.resumeRun(first.id))
    await wait(150)
    const mergeRow = nodeRuns.rows.find(r => r.runId === resumed.id && r.nodeId === 'm')
    expect(mergeRow?.status).toBe('succeeded')
    expect(mergeRow.output.a).toMatchObject({ text: 'A输出' })
    expect(mergeRow.output.b).toMatchObject({ text: 'B输出' })
    expect((await runs.getById(resumed.id)).status).toBe('succeeded')
  })

  it('续跑互斥：同工作流有挂起运行时拒绝续跑（waiting_review 源也占互斥）', async () => {
    const { service, runs, definitions } = setup()
    const graph = g(
      [n('start', 'start'), n('r1', 'human-review', { payload: 'x' }), n('end', 'end')],
      [['start', 'r1'], ['r1', 'end', 'approve']]
    )
    definitions.rows.set('def1', def('def1', graph))
    const run = await runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'manual' }))
    await wait(50)
    expect((await runs.getById(run.id)).status).toBe('waiting_review')
    // 源运行自身挂起占互斥 → 续跑应被拒绝且提示出路
    await expect(runWithUser('u1', () => service.resumeRun(run.id))).rejects.toThrow('请先取消')
  })

  it('start 参数：required 缺失抛错；defaultValue 自动填充', async () => {
    const { service, runs, definitions } = setup()
    const graph = g(
      [
        n('start', 'start', {
          inputs: [
            { key: 'topic', label: '主题', type: 'string', required: true },
            { key: 'count', label: '数量', type: 'number', defaultValue: 5 },
          ],
        }),
        n('d', 'delay', { durationMs: 5 }),
        n('end', 'end'),
      ],
      [['start', 'd'], ['d', 'end']]
    )
    definitions.rows.set('def1', def('def1', graph))
    // 必填缺失 → 抛错（提示用字段中文标签）
    await expect(
      runWithUser('u1', () => service.startRun({ definitionId: 'def1', triggerType: 'manual' }))
    ).rejects.toThrow('「主题」')
    // 传 topic（count 走默认值）
    const run = await runWithUser('u1', () =>
      service.startRun({ definitionId: 'def1', triggerType: 'cron', inputs: { topic: 'AI' } })
    )
    expect(run.startInputs).toEqual({ topic: 'AI', count: 5 })
    void runs
  })
})
