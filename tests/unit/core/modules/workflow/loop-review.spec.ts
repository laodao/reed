/**
 * 工作流引擎片4测试：循环 / 审核挂起恢复 / 取消 / 续跑装配
 * @module tests/workflow/loop-review
 */
import { describe, it, expect } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/modules/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/modules/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/modules/workflow/nodes/control-nodes'
import { INTERACTION_NODE_HANDLERS } from '@core/modules/workflow/nodes/interaction-nodes'
import type { WorkflowEngineDeps, WorkflowEventPort, WorkflowNodeRunPort, WorkflowRunPort } from '@core/modules/workflow/engine/ports'
import type { WorkflowRunEvent, WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import type { WorkflowNodeHandler } from '@core/modules/workflow/engine/node-handler'
import { runWithUser } from '@core/context/user-context'

// ==================== 假实现（与 engine.spec 同构） ====================

class FakeRuns implements WorkflowRunPort {
  patches: Array<Record<string, unknown>> = []
  async patchRun(_id: string, patch: Record<string, unknown>): Promise<void> {
    this.patches.push(patch)
  }
  get final(): Record<string, unknown> {
    return this.patches[this.patches.length - 1] ?? {}
  }
}
class FakeNodeRuns implements WorkflowNodeRunPort {
  rows: Map<string, Record<string, unknown>> = new Map()
  async startNode(i: { nodeId: string; iterationIndex: number }): Promise<void> {
    this.rows.set(`${i.nodeId}|${i.iterationIndex}`, { ...i, status: 'running' })
  }
  async patchNode(
    _r: string,
    nodeId: string,
    iter: number,
    patch: Record<string, unknown>
  ): Promise<void> {
    Object.assign(this.rows.get(`${nodeId}|${iter}`) ?? {}, patch)
  }
  statusOf(nodeId: string, iter = 0): unknown {
    return this.rows.get(`${nodeId}|${iter}`)?.status
  }
  outputOf(nodeId: string, iter = 0): Record<string, unknown> | undefined {
    return this.rows.get(`${nodeId}|${iter}`)?.output as Record<string, unknown> | undefined
  }
}
class FakeEvents implements WorkflowEventPort {
  events: WorkflowRunEvent[] = []
  emit(e: WorkflowEventPort extends never ? never : WorkflowRunEvent): void {
    this.events.push(e)
  }
}

/** echo 任务节点 */
const echo: WorkflowNodeHandler = {
  type: 'echo' as any, controlKind: 'task', cancellable: false,
  outputSchema: [{ key: 'text', type: 'string', desc: '' }], validateConfig: () => [],
  async execute(ctx) {
    return { status: 'succeeded', output: { text: String(ctx.config.text ?? '') } }
  },
}
/** 人工审核节点（返回挂起） */
const review: WorkflowNodeHandler = {
  type: 'rev' as any, controlKind: 'task', cancellable: false,
  outputSchema: [], validateConfig: () => [],
  async execute(ctx) {
    return { status: 'waiting_review', payload: { content: String(ctx.config.text ?? '') }, timeoutMs: (ctx.config.timeoutMs as number) ?? null }
  },
}
/** 必失败节点 */
function boom(): WorkflowNodeHandler {
  return {
    type: 'boom' as any, controlKind: 'task', cancellable: false,
    outputSchema: [], validateConfig: () => [],
    async execute() {
      return { status: 'failed', error: '总是失败', retryable: false }
    },
  }
}

let seq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as any }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string, string?]>): WorkflowGraph {
  return {
    version: 1, nodes,
    edges: edges.map(([s, t, k]) => ({ id: `e${seq++}`, sourceNodeId: s, targetNodeId: t, kind: (k ?? 'normal') as any })),
  }
}
function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const events = new FakeEvents()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...INTERACTION_NODE_HANDLERS, echo, review, boom()])
  const engine = new WorkflowEngineService({ runs, nodeRuns, events } as WorkflowEngineDeps, registry)
  return { engine, runs, nodeRuns, events }
}
const input = (graph: WorkflowGraph, startInputs: Record<string, unknown> = {}, settings?: Record<string, number>): ExecuteRunInput => ({
  runId: 'run_1', userId: 'u1', definitionId: 'd1', graph, startInputs, settings,
})
const exec2 = (engine: WorkflowEngineService, i: ExecuteRunInput) => runWithUser('u1', () => engine.execute(i))
const waitMs = (ms: number) => new Promise(r => setTimeout(r, ms))

/** 标准循环图：start → loop(list) ⇄ body(echo) → end */
function loopGraph(): WorkflowGraph {
  return g(
    [n('start', 'start'), n('loop1', 'loop', { listExpression: '{{start.items}}' }), n('body', 'echo', { text: '{{loop1.item}}#{{loop1.index}}' }), n('end', 'end')],
    [['start', 'loop1'], ['loop1', 'body', 'loop-body'], ['body', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']]
  )
}

// ==================== 循环 ====================

describe('循环节点', () => {
  it('遍历 3 项：body 每迭代执行一次，item/index 注入，results 汇聚', async () => {
    const { engine, nodeRuns } = makeEngine()
    const status = await exec2(engine, input(loopGraph(), { items: ['a', 'b', 'c'] }))
    expect(status).toBe('succeeded')
    expect(nodeRuns.statusOf('body', 0)).toBe('succeeded')
    expect(nodeRuns.statusOf('body', 1)).toBe('succeeded')
    expect(nodeRuns.statusOf('body', 2)).toBe('succeeded')
    expect(nodeRuns.outputOf('body', 1)).toMatchObject({ text: 'b#1' })
    expect(nodeRuns.outputOf('loop1')).toMatchObject({ count: 3 })
    expect((nodeRuns.outputOf('loop1')!.results as unknown[]).map((r: any) => r.text)).toEqual(['a#0', 'b#1', 'c#2'])
  })

  it('空列表 skip：直接走 done 边，results=[]', async () => {
    const { engine, nodeRuns } = makeEngine()
    const status = await exec2(engine, input(loopGraph(), { items: [] }))
    expect(status).toBe('succeeded')
    expect(nodeRuns.statusOf('body', 0)).toBeUndefined()
    expect(nodeRuns.outputOf('loop1')).toMatchObject({ count: 0, results: [] })
  })

  it('listExpression 非数组 → 循环节点失败', async () => {
    const { engine, runs } = makeEngine()
    const status = await exec2(engine, input(loopGraph(), { items: '不是数组' }))
    expect(status).toBe('failed')
    expect(String(runs.final.error)).toContain('数组')
  })

  it('迭代数超上限（maxLoopIterations）→ 失败', async () => {
    const { engine, runs } = makeEngine()
    const status = await exec2(engine, input(loopGraph(), { items: [1, 2, 3] }, { maxLoopIterations: 2 }))
    expect(status).toBe('failed')
    expect(String(runs.final.error)).toContain('上限')
  })

  it('body 内未恢复失败 → 循环节点失败（run failed）', async () => {
    const { engine, runs } = makeEngine()
    const graph = g(
      [n('start', 'start'), n('loop1', 'loop', { listExpression: '{{start.items}}' }), n('body', 'boom'), n('end', 'end')],
      [['start', 'loop1'], ['loop1', 'body', 'loop-body'], ['body', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']]
    )
    const status = await exec2(engine, input(graph, { items: [1] }))
    expect(status).toBe('failed')
    expect(String(runs.final.error)).toContain('循环体')
  })

  it('循环体可引用根作用域节点输出（作用域链回退）', async () => {
    const { engine, nodeRuns } = makeEngine()
    const graph = g(
      [
        n('start', 'start'),
        n('pre', 'echo', { text: '根值' }),
        n('loop1', 'loop', { listExpression: '{{start.items}}' }),
        n('body', 'echo', { text: '{{pre.text}}+{{loop1.item}}' }),
        n('end', 'end'),
      ],
      [['start', 'pre'], ['pre', 'loop1'], ['loop1', 'body', 'loop-body'], ['body', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']]
    )
    await exec2(engine, input(graph, { items: ['x'] }))
    expect(nodeRuns.outputOf('body', 0)).toMatchObject({ text: '根值+x' })
  })
})

// ==================== 审核挂起 / 恢复 ====================

describe('人工审核', () => {
  function reviewGraph(): WorkflowGraph {
    return g(
      [n('start', 'start'), n('r1', 'rev', { text: '{{start.topic}}' }), n('after', 'echo', { text: '{{r1.content}}' }), n('end', 'end')],
      [['start', 'r1'], ['r1', 'after', 'approve'], ['after', 'end']]
    )
  }

  it('挂起：execute 返回 waiting_review，run 落库挂起，事件含 review-requested', async () => {
    const { engine, runs, nodeRuns, events } = makeEngine()
    const status = await exec2(engine, input(reviewGraph(), { topic: '章节1' }))
    expect(status).toBe('waiting_review')
    expect(runs.final.status).toBe('waiting_review')
    expect(nodeRuns.statusOf('r1')).toBe('waiting_review')
    expect(events.events.some(e => e.type === 'review-requested')).toBe(true)
  })

  it('批准：payload 透传下游，run 最终 succeeded', async () => {
    const { engine, runs, nodeRuns } = makeEngine()
    await exec2(engine, input(reviewGraph(), { topic: '章节1' }))
    const applied = await runWithUser('u1', () => engine.resumeReview('run_1', 'r1', { decision: 'approve' }))
    expect(applied).toBe(true)
    await waitMs(30)
    expect(runs.final.status).toBe('succeeded')
    expect(nodeRuns.statusOf('r1')).toBe('succeeded')
    expect(nodeRuns.outputOf('after')).toMatchObject({ text: '章节1' })
  })

  it('修改后批准：白名单内字段覆盖，白名单外字段被忽略', async () => {
    const { engine, nodeRuns } = makeEngine()
    // reviewGraph 的 r1 节点补 editableFields 白名单（content 允许改，其他不允许）
    const graph = reviewGraph()
    const r1 = graph.nodes.find(nd => nd.id === 'r1')!
    r1.config = { ...r1.config, editableFields: [{ key: 'content', label: '内容', type: 'string' }] }
    await exec2(engine, input(graph, { topic: '原文' }))
    await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'r1', {
        decision: 'approve_with_changes',
        editedValues: { content: '改后', malicious: '注入' },
      })
    )
    await waitMs(30)
    expect(nodeRuns.outputOf('after')).toMatchObject({ text: '改后' })
    // 白名单外字段被过滤
    expect(nodeRuns.outputOf('r1')!.malicious).toBeUndefined()
  })

  it('未声明 editableFields 的审核节点：editedValues 全部被忽略（缺省不允许修改）', async () => {
    const { engine, nodeRuns } = makeEngine()
    await exec2(engine, input(reviewGraph(), { topic: '原文' }))
    await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'r1', { decision: 'approve_with_changes', editedValues: { content: '篡改' } })
    )
    await waitMs(30)
    expect(nodeRuns.outputOf('after')).toMatchObject({ text: '原文' })
  })

  it('驳回且无 reject 边 → run failed', async () => {
    const { engine, runs } = makeEngine()
    await exec2(engine, input(reviewGraph(), { topic: 'x' }))
    await runWithUser('u1', () => engine.resumeReview('run_1', 'r1', { decision: 'reject' }))
    await waitMs(30)
    expect(runs.final.status).toBe('failed')
  })

  it('超时策略 approve：到期自动批准续跑', async () => {
    const { engine, runs, nodeRuns } = makeEngine()
    const graph = g(
      [n('start', 'start'), n('r1', 'rev', { text: 't', timeoutMs: 20, timeoutPolicy: 'approve' }), n('end', 'end')],
      [['start', 'r1'], ['r1', 'end', 'approve']]
    )
    await exec2(engine, input(graph))
    await waitMs(60)
    await runWithUser('u1', () => engine.tickReviewTimeouts(new Date()))
    await waitMs(30)
    expect(runs.final.status).toBe('succeeded')
    expect(nodeRuns.outputOf('r1')).toMatchObject({ decision: 'timeout_approve' })
  })

  it('循环体内审核：挂起后批准，继续剩余迭代', async () => {
    const { engine, nodeRuns, runs } = makeEngine()
    const graph = g(
      [
        n('start', 'start'),
        n('loop1', 'loop', { listExpression: '{{start.items}}' }),
        n('body', 'rev', { text: '{{loop1.item}}' }),
        n('end', 'end'),
      ],
      [['start', 'loop1'], ['loop1', 'body', 'loop-body'], ['body', 'loop1', 'loop-back'], ['loop1', 'end', 'loop-done']]
    )
    const status = await exec2(engine, input(graph, { items: ['a', 'b'] }))
    expect(status).toBe('waiting_review')
    await runWithUser('u1', () => engine.resumeReview('run_1', 'body', { decision: 'approve' }))
    await waitMs(50)
    // 批准第 0 轮后第 1 轮又挂起
    expect(nodeRuns.statusOf('body', 1)).toBe('waiting_review')
    await runWithUser('u1', () => engine.resumeReview('run_1', 'body', { decision: 'approve' }))
    await waitMs(50)
    expect(runs.final.status).toBe('succeeded')
    expect(nodeRuns.outputOf('loop1')).toMatchObject({ count: 2 })
  })
})

// ==================== 取消 ====================

describe('取消', () => {
  it('挂起中的运行可取消：节点标 cancelled、run 落 cancelled、互斥释放', async () => {
    const { engine, runs, nodeRuns } = makeEngine()
    const graph = g(
      [n('start', 'start'), n('r1', 'rev', { text: 'x' }), n('end', 'end')],
      [['start', 'r1'], ['r1', 'end', 'approve']]
    )
    await exec2(engine, input(graph))
    expect(engine.activeCount).toBe(1) // 挂起仍占互斥
    const ok = await runWithUser('u1', () => engine.cancelRun('run_1'))
    expect(ok).toBe(true)
    expect(runs.final.status).toBe('cancelled')
    expect(nodeRuns.statusOf('r1')).toBe('cancelled')
    expect(engine.activeCount).toBe(0)
  })

  it('非活动运行取消返回 false（服务层兜底改库）', async () => {
    const { engine } = makeEngine()
    expect(await runWithUser('u1', () => engine.cancelRun('不存在'))).toBe(false)
  })
})

// ==================== 续跑装配 ====================

describe('form-collect 服务端校验（评审#101）', () => {
  function formGraph() {
    return g(
      [n('start', 'start'), n('f', 'form-collect', {
        formTitle: '资料收集',
        fields: [
          { key: 'name', label: '姓名', type: 'string', required: true },
          { key: 'level', label: '等级', type: 'select', options: [{ label: '高', value: 'high' }, { label: '低', value: 'low' }] },
        ],
      }), n('end', 'end')],
      [['start', 'f'], ['f', 'end']]
    )
  }

  it('必填缺失 → 拒绝并保持挂起', async () => {
    const { engine, nodeRuns } = makeEngine()
    const st = await exec2(engine, input(formGraph()))
    expect(st).toBe('waiting_review')
    const applied = await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'f', { decision: 'approve_with_changes', editedValues: { level: 'high' } })
    )
    expect(applied).toBe(false)
    expect(nodeRuns.statusOf('f')).toBe('waiting_review') // 保持挂起
  })

  it('下拉值不在 options 内 → 拒绝并保持挂起', async () => {
    const { engine, nodeRuns } = makeEngine()
    await exec2(engine, input(formGraph()))
    const applied = await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'f', { decision: 'approve_with_changes', editedValues: { name: '张三', level: '顶级' } })
    )
    expect(applied).toBe(false)
    expect(nodeRuns.statusOf('f')).toBe('waiting_review')
  })

  it('合法提交 → 通过并成功终态', async () => {
    const { engine, nodeRuns } = makeEngine()
    await exec2(engine, input(formGraph()))
    const applied = await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'f', { decision: 'approve_with_changes', editedValues: { name: '张三', level: 'high' } })
    )
    expect(applied).toBe(true)
    const done = await waitMs(50)
    void done
    expect(nodeRuns.outputOf('f')).toMatchObject({ values: { name: '张三', level: 'high' } })
  })

  it('reject（取消）不受必填校验约束', async () => {
    const { engine, nodeRuns } = makeEngine()
    await exec2(engine, input(formGraph()))
    const applied = await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'f', { decision: 'reject' })
    )
    expect(applied).toBe(true)
    expect(nodeRuns.outputOf('f')).toMatchObject({ cancelled: true })
  })
})

describe('断点续跑（checkpoint 装配）', () => {
  it('已成功节点不重执行：按 checkpoint 恢复变量与边激活，从断点继续', async () => {
    // 第一次运行：a 成功后 b 失败 → run failed
    const { engine, runs } = makeEngine()
    const graph = g(
      [n('start', 'start'), n('a', 'echo', { text: 'AAA' }), n('b', 'boom'), n('end', 'end')],
      [['start', 'a'], ['a', 'b'], ['b', 'end']]
    )
    const st1 = await exec2(engine, input(graph))
    expect(st1).toBe('failed')

    // 续跑：新引擎实例（模拟重启），装配 a 的 checkpoint
    const { engine: engine2, runs: runs2, nodeRuns: nodeRuns2 } = makeEngine()
    const resumed = input(graph)
    resumed.resumedCheckpoints = [{ nodeId: 'a', nodeType: 'echo', nodeName: 'a', output: { text: 'AAA' } }]
    // 把 boom 换成可成功：重新构图（同结构不同节点类型）
    const graph2 = g(
      [n('start', 'start'), n('a', 'echo', { text: 'AAA' }), n('b', 'echo', { text: '{{a.text}}-续' }), n('end', 'end')],
      [['start', 'a'], ['a', 'b'], ['b', 'end']]
    )
    resumed.graph = graph2
    const st2 = await exec2(engine2, resumed)
    expect(st2).toBe('succeeded')
    // a 未重执行（rows 里 a 的行由本引擎新建但…应跳过执行：无 a 行即未执行）
    expect(runs2.final.status).toBe('succeeded')
    expect(nodeRuns2.outputOf('b')).toMatchObject({ text: 'AAA-续' })
    expect(nodeRuns2.rows.has('a|0')).toBe(false) // a 直接复用 checkpoint，未重新执行
  })
})
