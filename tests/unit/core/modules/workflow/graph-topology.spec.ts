/**
 * 图拓扑工具测试：computeUpstreamSet（拓扑上游可达集合）
 * @module tests/workflow/graph-topology
 * @description 变量引用可达性校验的前置计算：从当前节点沿入边反向 BFS，
 *              loop-back 回边不参与（loop 节点不把循环体节点视为上游）
 */
import { describe, it, expect } from 'vitest'
import { computeUpstreamSet } from '@core/modules/workflow/engine/graph-topology'
import type { WorkflowEdge, WorkflowNode } from '@shared/types/workflow.types'

/** 构造节点表 */
function nodeMap(...ids: string[]): Map<string, WorkflowNode> {
  const m = new Map<string, WorkflowNode>()
  for (const id of ids) {
    m.set(id, { id, type: 'llm-chat', name: id, position: { x: 0, y: 0 }, config: {} } as WorkflowNode)
  }
  return m
}

/** 构造边 */
function edgesOf(list: Array<{ source: string; target: string; kind?: WorkflowEdge['kind'] }>): WorkflowEdge[] {
  return list.map((e, i) => ({ id: `e${i}`, sourceNodeId: e.source, targetNodeId: e.target, kind: e.kind ?? 'normal' }))
}

/** 默认边过滤：排除 loop-back（loop 节点不依赖 body 输出） */
const DEFAULT_FILTER = (e: WorkflowEdge) => e.kind !== 'loop-back'

describe('computeUpstreamSet 上游可达集合', () => {
  it('线性链：C 的上游是 A 和 B', () => {
    const nodes = nodeMap('start', 'a', 'b', 'c')
    const edges = edgesOf([
      { source: 'start', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ])
    const up = computeUpstreamSet('c', edges, DEFAULT_FILTER, nodes)
    expect([...up].sort()).toEqual(['a', 'b', 'start'])
  })

  it('B 的上游只有 A（不含自身）', () => {
    const nodes = nodeMap('start', 'a', 'b')
    const edges = edgesOf([
      { source: 'start', target: 'a' },
      { source: 'a', target: 'b' },
    ])
    const up = computeUpstreamSet('b', edges, DEFAULT_FILTER, nodes)
    expect([...up].sort()).toEqual(['a', 'start'])
  })

  it('分叉汇聚：D 的上游含 A/B/C（多入边全收）', () => {
    const nodes = nodeMap('start', 'a', 'b', 'c', 'd')
    const edges = edgesOf([
      { source: 'start', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'd' },
      { source: 'c', target: 'd' },
    ])
    const up = computeUpstreamSet('d', edges, DEFAULT_FILTER, nodes)
    expect([...up].sort()).toEqual(['a', 'b', 'c', 'start'])
  })

  it('loop-back 回边不参与：loop 节点的上游不含 body 节点', () => {
    const nodes = nodeMap('start', 'loop', 'body', 'after')
    const edges = edgesOf([
      { source: 'start', target: 'loop' },
      { source: 'loop', target: 'body', kind: 'loop-body' },
      { source: 'body', target: 'loop', kind: 'loop-back' },
      { source: 'loop', target: 'after', kind: 'loop-done' },
    ])
    const upLoop = computeUpstreamSet('loop', edges, DEFAULT_FILTER, nodes)
    expect(upLoop.has('body')).toBe(false) // body 不算 loop 上游
    expect(upLoop.has('start')).toBe(true)

    // body 节点经 loop-body 边找到 loop（loop 是 body 上游）
    const upBody = computeUpstreamSet('body', edges, DEFAULT_FILTER, nodes)
    expect(upBody.has('loop')).toBe(true)
    expect(upBody.has('start')).toBe(true)
  })

  it('环（无 loop-back）：环内节点互为上游（反向可达）', () => {
    const nodes = nodeMap('start', 'x', 'y')
    const edges = edgesOf([
      { source: 'start', target: 'x' },
      { source: 'x', target: 'y' },
      { source: 'y', target: 'x' },
    ])
    const upX = computeUpstreamSet('x', edges, DEFAULT_FILTER, nodes)
    expect(upX.has('y')).toBe(true)
    expect(upX.has('start')).toBe(true)
  })

  it('起点节点（无入边）上游为空', () => {
    const nodes = nodeMap('start', 'a')
    const edges = edgesOf([{ source: 'start', target: 'a' }])
    const up = computeUpstreamSet('start', edges, DEFAULT_FILTER, nodes)
    expect(up.size).toBe(0)
  })
})
