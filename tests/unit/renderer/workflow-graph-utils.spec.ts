/**
 * 前端工作流图工具测试：computeUpstreamNodeIds（变量选择器上游过滤）
 * @module tests/renderer/workflow-graph-utils
 */
import { describe, it, expect } from 'vitest'
import { computeUpstreamNodeIds } from '@/utils/workflow-graph-utils'

const E = (
  list: Array<{ source: string; target: string; kind?: string }>
): Array<{ source: string; target: string; kind: string }> =>
  list.map(e => ({ source: e.source, target: e.target, kind: e.kind ?? 'normal' }))

describe('computeUpstreamNodeIds 上游可达节点', () => {
  it('线性链：C 上游为 start/A/B，不含自身', () => {
    const edges = E([
      { source: 'start', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ])
    const up = computeUpstreamNodeIds('c', edges)
    expect([...up].sort()).toEqual(['a', 'b', 'start'])
  })

  it('并行支线：D 上游含 A/B/C（另一条支线的节点也在内）', () => {
    const edges = E([
      { source: 'start', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'd' },
      { source: 'c', target: 'd' },
    ])
    const up = computeUpstreamNodeIds('d', edges)
    expect([...up].sort()).toEqual(['a', 'b', 'c', 'start'])
  })

  it('loop-back 回边不参与：loop 上游不含 body 节点', () => {
    const edges = E([
      { source: 'start', target: 'loop' },
      { source: 'loop', target: 'body', kind: 'loop-body' },
      { source: 'body', target: 'loop', kind: 'loop-back' },
      { source: 'loop', target: 'after', kind: 'loop-done' },
    ])
    expect(computeUpstreamNodeIds('loop', edges).has('body')).toBe(false)
    expect(computeUpstreamNodeIds('body', edges).has('loop')).toBe(true)
  })

  it('无入边的节点上游为空', () => {
    const edges = E([{ source: 'start', target: 'a' }])
    expect(computeUpstreamNodeIds('start', edges).size).toBe(0)
  })

  it('kind 缺失时按 normal 处理（不跳过）', () => {
    const edges = E([{ source: 'start', target: 'a' }])
    expect(computeUpstreamNodeIds('a', edges).has('start')).toBe(true)
  })
})
