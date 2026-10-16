/**
 * 电商套图 v3 确认链引擎测试（array-merge + list-check 表单 + 重生成循环）
 * @module tests/unit/core/platform/workflow/ecommerce-confirm-chain.spec
 * @description 验证：两批图 merge → form-collect(list-check) 挂起 → 用户提交部分未确认
 *              → condCheck 走 regen 分支 → loop3 重生成（uncheckedItems）→ report。
 *              引擎级覆盖（form-collect/condition/loop/image-gen/save-asset 全 mock）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@core/platform/services/knowledge-base.service', () => ({ KnowledgeService: class {} }))
vi.mock('@core/platform/services/ai-call', () => ({
  callAIStream: vi.fn(async () => ({ content: '{}', usage: {} })),
  callVLM: vi.fn(),
  toImageDataUrl: vi.fn(),
}))
vi.mock('@core/platform/assets/asset-registry', () => ({
  getAssetService: () => ({
    createAsset: vi.fn(async (input: Record<string, unknown>) => ({
      id: `asset_${String(input.name ?? 'x')}_${Date.now()}`,
      name: String(input.name ?? 'x'),
      category: 'image',
      subCategory: '电商套图',
      kind: 'file',
      groupId: 'ag_1',
    })),
    assetPreviewUrl: () => 'local-image://x.png',
  }),
}))
import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { TASK_NODE_HANDLERS } from '@core/platform/workflow/nodes/task-nodes'
import { INTERACTION_NODE_HANDLERS } from '@core/platform/workflow/nodes/interaction-nodes'
import { EXTRA_NODE_HANDLERS } from '@core/platform/workflow/nodes/extra-nodes'
import { ASSET_NODE_HANDLERS } from '@core/platform/workflow/nodes/asset-nodes'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import type { WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'
import { runWithUser } from '@core/context/user-context'
import { registerPathProvider } from '@core/interfaces/path.interface'
import { tmpdir } from 'node:os'

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

const fakeImg: WorkflowNodeHandler = {
  type: 'image-gen', controlKind: 'task', cancellable: false,
  outputSchema: [], validateConfig: () => [],
  async execute(ctx) {
    const cfg = ctx.config as { prompt?: string; seed?: number }
    return { status: 'succeeded', output: { prompt: String(cfg.prompt ?? ''), seed: cfg.seed, images: [{ path: 'C:/x/img.png', width: 512, height: 512 }] } }
  },
}
const fakeReport: WorkflowNodeHandler = {
  type: 'report', controlKind: 'task', cancellable: false,
  outputSchema: [], validateConfig: () => [],
  async execute(ctx) {
    return { status: 'succeeded', output: { markdown: String((ctx.config as { template?: string }).template ?? ''), title: '' } }
  },
}

let seq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as never }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string, string?, string?]>): WorkflowGraph {
  return {
    version: 1, nodes,
    edges: edges.map(([s, t, k, b]) => ({ id: `e${seq++}`, sourceNodeId: s, targetNodeId: t, kind: (k ?? 'normal') as never, ...(b ? { branchId: b } : {}) })),
  }
}
function makeEngine() {
  const runs = new FakeRuns()
  const nodeRuns = new FakeNodeRuns()
  const registry = createNodeRegistry([
    ...CONTROL_NODE_HANDLERS, ...TASK_NODE_HANDLERS, ...INTERACTION_NODE_HANDLERS,
    ...EXTRA_NODE_HANDLERS, ...ASSET_NODE_HANDLERS, fakeImg, fakeReport,
  ])
  const engine = new WorkflowEngineService(
    {
      runs: { patchRun: (id, p) => runs.patchRun(id, p) },
      nodeRuns: { startNode: i => nodeRuns.startNode(i), patchNode: (r, n, it, p) => nodeRuns.patchNode(r, n, it, p) },
      events: { emit: (e: any) => events.push(e) },
    } as never,
    registry
  )
  return { engine, runs, nodeRuns }
}
const input = (graph: WorkflowGraph, startInputs: Record<string, unknown> = {}): ExecuteRunInput =>
  ({ runId: 'run_c', userId: 'u1', definitionId: 'd1', graph, startInputs, settings: { maxNodeRuns: 50 } as never })
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('电商套图 v3 确认链', () => {
  beforeEach(() => {
    events.length = 0
    registerPathProvider(() => ({
      getDataPath: () => tmpdir(),
      getUserDataPath: () => tmpdir(),
      getAppDataPath: () => tmpdir(),
      getTempPath: () => tmpdir(),
      getSubDirectories: () => ({}) as never,
      getSubDirectoryPath: () => tmpdir(),
      toAssetUrl: (p: string) => 'local-image://' + p,
    }))
  })

  it('部分未确认 → condCheck 走 regen → loop3 重生成未确认项 → report', async () => {
    const graph = g(
      [
        n('start', 'start'),
        // 两批图（loop 输出简化：直接 start 输入模拟 merge 结果）
        n('merge1', 'array-merge', { sources: ['{{start.batch1}}', '{{start.batch2}}'] }),
        n('check1', 'form-collect', {
          formTitle: '确认',
          fields: [{
            key: 'confirm', label: '逐张确认', type: 'list-check',
            source: '{{merge1.merged}}', itemLabel: '{{item.name}}', itemKey: '{{item.assetId}}',
          }],
        }),
        n('condCheck', 'condition', {
          branches: [
            { branchId: 'regen', label: '有需重生成', conditions: [{ left: '{{check1.values.confirm.unchecked}}', operator: 'not_empty' }] },
            { branchId: 'allOk', label: '全部确认', conditions: [] },
          ],
          noMatchPolicy: 'fallback', fallbackBranchId: 'allOk',
        }),
        n('loop3', 'loop', { listExpression: '{{check1.values.confirm.uncheckedItems}}', emptyPolicy: 'skip' }),
        n('img3', 'image-gen', { prompt: '{{loop3.item.prompt}}', seed: 42 }),
        n('saveImg3', 'save-asset', { content: '{{img3.images.0.path}}', kind: 'file', name: '{{loop3.item.name}}', groupName: '套图', replaceAssetId: '{{loop3.item.assetId}}' }),
        n('report1', 'report', { title: '清单', template: '{{loop3.results}}' }),
        n('end', 'end'),
      ],
      [
        ['start', 'merge1'],
        ['merge1', 'check1'],
        ['check1', 'condCheck', 'approve'],
        ['check1', 'end', 'reject'],
        ['condCheck', 'loop3', 'branch', 'regen'],
        ['condCheck', 'report1', 'branch', 'allOk'],
        ['loop3', 'img3', 'loop-body'],
        ['img3', 'saveImg3'],
        ['saveImg3', 'loop3', 'loop-back'],
        ['loop3', 'report1', 'loop-done'],
        ['report1', 'end'],
      ]
    )
    const { engine, runs, nodeRuns } = makeEngine()
    // 两批图：batch1 两张（main-0/promo-1），batch2 两张场景
    const status = await runWithUser('u1', () => engine.execute(input(graph, {
      batch1: [
        { assetId: 'asset_main-0', name: 'main-0', prompt: 'M', width: 1024, height: 1024 },
        { assetId: 'asset_promo-1', name: 'promo-1', prompt: 'P', width: 1024, height: 1024 },
      ],
      batch2: [
        { assetId: 'asset_scene-1', name: '场景1', prompt: 'P1', width: 1024, height: 1024 },
        { assetId: 'asset_scene-2', name: '场景2', prompt: 'P2', width: 1024, height: 1024 },
      ],
    })))
    expect(status).toBe('waiting_review')
    // 送审事件携带 list-check 字段（source 已解析为数组）
    const evt = events.find(e => e.type === 'review-requested')
    const field = ((evt?.payload?.fields ?? []) as Array<Record<string, unknown>>).find(f => f.type === 'list-check')
    expect(field).toBeDefined()
    expect(Array.isArray(field!.source)).toBe(true)
    expect((field!.source as Array<{ name: string }>).length).toBe(4)

    // 用户：确认 main-0 和 promo-1（checked），场景图未确认（unchecked → 重生成）
    const applied = await runWithUser('u1', () =>
      engine.resumeReview('run_c', 'check1', {
        decision: 'approve_with_changes',
        editedValues: {
          confirm: {
            checked: ['asset_main-0', 'asset_promo-1'],
            unchecked: ['asset_scene-1', 'asset_scene-2'],
            uncheckedItems: [
              { assetId: 'asset_scene-1', name: '场景1', prompt: 'P1', width: 1024, height: 1024 },
              { assetId: 'asset_scene-2', name: '场景2', prompt: 'P2', width: 1024, height: 1024 },
            ],
          },
        },
      } as never)
    )
    expect(applied).toBe(true)
    await wait(200)
    expect(runs.final.status).toBe('succeeded')
    // loop3 重生成 2 张（uncheckedItems），保存同名（替换语义）
    const save3 = nodeRuns.rows.filter(r => r.nodeId === 'saveImg3' && r.status === 'succeeded')
    expect(save3.length).toBe(2)
    // 保存名与未确认项一致（不再 -v2；旧图由 replaceAssetId 删除）
    const savedNames = save3.map(r => r.output?.name)
    expect(savedNames).toContain('场景1')
    expect(savedNames).toContain('场景2')
    // img3 带固定 seed（一致性）
    const img3Calls = nodeRuns.rows.filter(r => r.nodeId === 'img3' && r.status === 'succeeded')
    expect(img3Calls.every(r => r.output?.seed === 42)).toBe(true)
  })

  it('全部确认 → condCheck 走 allOk → 跳过重生成直接 report', async () => {
    const graph = g(
      [
        n('start', 'start'),
        n('merge1', 'array-merge', { sources: ['{{start.batch1}}'] }),
        n('check1', 'form-collect', {
          formTitle: '确认',
          fields: [{ key: 'confirm', label: '确认', type: 'list-check', source: '{{merge1.merged}}', itemLabel: '{{item.name}}', itemKey: '{{item.assetId}}' }],
        }),
        n('condCheck', 'condition', {
          branches: [
            { branchId: 'regen', label: '重生成', conditions: [{ left: '{{check1.values.confirm.unchecked}}', operator: 'not_empty' }] },
            { branchId: 'allOk', label: '全部确认', conditions: [] },
          ],
          noMatchPolicy: 'fallback', fallbackBranchId: 'allOk',
        }),
        n('loop3', 'loop', { listExpression: '{{check1.values.confirm.uncheckedItems}}', emptyPolicy: 'skip' }),
        n('img3', 'image-gen', { prompt: '{{loop3.item.prompt}}' }),
        n('saveImg3', 'save-asset', { content: '{{img3.images.0.path}}', kind: 'file', name: '{{loop3.item.name}}-v2' }),
        n('report1', 'report', { title: '清单', template: 'done {{loop3.results}}' }),
        n('end', 'end'),
      ],
      [
        ['start', 'merge1'],
        ['merge1', 'check1'],
        ['check1', 'condCheck', 'approve'],
        ['check1', 'end', 'reject'],
        ['condCheck', 'loop3', 'branch', 'regen'],
        ['condCheck', 'report1', 'branch', 'allOk'],
        ['loop3', 'img3', 'loop-body'],
        ['img3', 'saveImg3'],
        ['saveImg3', 'loop3', 'loop-back'],
        ['loop3', 'report1', 'loop-done'],
        ['report1', 'end'],
      ]
    )
    const { engine, runs, nodeRuns } = makeEngine()
    const status = await runWithUser('u1', () => engine.execute(input(graph)))
    expect(status).toBe('waiting_review')
    // 全部确认（unchecked 空数组）
    const applied = await runWithUser('u1', () =>
      engine.resumeReview('run_c', 'check1', {
        decision: 'approve_with_changes',
        editedValues: { confirm: { checked: ['a1', 'a2'], unchecked: [], uncheckedItems: [] } },
      } as never)
    )
    expect(applied).toBe(true)
    await wait(200)
    expect(runs.final.status).toBe('succeeded')
    // 无重生成
    expect(nodeRuns.rows.filter(r => r.nodeId === 'saveImg3' && r.status === 'succeeded').length).toBe(0)
    expect(nodeRuns.outputOf('report1').markdown).toContain('done')
  })
})
