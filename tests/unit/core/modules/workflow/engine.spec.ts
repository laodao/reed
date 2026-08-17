/**
 * 工作流引擎核心调度测试
 * @module tests/workflow/engine
 * @description 覆盖调度不变量：线性执行、变量传递、条件选路、并行等齐、
 *              部分到达 merge 强制收敛、重试、fail 边恢复、未恢复失败中止、
 *              输出截断、多入边任一到达、并发上限、未注册类型、stats、事件序列。
 *              存储端口用内存假实现（不依赖数据库环境）。
 */

import { describe, it, expect } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/modules/workflow/engine/workflow-engine.service'
import { createNodeRegistry, checkRegistryConsistency } from '@core/modules/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/modules/workflow/nodes/control-nodes'
import type { WorkflowNodeRegistry } from '@core/modules/workflow/engine/node-registry'
import type { WorkflowEngineDeps, WorkflowEventPort, WorkflowNodeRunPort, WorkflowRunPort } from '@core/modules/workflow/engine/ports'
import type { WorkflowRunEvent, WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '@core/modules/workflow/engine/node-handler'
import { runWithUser } from '@core/context/user-context'

// ==================== 测试基建 ====================

class FakeRunStore implements WorkflowRunPort {
  patches: Array<{ runId: string; patch: Record<string, unknown> }> = []
  async patchRun(runId: string, patch: Record<string, unknown>): Promise<void> {
    this.patches.push({ runId, patch })
  }
  get finalPatch(): Record<string, unknown> {
    return this.patches[this.patches.length - 1]?.patch ?? {}
  }
}

class FakeNodeRunStore implements WorkflowNodeRunPort {
  rows: Map<string, Record<string, unknown>> = new Map()
  async startNode(input: Parameters<WorkflowNodeRunPort['startNode']>[0]): Promise<void> {
    const key = `${input.runId}|${input.nodeId}|${input.iterationIndex}`
    if (this.rows.has(key)) throw new Error(`重复 start：${key}`)
    this.rows.set(key, { ...input, status: 'running' })
  }
  async patchNode(
    runId: string,
    nodeId: string,
    iterationIndex: number,
    patch: Record<string, unknown>
  ): Promise<void> {
    const key = `${runId}|${nodeId}|${iterationIndex}`
    const row = this.rows.get(key)
    if (!row) throw new Error(`patch 不存在的节点行：${key}`)
    Object.assign(row, patch)
  }
  statusOf(nodeId: string): string | undefined {
    for (const row of this.rows.values()) if (row.nodeId === nodeId) return row.status as string
    return undefined
  }
  outputOf(nodeId: string): Record<string, unknown> | undefined {
    for (const row of this.rows.values()) if (row.nodeId === nodeId) return row.output as Record<string, unknown>
    return undefined
  }
}

class FakeEventSink implements WorkflowEventPort {
  events: WorkflowRunEvent[] = []
  emit(event: WorkflowRunEvent): void {
    this.events.push(event)
  }
  nodeStatusesOf(nodeId: string): string[] {
    return this.events
      .filter((e): e is Extract<WorkflowRunEvent, { type: 'node-status' }> => e.type === 'node-status')
      .filter(e => e.nodeId === nodeId)
      .map(e => e.status)
  }
  runStatuses(): string[] {
    return this.events
      .filter((e): e is Extract<WorkflowRunEvent, { type: 'run-status' }> => e.type === 'run-status')
      .map(e => e.status)
  }
}

// ---- 测试用节点 handler ----

/** echo：输出 config.text 与全部 config（任务类） */
function makeEchoHandler(): WorkflowNodeHandler {
  return {
    type: 'echo' as any,
    controlKind: 'task',
    cancellable: false,
    outputSchema: [{ key: 'text', type: 'string', desc: '' }],
    validateConfig: () => [],
    async execute(ctx: WorkflowNodeContext) {
      return { status: 'succeeded', output: { text: String(ctx.config.text ?? ''), all: ctx.config as Record<string, unknown> } }
    },
  }
}

/** boom：前 failTimes 次失败，之后成功（重试/fail边测试） */
function makeBoomHandler(failTimes: number): WorkflowNodeHandler {
  let calls = 0
  return {
    type: 'boom' as any,
    controlKind: 'task',
    cancellable: false,
    outputSchema: [],
    validateConfig: () => [],
    async execute() {
      calls++
      if (calls <= failTimes) return { status: 'failed', error: `第 ${calls} 次失败` }
      return { status: 'succeeded', output: { attempts: calls } }
    },
  }
}

/** slow：延时后成功（并发测试） */
function makeSlowHandler(ms: number): WorkflowNodeHandler {
  const started: number[] = []
  const finished: number[] = []
  const handler: WorkflowNodeHandler = {
    type: 'slow' as any,
    controlKind: 'task',
    cancellable: false,
    outputSchema: [],
    validateConfig: () => [],
    async execute() {
      started.push(Date.now())
      await new Promise(r => setTimeout(r, ms))
      finished.push(Date.now())
      return { status: 'succeeded', output: {} }
    },
  }
  return Object.assign(handler, { started, finished })
}

// ---- 图构建辅助 ----

let edgeSeq = 0
function makeNode(id: string, type: string, config: Record<string, unknown> = {}, settings?: Record<string, unknown>): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as any, settings: settings as any }
}
function makeGraph(nodes: WorkflowNode[], edges: Array<[string, string, string?]>): WorkflowGraph {
  return {
    version: 1,
    nodes,
    edges: edges.map(([s, t, kind]) => ({
      id: `e${edgeSeq++}`,
      sourceNodeId: s,
      targetNodeId: t,
      kind: (kind ?? 'normal') as any,
    })),
  }
}

/** 装配引擎（控制节点 + 指定额外交测 handler） */
function makeEngine(extraHandlers: WorkflowNodeHandler[] = []) {
  const runs = new FakeRunStore()
  const nodeRuns = new FakeNodeRunStore()
  const events = new FakeEventSink()
  const deps: WorkflowEngineDeps = { runs, nodeRuns, events }
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...extraHandlers])
  const engine = new WorkflowEngineService(deps, registry)
  return { engine, runs, nodeRuns, events, registry }
}

function runInput(graph: WorkflowGraph, startInputs: Record<string, unknown> = {}, settings?: Record<string, number>) {
  return {
    runId: 'run_1',
    userId: 'test-user',
    definitionId: 'def_1',
    graph,
    startInputs,
    settings,
  }
}

/** execute 必须在用户上下文内调用（引擎纪律） */
async function execute(engine: WorkflowEngineService, input: ExecuteRunInput) {
  return runWithUser('test-user', () => engine.execute(input))
}

// ==================== 用例 ====================

describe('WorkflowEngineService 核心调度', () => {
  it('线性图：start → echo → end，变量经 {{nodeId.field}} 传递', async () => {
    const { engine, runs, nodeRuns } = makeEngine([makeEchoHandler()])
    const graph = makeGraph(
      [
        makeNode('start', 'start', { inputs: [] }),
        makeNode('a', 'echo', { text: '你好' }),
        makeNode('b', 'echo', { text: '{{a.text}}-后续' }),
        makeNode('end', 'end'),
      ],
      [['start', 'a'], ['a', 'b'], ['b', 'end']]
    )
    const status = await execute(engine, runInput(graph))
    expect(status).toBe('succeeded')
    expect(nodeRuns.outputOf('b')).toMatchObject({ text: '你好-后续' })
    expect(runs.finalPatch.status).toBe('succeeded')
  })

  it('{{start.key}} 输入参数引用 + 单占位类型透传（数字）', async () => {
    const echo = makeEchoHandler()
    const { engine, nodeRuns } = makeEngine([echo])
    const graph = makeGraph(
      [makeNode('start', 'start', { inputs: [] }), makeNode('a', 'echo', { text: '{{start.count}}' }), makeNode('end', 'end')],
      [['start', 'a'], ['a', 'end']]
    )
    await execute(engine, runInput(graph, { count: 42 }))
    // 单占位透传：config.text 解析后应为数字 42（不是字符串 "42"）
    expect(nodeRuns.outputOf('a')).toMatchObject({ text: '42', all: { text: 42 } })
  })

  it('嵌套路径引用：{{a.data.items.0.name}}', async () => {
    const echo = makeEchoHandler()
    // 先用一个 handler 产出嵌套结构
    const producer: WorkflowNodeHandler = {
      type: 'producer' as any,
      controlKind: 'task',
      cancellable: false,
      outputSchema: [],
      validateConfig: () => [],
      async execute() {
        return { status: 'succeeded', output: { data: { items: [{ name: '第一项' }] } } }
      },
    }
    const { engine, nodeRuns } = makeEngine([echo, producer])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('p', 'producer'),
        makeNode('a', 'echo', { text: '{{p.data.items.0.name}}' }),
        makeNode('end', 'end'),
      ],
      [['start', 'p'], ['p', 'a'], ['a', 'end']]
    )
    await execute(engine, runInput(graph))
    expect(nodeRuns.outputOf('a')).toMatchObject({ text: '第一项' })
  })

  it('条件分支：按声明顺序命中第一路，只激活命中出边', async () => {
    const echo = makeEchoHandler()
    const { engine, nodeRuns } = makeEngine([echo])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('score', 'echo', { text: '0.9' }),
        makeNode('cond', 'condition', {
          branches: [
            { branchId: 'high', label: '高分', conditions: [{ left: '{{score.text}}', operator: 'gte', right: '0.8' }] },
            { branchId: 'low', label: '低分', conditions: [{ left: '{{score.text}}', operator: 'lt', right: '0.8' }] },
          ],
          noMatchPolicy: 'fail',
        }),
        makeNode('hi', 'echo', { text: '高' }),
        makeNode('lo', 'echo', { text: '低' }),
        makeNode('end', 'end'),
      ],
      [
        ['start', 'score'],
        ['score', 'cond'],
        ['cond', 'hi', 'branch'],
        ['cond', 'lo', 'branch'],
        ['hi', 'end'],
        ['lo', 'end'],
      ]
    )
    // branchId 附加到边上
    graph.edges[2].branchId = 'high'
    graph.edges[3].branchId = 'low'

    await execute(engine, runInput(graph))
    expect(nodeRuns.statusOf('hi')).toBe('succeeded')
    expect(nodeRuns.statusOf('lo')).toBeUndefined() // 未走分支不执行
    expect(nodeRuns.outputOf('cond')).toMatchObject({ matchedBranch: 'high' })
  })

  it('条件全未命中 noMatchPolicy=fallback：走 fallback 边', async () => {
    const echo = makeEchoHandler()
    const { engine, nodeRuns } = makeEngine([echo])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('cond', 'condition', {
          branches: [{ branchId: 'b1', label: '一', conditions: [{ left: '{{start.v}}', operator: 'eq', right: '命中' }] }],
          noMatchPolicy: 'fallback',
          fallbackBranchId: 'b1',
        }),
        makeNode('x', 'echo', { text: '默认' }),
        makeNode('end', 'end'),
      ],
      [['start', 'cond'], ['cond', 'x', 'branch'], ['x', 'end']]
    )
    graph.edges[1].branchId = 'b1'
    await execute(engine, runInput(graph, { v: '不命中' }))
    expect(nodeRuns.statusOf('x')).toBe('succeeded')
    expect(nodeRuns.outputOf('cond')).toMatchObject({ matchedBranch: 'b1', fallback: true })
  })

  it('条件全未命中 noMatchPolicy=fail：节点失败（无 fail 边 → run failed）', async () => {
    const { engine, runs } = makeEngine([])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('cond', 'condition', {
          branches: [{ branchId: 'b1', label: '一', conditions: [{ left: '{{start.v}}', operator: 'eq', right: 'x' }] }],
          noMatchPolicy: 'fail',
        }),
        makeNode('end', 'end'),
      ],
      [['start', 'cond'], ['cond', 'end', 'branch']]
    )
    graph.edges[1].branchId = 'b1'
    const status = await execute(engine, runInput(graph, { v: 'y' }))
    expect(status).toBe('failed')
    expect(runs.finalPatch.status).toBe('failed')
  })

  it('并行扇出 + merge 等齐（all）：两分支都完成才执行 merge，输出按来源展开', async () => {
    const slow = makeSlowHandler(30)
    const echo = makeEchoHandler()
    const { engine, nodeRuns } = makeEngine([slow, echo])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('p', 'parallel'),
        makeNode('a', 'slow'),
        makeNode('b', 'echo', { text: 'B路' }),
        makeNode('m', 'parallel-merge', { waitPolicy: 'all', outputMode: 'merge' }),
        makeNode('after', 'echo', { text: '{{m.b.text}}' }),
        makeNode('end', 'end'),
      ],
      [
        ['start', 'p'],
        ['p', 'a'],
        ['p', 'b'],
        ['a', 'm'],
        ['b', 'm'],
        ['m', 'after'],
        ['after', 'end'],
      ]
    )
    await execute(engine, runInput(graph))
    expect(nodeRuns.statusOf('m')).toBe('succeeded')
    expect(nodeRuns.outputOf('m')).toMatchObject({ a: {}, b: { text: 'B路' } })
    expect(nodeRuns.outputOf('after')).toMatchObject({ text: 'B路' })
  })

  it('merge waitPolicy=any：任一到达即执行', async () => {
    const slow = makeSlowHandler(50)
    const echo = makeEchoHandler()
    const { engine, nodeRuns } = makeEngine([slow, echo])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('p', 'parallel'),
        makeNode('a', 'slow'),
        makeNode('b', 'echo', { text: '快' }),
        makeNode('m', 'parallel-merge', { waitPolicy: 'any', outputMode: 'first' }),
        makeNode('end', 'end'),
      ],
      [['start', 'p'], ['p', 'a'], ['p', 'b'], ['a', 'm'], ['b', 'm'], ['m', 'end']]
    )
    await execute(engine, runInput(graph))
    expect(nodeRuns.statusOf('m')).toBe('succeeded')
    // first 模式：首达分支（b，a 还在延时）
    expect(nodeRuns.outputOf('m')).toMatchObject({ text: '快' })
  })

  it('merge 部分到达强制收敛：条件分支只走一路 → merge 只有一路到达仍执行', async () => {
    const echo = makeEchoHandler()
    const { engine, nodeRuns, runs } = makeEngine([echo])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('cond', 'condition', {
          branches: [
            { branchId: 'yes', label: '是', conditions: [{ left: '{{start.go}}', operator: 'eq', right: 'true' }] },
            { branchId: 'no', label: '否', conditions: [{ left: '{{start.go}}', operator: 'ne', right: 'true' }] },
          ],
          noMatchPolicy: 'fail',
        }),
        makeNode('a', 'echo', { text: 'A' }),
        makeNode('b', 'echo', { text: 'B' }),
        makeNode('m', 'parallel-merge', { waitPolicy: 'all', outputMode: 'merge' }),
        makeNode('end', 'end'),
      ],
      [
        ['start', 'cond'],
        ['cond', 'a', 'branch'],
        ['cond', 'b', 'branch'],
        ['a', 'm'],
        ['b', 'm'],
        ['m', 'end'],
      ]
    )
    graph.edges[1].branchId = 'yes'
    graph.edges[2].branchId = 'no'
    const status = await execute(engine, runInput(graph, { go: 'true' }))
    expect(status).toBe('succeeded')
    expect(nodeRuns.statusOf('a')).toBe('succeeded')
    expect(nodeRuns.statusOf('b')).toBeUndefined()
    expect(nodeRuns.statusOf('m')).toBe('succeeded') // 强制收敛
    expect(nodeRuns.outputOf('m')).toMatchObject({ a: { text: 'A' } })
    expect(runs.finalPatch.status).toBe('succeeded')
  })

  it('重试：失败 2 次后第 3 次成功（retryCount=2）', async () => {
    const boom = makeBoomHandler(2)
    const { engine, nodeRuns } = makeEngine([boom])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('x', 'boom', {}, { retryCount: 2, retryDelayMs: 1 }),
        makeNode('end', 'end'),
      ],
      [['start', 'x'], ['x', 'end']]
    )
    const status = await execute(engine, runInput(graph))
    expect(status).toBe('succeeded')
    expect(nodeRuns.outputOf('x')).toMatchObject({ attempts: 3 })
    const row = [...nodeRuns.rows.values()].find(r => r.nodeId === 'x')
    expect(row?.retryCount).toBe(2)
  })

  it('重试耗尽走 fail 边：failed_recovered，run succeeded，下游引用 {{nodeId.error}}', async () => {
    const boom = makeBoomHandler(99)
    const echo = makeEchoHandler()
    const { engine, nodeRuns, runs } = makeEngine([boom, echo])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('x', 'boom', {}, { retryCount: 1, retryDelayMs: 1 }),
        makeNode('fallback', 'echo', { text: '恢复:{{x.error}}' }),
        makeNode('end', 'end'),
      ],
      [['start', 'x'], ['x', 'fallback', 'fail'], ['x', 'end'], ['fallback', 'end']]
    )
    const status = await execute(engine, runInput(graph))
    expect(status).toBe('succeeded')
    expect(nodeRuns.statusOf('x')).toBe('failed_recovered')
    expect(nodeRuns.outputOf('x')).toMatchObject({ error: '第 2 次失败', recovered: true })
    expect(nodeRuns.outputOf('fallback')).toMatchObject({ text: '恢复:第 2 次失败' })
    expect(runs.finalPatch).toMatchObject({ status: 'succeeded' })
    expect(runs.finalPatch.stats).toMatchObject({ failedNodes: 0, recoveredNodes: 1 })
  })

  it('未恢复失败：中止运行，其余在飞节点标 cancelled', async () => {
    const boom = makeBoomHandler(99)
    const slow = makeSlowHandler(80)
    const { engine, nodeRuns, runs, events } = makeEngine([boom, slow])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('p', 'parallel'),
        makeNode('bad', 'boom', {}, { retryCount: 0 }),
        makeNode('slow', 'slow'),
        makeNode('m', 'parallel-merge', { waitPolicy: 'all' }),
        makeNode('end', 'end'),
      ],
      [
        ['start', 'p'],
        ['p', 'bad'],
        ['p', 'slow'],
        ['bad', 'm'],
        ['slow', 'm'],
        ['m', 'end'],
      ]
    )
    const status = await execute(engine, runInput(graph))
    expect(status).toBe('failed')
    expect(nodeRuns.statusOf('bad')).toBe('failed')
    expect(nodeRuns.statusOf('slow')).toBe('cancelled') // 在飞被中止
    expect(runs.finalPatch.status).toBe('failed')
    expect(events.runStatuses()).toContain('failed')
  })

  it('输出截断：超长输出加 __truncated 标记且总长受限', async () => {
    const big: WorkflowNodeHandler = {
      type: 'big' as any,
      controlKind: 'task',
      cancellable: false,
      outputSchema: [],
      validateConfig: () => [],
      async execute() {
        return { status: 'succeeded', output: { blob: 'x'.repeat(5000), small: 'ok' } }
      },
    }
    const echo = makeEchoHandler()
    const { engine, nodeRuns } = makeEngine([big, echo])
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('b', 'big'), makeNode('end', 'end')],
      [['start', 'b'], ['b', 'end']]
    )
    await execute(engine, runInput(graph, {}, { maxOutputChars: 1000 }))
    const output = nodeRuns.outputOf('b')!
    expect(output.__truncated).toBe(true)
    expect(JSON.stringify(output).length).toBeLessThan(1200)
    expect(output.small).toBe('ok')
  })

  it('多入边普通节点：任一到达即执行（不死锁）', async () => {
    const slow = makeSlowHandler(30)
    const echo = makeEchoHandler()
    const { engine, nodeRuns } = makeEngine([slow, echo])
    // A(慢) → C；B(快) → C：C 应在 B 完成后立即执行，不等 A
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('p', 'parallel'),
        makeNode('a', 'slow'),
        makeNode('b', 'echo', { text: '快' }),
        makeNode('c', 'echo', { text: '{{b.text}}-到达' }),
        makeNode('end', 'end'),
      ],
      [['start', 'p'], ['p', 'a'], ['p', 'b'], ['a', 'c'], ['b', 'c'], ['c', 'end']]
    )
    await execute(engine, runInput(graph))
    expect(nodeRuns.statusOf('c')).toBe('succeeded')
    expect(nodeRuns.outputOf('c')).toMatchObject({ text: '快-到达' })
  })

  it('并发上限 maxParallelNodes=1：任务串行执行', async () => {
    const slow = makeSlowHandler(25)
    const { engine } = makeEngine([slow])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('p', 'parallel'),
        makeNode('t1', 'slow'),
        makeNode('t2', 'slow'),
        makeNode('t3', 'slow'),
        makeNode('m', 'parallel-merge', { waitPolicy: 'all' }),
        makeNode('end', 'end'),
      ],
      [
        ['start', 'p'],
        ['p', 't1'], ['p', 't2'], ['p', 't3'],
        ['t1', 'm'], ['t2', 'm'], ['t3', 'm'],
        ['m', 'end'],
      ]
    )
    await execute(engine, runInput(graph, {}, { maxParallelNodes: 1 }))
    // 串行验证：任一任务的 started 不早于前一任务的 finished
    const { started, finished } = slow as unknown as { started: number[]; finished: number[] }
    expect(started.length).toBe(3)
    expect(finished.length).toBe(3)
    for (let i = 1; i < 3; i++) {
      expect(started[i]).toBeGreaterThanOrEqual(finished[i - 1])
    }
  })

  it('未注册节点类型：运行直接 failed（前置检查）', async () => {
    const { engine, runs } = makeEngine([])
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('x', 'no-such-type'), makeNode('end', 'end')],
      [['start', 'x'], ['x', 'end']]
    )
    const status = await execute(engine, runInput(graph))
    expect(status).toBe('failed')
    expect(String(runs.finalPatch.error)).toContain('no-such-type')
  })

  it('不可达节点不执行，stats.totalNodes 含全部节点', async () => {
    const echo = makeEchoHandler()
    const { engine, nodeRuns, runs } = makeEngine([echo])
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('a', 'echo', { text: '1' }), makeNode('orphan', 'echo'), makeNode('end', 'end')],
      [['start', 'a'], ['a', 'end']]
    )
    await execute(engine, runInput(graph))
    expect(nodeRuns.statusOf('orphan')).toBeUndefined()
    // 口径：totalNodes/doneNodes 均按执行实例计（不可达节点不执行、不计入）
    expect(runs.finalPatch.stats).toMatchObject({ totalNodes: 3, doneNodes: 3 })
  })

  it('事件序列：run running → … → succeeded；节点状态可见', async () => {
    const echo = makeEchoHandler()
    const { engine, events } = makeEngine([echo])
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('a', 'echo', { text: 'x' }), makeNode('end', 'end')],
      [['start', 'a'], ['a', 'end']]
    )
    await execute(engine, runInput(graph))
    const statuses = events.runStatuses()
    expect(statuses[0]).toBe('running')
    expect(statuses[statuses.length - 1]).toBe('succeeded')
    expect(events.nodeStatusesOf('a')).toEqual(
      expect.arrayContaining(['running', 'succeeded'])
    )
  })

  it('变量赋值节点：{{assignN.values.key}} 可被下游引用', async () => {
    const echo = makeEchoHandler()
    const { engine, nodeRuns } = makeEngine([echo])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('v', 'assign', { assignments: [{ key: 'topic', value: 'AI' }, { key: 'n', value: '{{start.count}}' }] }),
        makeNode('a', 'echo', { text: '主题:{{v.values.topic}} 数:{{v.values.n}}' }),
        makeNode('end', 'end'),
      ],
      [['start', 'v'], ['v', 'a'], ['a', 'end']]
    )
    await execute(engine, runInput(graph, { count: 7 }))
    expect(nodeRuns.outputOf('a')).toMatchObject({ text: '主题:AI 数:7' })
  })

  it('模板注入防护：上游输出含字面 {{...}} 不被二次展开', async () => {
    const echo = makeEchoHandler()
    // 产出字面模板串的节点（handler 代码内构造，引擎只解析 config 不解析输出）
    const literal: WorkflowNodeHandler = {
      type: 'literal' as any,
      controlKind: 'task',
      cancellable: false,
      outputSchema: [],
      validateConfig: () => [],
      async execute() {
        // 模拟 LLM 复述模板语法：输出里恰好是字面 {{start.secret}}
        return { status: 'succeeded', output: { text: '{{start.secret}}' } }
      },
    }
    const { engine, nodeRuns } = makeEngine([echo, literal])
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('e', 'literal'),
        makeNode('v', 'assign', { assignments: [{ key: 'msg', value: '{{e.text}}' }] }),
        makeNode('a', 'echo', { text: '{{v.values.msg}}' }),
        makeNode('end', 'end'),
      ],
      [['start', 'e'], ['e', 'v'], ['v', 'a'], ['a', 'end']]
    )
    await execute(engine, runInput(graph, { secret: '机密值' }))
    // 单占位透传：{{e.text}} 解析为字面字符串 "{{start.secret}}"；
    // assign/下游不得再把它二次展开成 "机密值"
    expect(nodeRuns.outputOf('a')).toMatchObject({ text: '{{start.secret}}' })
  })

  it('execute 返回值与落库终态一致：失败中止时先启动节点的 cancelled 不遮蔽 failed', async () => {
    const boom = makeBoomHandler(99)
    const slow = makeSlowHandler(40)
    const { engine, runs } = makeEngine([boom, slow])
    // slow 在图中排在 bad 之前（states 先插入 cancelled）
    const graph = makeGraph(
      [
        makeNode('start', 'start'),
        makeNode('p', 'parallel'),
        makeNode('slow', 'slow'),
        makeNode('bad', 'boom', {}, { retryCount: 0 }),
        makeNode('m', 'parallel-merge', { waitPolicy: 'all' }),
        makeNode('end', 'end'),
      ],
      [
        ['start', 'p'],
        ['p', 'slow'],
        ['p', 'bad'],
        ['slow', 'm'],
        ['bad', 'm'],
        ['m', 'end'],
      ]
    )
    const status = await execute(engine, runInput(graph))
    expect(status).toBe('failed') // 不是 cancelled
    expect(runs.finalPatch.status).toBe('failed')
  })

  it('看门狗：超过 maxDurationMs 强制 timed_out 且不等待悬挂任务', async () => {
    const slow = makeSlowHandler(5000) // 忽略 signal 的长任务
    const { engine, runs } = makeEngine([slow])
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('s', 'slow'), makeNode('end', 'end')],
      [['start', 's'], ['s', 'end']]
    )
    const t0 = Date.now()
    const status = await execute(engine, runInput(graph, {}, { maxDurationMs: 50 }))
    const elapsed = Date.now() - t0
    expect(status).toBe('timed_out')
    expect(runs.finalPatch.status).toBe('timed_out')
    expect(elapsed).toBeLessThan(2000) // 远小于 slow 的 5s
  })

  it('写库异常兜底：startNode 抛错 → run 落 failed 终态（不悬死 running）', async () => {
    const echo = makeEchoHandler()
    const runs = new FakeRunStore()
    const nodeRuns = new FakeNodeRunStore()
    // 第二个节点（echo）建行时抛错，模拟 DB 瞬时故障
    const originalStart = nodeRuns.startNode.bind(nodeRuns)
    let call = 0
    nodeRuns.startNode = async input => {
      call++
      if (call === 2) throw new Error('ECONNREFUSED')
      return originalStart(input)
    }
    const events = new FakeEventSink()
    const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, echo])
    const engine = new WorkflowEngineService({ runs, nodeRuns, events }, registry)
    const graph = makeGraph(
      [makeNode('start', 'start'), makeNode('a', 'echo', { text: 'x' }), makeNode('end', 'end')],
      [['start', 'a'], ['a', 'end']]
    )
    const status = await execute(engine, runInput(graph))
    expect(status).toBe('failed')
    expect(runs.finalPatch.status).toBe('failed')
    expect(String(runs.finalPatch.error)).toContain('ECONNREFUSED')
  })
})

describe('注册表一致性', () => {
  it('控制节点与目录元数据一致', () => {
    const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS])
    // 引擎测试只注册控制类；目录中的任务类节点尚未注册 → 一致性检查应报告缺失
    const problems = checkRegistryConsistency(registry)
    const missing = problems.filter(p => p.includes('未注册 handler'))
    expect(missing.length).toBeGreaterThan(0) // 任务类待片5 注册
    // 但已注册的控制类不应有不一致
    const inconsistent = problems.filter(p => !p.includes('未注册 handler'))
    expect(inconsistent).toEqual([])
  })

  it('重复注册同一类型抛错', () => {
    const registry = createNodeRegistry()
    registry.register(CONTROL_NODE_HANDLERS[0])
    expect(() => registry.register(CONTROL_NODE_HANDLERS[0])).toThrow()
  })
})

describe('执行设置解析', () => {
  it('resolveExecutionSettings：默认值与上限封顶', async () => {
    const { resolveExecutionSettings } = await import('@core/modules/workflow/engine/execution-settings')
    const def = resolveExecutionSettings(undefined)
    expect(def.maxParallelNodes).toBeGreaterThan(0)
    const capped = resolveExecutionSettings({ maxParallelNodes: 99999, maxRetryCount: -5 })
    expect(capped.maxParallelNodes).toBeLessThanOrEqual(20)
    expect(capped.maxRetryCount).toBeGreaterThan(0) // 负数回退默认
  })
})

