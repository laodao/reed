import { describe, it, expect } from 'vitest'
import { computeHighlight, EDGE_HIGHLIGHT_STYLE } from '@/utils/workflow-editor-highlight'

const EDGES = [
  { id: 'e1', source: 'a', target: 'b' },
  { id: 'e2', source: 'b', target: 'c' },
  { id: 'e3', source: 'd', target: 'c' },
]

describe('computeHighlight 选中高亮计算', () => {
  it('无选中时返回空集合', () => {
    expect(computeHighlight(null, EDGES)).toEqual({ nodeIds: [], edgeIds: [] })
  })

  it('选中节点：包含相连边与另一端的节点', () => {
    const r = computeHighlight({ kind: 'node', nodeId: 'b' }, EDGES)
    expect(r.edgeIds.sort()).toEqual(['e1', 'e2'])
    expect(r.nodeIds.sort()).toEqual(['a', 'c'])
  })

  it('选中节点：节点自身不加入高亮集合', () => {
    const r = computeHighlight({ kind: 'node', nodeId: 'a' }, EDGES)
    expect(r.nodeIds).toEqual(['b'])
    expect(r.edgeIds).toEqual(['e1'])
  })

  it('选中节点：孤立/不存在的节点无关联元素', () => {
    expect(computeHighlight({ kind: 'node', nodeId: 'x' }, EDGES)).toEqual({ nodeIds: [], edgeIds: [] })
  })

  it('选中边：包含边自身与两端节点', () => {
    const r = computeHighlight({ kind: 'edge', edgeId: 'e2', source: 'b', target: 'c' }, EDGES)
    expect(r.edgeIds).toEqual(['e2'])
    expect(r.nodeIds.sort()).toEqual(['b', 'c'])
  })

  it('选中边：两端节点即使相同也各算一次（自环边）', () => {
    const r = computeHighlight({ kind: 'edge', edgeId: 'e1', source: 'n', target: 'n' }, EDGES)
    expect(r.edgeIds).toEqual(['e1'])
    expect(r.nodeIds).toEqual(['n'])
  })

  it('输出顺序稳定：按边遍历顺序、节点去重', () => {
    const edges = [
      { id: 'e1', source: 'n', target: 'x' },
      { id: 'e2', source: 'n', target: 'y' },
      { id: 'e3', source: 'x', target: 'n' },
    ]
    const r = computeHighlight({ kind: 'node', nodeId: 'n' }, edges)
    expect(r.edgeIds).toEqual(['e1', 'e2', 'e3'])
    expect(r.nodeIds).toEqual(['x', 'y'])
    expect(new Set(r.nodeIds).size).toBe(r.nodeIds.length)
  })

  it('多出边时另一端点不重复加入', () => {
    const edges = [
      { id: 'e1', source: 'n', target: 'x' },
      { id: 'e2', source: 'x', target: 'n' },
    ]
    const r = computeHighlight({ kind: 'node', nodeId: 'n' }, edges)
    expect(r.nodeIds).toEqual(['x'])
    expect(r.edgeIds).toEqual(['e1', 'e2'])
  })
})

describe('EDGE_HIGHLIGHT_STYLE 边高亮样式', () => {
  it('使用醒目强调色并加粗', () => {
    expect(EDGE_HIGHLIGHT_STYLE.stroke).toBe('#f59e0b')
    expect(EDGE_HIGHLIGHT_STYLE.strokeWidth).toBe(3)
  })
})
