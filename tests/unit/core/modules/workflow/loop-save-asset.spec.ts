/**
 * loop 内 save-asset 引用 img 输出集成测试
 * @module tests/unit/core/modules/workflow/loop-save-asset.spec
 * @description 复现电商套图场景：loop 体内 image-gen(模拟) → save-asset(content=imgN.images.0.path)，
 *              验证 loop 作用域内跨节点变量引用是否解析正确。
 */
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngineService, type ExecuteRunInput } from '@core/modules/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/modules/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/modules/workflow/nodes/control-nodes'
import type { WorkflowEngineDeps, WorkflowEventPort, WorkflowNodeRunPort, WorkflowRunPort } from '@core/modules/workflow/engine/ports'
import type { WorkflowGraph, WorkflowNode } from '@shared/types/workflow.types'
import type { WorkflowNodeHandler } from '@core/modules/workflow/engine/node-handler'
import { runWithUser } from '@core/context/user-context'
import { registerPathProvider } from '@core/interfaces/path.interface'
import { tmpdir } from 'node:os'

// ==================== 假实现 ====================
class FakeRuns implements WorkflowRunPort {
  async patchRun(_id: string, _patch: Record<string, unknown>): Promise<void> {}
}
class FakeNodeRuns implements WorkflowNodeRunPort {
  rows = new Map<string, Record<string, unknown>>()
  async startNode(i: { nodeId: string; iterationIndex: number }): Promise<void> {
    this.rows.set(`${i.nodeId}|${i.iterationIndex}`, { ...i, status: 'running' })
  }
  async patchNode(_r: string, nodeId: string, iter: number, patch: Record<string, unknown>): Promise<void> {
    Object.assign(this.rows.get(`${nodeId}|${iter}`) ?? {}, patch)
  }
  statusOf(nodeId: string, iter = 0): unknown { return this.rows.get(`${nodeId}|${iter}`)?.status }
  outputOf(nodeId: string, iter = 0): Record<string, unknown> | undefined {
    return this.rows.get(`${nodeId}|${iter}`)?.output as Record<string, unknown> | undefined
  }
}
class FakeEvents implements WorkflowEventPort {
  emit(): void {}
}

/** 模拟 image-gen：输出 { images: [{ path: 'C:/x/img.png' }] } */
const fakeImg: WorkflowNodeHandler = {
  type: 'image-gen', controlKind: 'task', cancellable: false,
  outputSchema: [], validateConfig: () => [],
  async execute() {
    return { status: 'succeeded', output: { images: [{ path: 'C:/x/img.png', width: 512, height: 512 }] } }
  },
}
/** 捕获 save-asset 收到的 config */
const saveCalls: Array<Record<string, unknown>> = []
const fakeSave: WorkflowNodeHandler = {
  type: 'save-asset', controlKind: 'task', cancellable: false,
  outputSchema: [], validateConfig: () => [],
  async execute(ctx) {
    saveCalls.push({ ...ctx.config })
    return { status: 'succeeded', output: { assetId: 'a1' } }
  },
}

let seq = 0
function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, position: { x: 0, y: 0 }, config: config as never }
}
function g(nodes: WorkflowNode[], edges: Array<[string, string, string?]>): WorkflowGraph {
  return {
    version: 1, nodes,
    edges: edges.map(([s, t, k]) => ({ id: `e${seq++}`, sourceNodeId: s, targetNodeId: t, kind: (k ?? 'normal') as never })),
  }
}
function makeEngine() {
  const registry = createNodeRegistry([...CONTROL_NODE_HANDLERS, fakeImg, fakeSave])
  const engine = new WorkflowEngineService(
    { runs: new FakeRuns(), nodeRuns: new FakeNodeRuns(), events: new FakeEvents() } as WorkflowEngineDeps,
    registry
  )
  return engine
}

describe('loop 内跨节点变量引用（电商套图场景）', () => {
  it('save-asset 的 content={{img1.images.0.path}} 在 loop 内解析为文件路径', async () => {
    saveCalls.length = 0
    registerPathProvider(() => ({
      getDataPath: () => tmpdir(),
      getUserDataPath: () => tmpdir(),
      getAppDataPath: () => tmpdir(),
      getTempPath: () => tmpdir(),
      getSubDirectories: () => ({}) as never,
      getSubDirectoryPath: () => tmpdir(),
      toAssetUrl: (p: string) => 'local-image://' + p,
    }))
    const graph = g(
      [
        n('start', 'start'),
        n('loop1', 'loop', { listExpression: '{{start.shots}}' }),
        n('img1', 'image-gen'),
        n('saveImg', 'save-asset', { content: '{{img1.images.0.path}}', kind: 'file' }),
        n('end', 'end'),
      ],
      [
        ['start', 'loop1'],
        ['loop1', 'img1', 'loop-body'],
        ['img1', 'saveImg'],
        ['saveImg', 'loop1', 'loop-back'],
        ['loop1', 'end', 'loop-done'],
      ]
    )
    const engine = makeEngine()
    const status = await runWithUser('u1', () =>
      engine.execute({
        runId: 'run_1', userId: 'u1', definitionId: 'd1', graph,
        startInputs: { shots: [{ id: 1 }, { id: 2 }] },
      } as ExecuteRunInput)
    )
    expect(status).toBe('succeeded')
    expect(saveCalls.length).toBe(2)
    for (const c of saveCalls) {
      expect(c.content).toBe('C:/x/img.png')
    }
  })

  it('双 loop 串联（电商套图 v2：非场景 loop1 → loop-done → 场景 loop2）', async () => {
    saveCalls.length = 0
    registerPathProvider(() => ({
      getDataPath: () => tmpdir(),
      getUserDataPath: () => tmpdir(),
      getAppDataPath: () => tmpdir(),
      getTempPath: () => tmpdir(),
      getSubDirectories: () => ({}) as never,
      getSubDirectoryPath: () => tmpdir(),
      toAssetUrl: (p: string) => 'local-image://' + p,
    }))
    const graph = g(
      [
        n('start', 'start'),
        n('loop1', 'loop', { listExpression: '{{start.nonSceneShots}}' }),
        n('img1', 'image-gen'),
        n('saveImg1', 'save-asset', { content: '{{img1.images.0.path}}', kind: 'file', name: '{{loop1.item.posterType}}-{{loop1.index}}' }),
        n('loop2', 'loop', { listExpression: '{{start.scenes}}' }),
        n('img2', 'image-gen'),
        n('saveImg2', 'save-asset', { content: '{{img2.images.0.path}}', kind: 'file', name: '场景{{loop2.index}}-{{loop2.item.title}}' }),
        n('end', 'end'),
      ],
      [
        ['start', 'loop1'],
        ['loop1', 'img1', 'loop-body'],
        ['img1', 'saveImg1'],
        ['saveImg1', 'loop1', 'loop-back'],
        ['loop1', 'loop2', 'loop-done'],   // 串联：非场景 loop 完成后进入场景 loop
        ['loop2', 'img2', 'loop-body'],
        ['img2', 'saveImg2'],
        ['saveImg2', 'loop2', 'loop-back'],
        ['loop2', 'end', 'loop-done'],
      ]
    )
    const engine = makeEngine()
    const status = await runWithUser('u1', () =>
      engine.execute({
        runId: 'run_2', userId: 'u1', definitionId: 'd1', graph,
        startInputs: {
          nonSceneShots: [
            { posterType: 'main' },
            { posterType: 'promo' },
          ],
          scenes: [
            { title: '通勤时刻', desc: '地铁上' },
            { title: '居家客厅', desc: '沙发旁' },
            { title: '户外野餐', desc: '草地上' },
          ],
        },
      } as ExecuteRunInput)
    )
    expect(status).toBe('succeeded')
    // 非场景 2 张 + 场景 3 张
    expect(saveCalls.length).toBe(5)
    const names = saveCalls.map(c => c.name)
    expect(names).toContain('main-0')
    expect(names).toContain('promo-1')
    expect(names).toContain('场景2-户外野餐')
    expect(names).toContain('场景0-通勤时刻')
    expect(names).toContain('场景1-居家客厅')
  })
})
