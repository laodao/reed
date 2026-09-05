/**
 * E1 form-collect 表单收集测试：挂起携 schema / 提交值进输出沿 approve 边 / 取消走 reject / 校验器端口
 * @module tests/workflow/e1-form
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@core/platform/services/knowledge-base.service', () => ({ KnowledgeService: class {} }))
vi.mock('@core/platform/services/ai-call', () => ({ callAIStream: vi.fn(), callVLM: vi.fn(), toImageDataUrl: vi.fn() }))
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { TASK_NODE_HANDLERS } from '@core/platform/workflow/nodes/task-nodes'
import { INTERACTION_NODE_HANDLERS } from '@core/platform/workflow/nodes/interaction-nodes'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import { runWithUser } from '@core/context/user-context'

class FakeRuns {
  patches: Array<Record<string, unknown>> = []
  async patchRun(_id: string, p: Record<string, unknown>) { this.patches.push(p) }
  get final() { return this.patches[this.patches.length - 1] ?? {} }
}
class FakeNodeRuns {
  rows: any[] = []
  seq = 0
  async startNode(i: any) { this.rows.push({ rowKey: `${i.nodeId}|${i.iterationIndex}|${++this.seq}`, ...i, status: 'running' }) }
  async patchNode(_r: string, nodeId: string, iter: number, p: any) {
    const rows = this.rows.filter(x => x.nodeId === nodeId && x.iterationIndex === iter)
    if (rows.length) Object.assign(rows[rows.length - 1], p)
  }
  outputOf(nodeId: string): any {
    const rows = this.rows.filter(r => r.nodeId === nodeId)
    return rows[rows.length - 1]?.output
  }
}
const events: any[] = []

function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS, ...INTERACTION_NODE_HANDLERS])
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id, p) => runs.patchRun(id, p) },
      nodeRuns: { startNode: i => nodeRuns.startNode(i), patchNode: (r, n, it, p) => nodeRuns.patchNode(r, n, it, p) },
      events: { emit: (e: any) => events.push(e) },
    } as any,
    registry
  )
  return { engine, runs, nodeRuns }
}

let seq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as any }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string, string?]>): WorkflowGraph {
  return { version: 1, nodes, edges: edges.map(([s, t, k]) => ({ id: `e${seq++}`, sourceNodeId: s, targetNodeId: t, kind: (k ?? 'normal') as any })) }
}
const input = (graph: WorkflowGraph): ExecuteRunInput => ({ runId: 'run_1', userId: 'u1', definitionId: 'd1', graph, startInputs: {}, settings: { maxNodeRuns: 10 } as any })
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

const FIELDS = [
  { key: 'doc', label: '待翻译文件', type: 'file', required: true },
  { key: 'targetLang', label: '目标语言', type: 'select', options: [{ label: '英', value: 'en' }, { label: '日', value: 'ja' }], required: true },
]

describe('E1 form-collect：校验器', () => {
  it('缺 approve 出边报错；approve+reject 合法', () => {
    const nodes = [n('start', 'start'), n('f', 'form-collect', { formTitle: 't', fields: FIELDS }), n('end', 'end')]
    expect(validateGraph(g(nodes, [['start', 'f'], ['f', 'end']])).valid).toBe(false) // 无提交边
    expect(validateGraph(g(nodes, [['start', 'f'], ['f', 'end', 'approve'], ['f', 'end', 'reject']])).valid).toBe(true)
  })
  it('handler validateConfig：空字段/重复 key/下拉缺选项', () => {
    const h = INTERACTION_NODE_HANDLERS.find(x => x.type === 'form-collect')!
    expect(h.validateConfig({ formTitle: 't', fields: [] } as never).length).toBeGreaterThan(0)
    expect(h.validateConfig({ formTitle: 't', fields: [{ key: 'a', label: 'a', type: 'string' }, { key: 'a', label: 'b', type: 'string' }] } as never).join()).toContain('重复')
    expect(h.validateConfig({ formTitle: 't', fields: [{ key: 's', label: 's', type: 'select' }] } as never).join()).toContain('选项')
    expect(h.validateConfig({ formTitle: 't', fields: FIELDS } as never)).toEqual([])
  })

  it('list-check 字段：缺 source/缺 itemKey 报错；完整声明合法', () => {
    const h = INTERACTION_NODE_HANDLERS.find(x => x.type === 'form-collect')!
    // 缺 source
    expect(h.validateConfig({ formTitle: 't', fields: [{ key: 'c', label: '确认', type: 'list-check' }] } as never).join()).toContain('source')
    // 缺 itemKey
    expect(h.validateConfig({ formTitle: 't', fields: [{ key: 'c', label: '确认', type: 'list-check', source: '{{arr}}' }] } as never).join()).toContain('itemKey')
    // 完整声明
    expect(h.validateConfig({ formTitle: 't', fields: [{ key: 'c', label: '确认', type: 'list-check', source: '{{arr}}', itemKey: '{{id}}' }] } as never)).toEqual([])
  })
})

describe('E1 form-collect：引擎挂起/提交/取消', () => {
  const graph = () => g(
    [n('start', 'start'), n('f', 'form-collect', { formTitle: '请上传', fields: FIELDS }), n('ok', 'assign', { assignments: [{ key: 'done', value: 'yes' }] }), n('cancel', 'assign', { assignments: [{ key: 'done', value: 'no' }] }), n('end', 'end')],
    [['start', 'f'], ['f', 'ok', 'approve'], ['f', 'cancel', 'reject'], ['ok', 'end'], ['cancel', 'end']]
  )

  it('挂起 → review-requested 事件携带表单 schema → 提交值进 { values } 沿 approve 边', async () => {
    const { engine, runs, nodeRuns } = makeEngine()
    const status = await runWithUser('u1', () => engine.execute(input(graph())))
    expect(status).toBe('waiting_review')
    const evt = events.find(e => e.type === 'review-requested')
    expect(evt).toMatchObject({ nodeId: 'f' })
    expect(evt.payload).toMatchObject({ formTitle: '请上传', form: true })
    expect((evt.payload.fields as any[]).some(f => f.type === 'file')).toBe(true)

    // 用户提交（文件字段值是上传产物 {path,name,text}，下拉选 en）
    const applied = await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'f', {
        decision: 'approve_with_changes',
        editedValues: { doc: { path: 'C:/up/a.pdf', name: 'a.pdf', text: '内容' }, targetLang: 'en' },
      } as any)
    )
    expect(applied).toBe(true)
    await wait(150)
    expect(runs.final.status).toBe('succeeded')
    const out = nodeRuns.outputOf('f')
    expect(out.values).toEqual({ doc: { path: 'C:/up/a.pdf', name: 'a.pdf', text: '内容' }, targetLang: 'en' })
    expect(out.cancelled).toBe(false)
    expect(nodeRuns.outputOf('ok')).toMatchObject({ values: { done: 'yes' } }) // approve 边承接
  })

  it('取消（reject）→ cancelled=true 沿 reject 边', async () => {
    const { engine, runs, nodeRuns } = makeEngine()
    await runWithUser('u1', () => engine.execute(input(graph())))
    const applied = await runWithUser('u1', () => engine.resumeReview('run_1', 'f', { decision: 'reject' } as any))
    expect(applied).toBe(true)
    await wait(150)
    expect(runs.final.status).toBe('succeeded')
    expect(nodeRuns.outputOf('f')).toMatchObject({ values: {}, cancelled: true })
    expect(nodeRuns.outputOf('cancel')).toMatchObject({ values: { done: 'no' } })
  })

  it('未声明字段的提交值被过滤（editableKeys=声明字段）', async () => {
    const { engine, nodeRuns } = makeEngine()
    await runWithUser('u1', () => engine.execute(input(graph())))
    // 评审 #101：服务端校验上线后，提交须满足必填（doc）——未声明的 hacker 仍被白名单过滤
    await runWithUser('u1', () =>
      engine.resumeReview('run_1', 'f', { decision: 'approve_with_changes', editedValues: { doc: { path: 'C:/up/a.pdf', name: 'a.pdf', text: '内容' }, targetLang: 'ja', hacker: 'x' } } as any)
    )
    await wait(150)
    const out = nodeRuns.outputOf('f')
    expect(out.values).toEqual({ doc: { path: 'C:/up/a.pdf', name: 'a.pdf', text: '内容' }, targetLang: 'ja' })
    expect(out.values.hacker).toBeUndefined()
  })
})

describe('E1 message 输出节点', () => {
  it('输出内容并成功', async () => {
    const { engine, runs, nodeRuns } = makeEngine()
    const graph = g(
      [n('start', 'start'), n('m', 'message', { content: '翻译完成：{{start.f}}' }), n('end', 'end')],
      [['start', 'm'], ['m', 'end']]
    )
    const execInput = { ...input(graph), startInputs: { f: 'ok' } }
    await runWithUser('u1', () => engine.execute(execInput))
    await wait(100)
    expect(runs.final.status).toBe('succeeded')
    expect(nodeRuns.outputOf('m')).toMatchObject({ content: '翻译完成：ok' })
  })
})
