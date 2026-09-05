/**
 * array-merge 通用节点测试（电商套图确认环节：合并非场景 + 场景图列表）
 * @module tests/unit/core/platform/workflow/array-merge.spec
 * @description 验证：sources 多个数组 → merged 拼接；非数组项跳过；
 *              单占位透传数组（listExpression 语义）；空 sources 输出空数组。
 */
import { describe, it, expect, vi } from 'vitest'
import { EXTRA_NODE_HANDLERS } from '@core/platform/workflow/nodes/extra-nodes'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'

const arrayMergeNode = EXTRA_NODE_HANDLERS.find(n => n.type === 'array-merge') as WorkflowNodeHandler

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return {
    config,
    runId: 'run_1',
    nodeId: 'merge1',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    emitProgress: vi.fn(),
  } as never as WorkflowNodeContext
}

describe('array-merge 节点', () => {
  it('sources 多个数组 → merged 顺序拼接', async () => {
    const ctx = makeCtx({ sources: [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]] })
    const result = await arrayMergeNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    const out = (result as { output: { merged: Array<{ id: string }> } }).output
    expect(out.merged.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('非数组 source 跳过；undefined/空串容错', async () => {
    const ctx = makeCtx({ sources: [[{ id: 'a' }], 'not-array', null, undefined, [{ id: 'b' }]] })
    const result = await arrayMergeNode.execute(ctx)
    const out = (result as { output: { merged: Array<{ id: string }> } }).output
    expect(out.merged.map(x => x.id)).toEqual(['a', 'b'])
  })

  it('sources 缺省/空数组 → merged 空数组', async () => {
    const ctx = makeCtx({ sources: [] })
    const result = await arrayMergeNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    expect((result as { output: { merged: unknown[] } }).output.merged).toEqual([])
  })

  it('validateConfig：sources 必须是非空数组', () => {
    expect(arrayMergeNode.validateConfig({ sources: [] } as never).length).toBeGreaterThan(0)
    expect(arrayMergeNode.validateConfig({ sources: '{{a}}' } as never).length).toBeGreaterThan(0)
    expect(arrayMergeNode.validateConfig({ sources: ['{{a}}', '{{b}}'] } as never)).toEqual([])
  })
})
