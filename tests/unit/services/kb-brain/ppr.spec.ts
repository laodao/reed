/**
 * PPR 算法单测（平台层）
 */
import { describe, it, expect } from 'vitest'
import { personalizedPageRank } from '@core/platform/services/graph/ppr'

describe('personalizedPageRank', () => {
  const graph = {
    nodes: ['A', 'B', 'C', 'D'],
    edges: [
      ['A', 'B', 1],
      ['B', 'C', 1],
      ['C', 'A', 1],
      ['A', 'D', 1],
    ] as Array<[string, string, number]>,
  }

  it('种子节点得分最高，邻居按边权衰减', () => {
    const scores = personalizedPageRank(graph, new Map([['A', 1]]))
    expect(scores.get('A')!).toBeGreaterThan(scores.get('B')!)
    expect(scores.get('A')!).toBeGreaterThan(scores.get('C')!)
    expect(scores.get('A')!).toBeGreaterThan(scores.get('D')!)
    // B 与 D 的入边完全相同（都是 A 的 0.5 出力）→ 稳态分值数学必然相等
    expect(scores.get('B')!).toBeCloseTo(scores.get('D')!, 4)
    // C 收 B 的全部出力，得分高于 B（B 还要分给重启/出边后的路径）
  })

  it('多种子按权重分配', () => {
    const scores = personalizedPageRank(graph, new Map([['A', 3], ['B', 1]]))
    const scoresA = personalizedPageRank(graph, new Map([['A', 1]]))
    // B 作为种子时自身得分显著高于仅 A 为种子时
    expect(scores.get('B')!).toBeGreaterThan(scoresA.get('B')!)
  })

  it('空图/空种子安全', () => {
    expect(personalizedPageRank({ nodes: [], edges: [] }, new Map([['A', 1]])).size).toBe(0)
    expect(personalizedPageRank(graph, new Map()).size).toBe(0)
  })

  it('孤立节点（无出边）保留重启份额', () => {
    const g = { nodes: ['A', 'X'], edges: [] as Array<[string, string, number]> }
    const scores = personalizedPageRank(g, new Map([['A', 1], ['X', 1]]), { iterations: 5 })
    expect(scores.get('A')!).toBeCloseTo(0.5, 1)
    expect(scores.get('X')!).toBeCloseTo(0.5, 1)
  })

  it('权重 0 边被忽略；负权重防御', () => {
    const g = { nodes: ['A', 'B'], edges: [['A', 'B', 0], ['A', 'B', -1]] as Array<[string, string, number]> }
    const scores = personalizedPageRank(g, new Map([['A', 1]]))
    expect(scores.get('B') ?? 0).toBe(0) // 无有效出边 → B 不 receive
  })

  it('概率归一：总分≈1', () => {
    const scores = personalizedPageRank(graph, new Map([['C', 5]]))
    const total = [...scores.values()].reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(1, 2)
  })
})
