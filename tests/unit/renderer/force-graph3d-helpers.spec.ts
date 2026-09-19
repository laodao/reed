/**
 * 统一图谱能力 3D 引擎纯函数测试：邻接/度数/标签分级/缩放换算
 * @module tests/renderer/force-graph3d-helpers
 */
import { describe, it, expect } from 'vitest'
import {
  buildAdjacency,
  buildDegreeMap,
  selectLabeledNodes,
  distanceToZoomPercent,
  clampDollyDistance,
  DEFAULT_LABEL_ALL_THRESHOLD,
  DEFAULT_LABEL_HUB_MAX,
} from '@/components/common/force-graph3d.helpers'
import type { ForceGraphEdge, ForceGraphNode } from '@/components/common/force-graph.model'

const N = (ids: string[]): Array<Pick<ForceGraphNode, 'id'>> => ids.map(id => ({ id }))
const E = (pairs: Array<[string, string]>): ForceGraphEdge[] => pairs.map(([source, target]) => ({ source, target }))

describe('buildAdjacency 无向邻接表', () => {
  it('双向登记：a-b 边让双方互为邻居', () => {
    const adj = buildAdjacency(E([['a', 'b'], ['b', 'c']]))
    expect(adj.get('a')).toEqual(new Set(['b']))
    expect(adj.get('b')).toEqual(new Set(['a', 'c']))
    expect(adj.get('c')).toEqual(new Set(['b']))
  })

  it('孤立节点不在表中；空边返回空表', () => {
    expect(buildAdjacency([]).size).toBe(0)
    expect(buildAdjacency(E([['a', 'a']])).get('a')).toEqual(new Set(['a']))
  })
})

describe('buildDegreeMap 度数', () => {
  it('两端各计一次；hub 度数最高', () => {
    const deg = buildDegreeMap(E([['hub', 'a'], ['hub', 'b'], ['hub', 'c'], ['a', 'b']]))
    expect(deg.get('hub')).toBe(3)
    expect(deg.get('a')).toBe(2)
    expect(deg.get('c')).toBe(1)
  })
})

describe('selectLabeledNodes 标签分级', () => {
  it('节点数 ≤ 阈值 → 全部显示', () => {
    const labeled = selectLabeledNodes(N(['a', 'b', 'c']), E([['a', 'b']]))
    expect(labeled).toEqual(new Set(['a', 'b', 'c']))
  })

  it(`超阈值 → 焦点集 ∪ 度数 Top ${DEFAULT_LABEL_HUB_MAX} ∪ 孤立点；低度数普通点不显示`, () => {
    const ids = Array.from({ length: DEFAULT_LABEL_ALL_THRESHOLD + 10 }, (_, i) => `n${i}`)
    // n0 接 50 条边(枢纽),n1 接 1 条,n2..n4 各接 1 条,其余孤立
    const edges: ForceGraphEdge[] = ids.slice(2, 52).map(id => ({ source: 'n0', target: id }))
    edges.push({ source: 'n1', target: 'n0' }, { source: 'n2', target: 'n0' }, { source: 'n3', target: 'n0' }, { source: 'n4', target: 'n0' })
    const labeled = selectLabeledNodes(N(ids), edges, ['focus-x'])

    expect(labeled.has('n0')).toBe(true) // 枢纽
    expect(labeled.has('n1')).toBe(true) // 度数 1,进 Top40(有效度数节点少)
    expect(labeled.has('focus-x')).toBe(true) // 焦点集
    const isolated = ids.slice(52)
    for (const id of isolated) expect(labeled.has(id)).toBe(true) // 孤立点常显
  })

  it('超阈值且枢纽众多时：只保留度数最高的 hubMax 个,同度数按 id 升序', () => {
    const ids = Array.from({ length: DEFAULT_LABEL_ALL_THRESHOLD + 60 }, (_, i) => `n${String(i).padStart(3, '0')}`)
    // n000~n120 每个接 2 条边(度数 2,共 121 个候选 > hubMax=40)
    const edges: ForceGraphEdge[] = []
    for (let i = 0; i <= 120; i++) {
      edges.push({ source: `n${String(i).padStart(3, '0')}`, target: `leaf-a-${i}` })
      edges.push({ source: `n${String(i).padStart(3, '0')}`, target: `leaf-b-${i}` })
    }
    const all = [...ids, ...edges.flatMap(e => [e.source, e.target])]
    const unique = [...new Set(all)]
    const labeled = selectLabeledNodes(N(unique), edges)

    expect(labeled.has('n000')).toBe(true)
    expect(labeled.has('n039')).toBe(true)
    expect(labeled.has('n040')).toBe(false) // 只留前 40 个(id 升序)
    // 叶子节点度数 1,候选 242 个,不应进 Top40
    expect(labeled.has('leaf-a-0')).toBe(false)
  })

  it('focus 集合在超阈值下也显示(选中/悬停节点的邻居)', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `n${i}`)
    // 两两配对 → 全部度数 1,Top40 只有 id 最小的 40 个
    const edges = E(ids.reduce<Array<[string, string]>>((acc, _, i) => {
      if (i % 2 === 0) acc.push([ids[i], ids[i + 1]])
      return acc
    }, []))
    const labeled = selectLabeledNodes(N(ids), edges, ['n199', 'n1'])
    expect(labeled.has('n199')).toBe(true) // focus
    expect(labeled.has('n1')).toBe(true) // focus
    expect(labeled.has('n150')).toBe(false) // 度数 1 且不在 Top40
  })
})

describe('distanceToZoomPercent 相机距离换算', () => {
  it('基准距离 = 100%,越近百分比越高', () => {
    expect(distanceToZoomPercent(100, 100)).toBe(100)
    expect(distanceToZoomPercent(50, 100)).toBe(200)
    expect(distanceToZoomPercent(200, 100)).toBe(50)
  })

  it('非法输入兜底', () => {
    expect(distanceToZoomPercent(100, 0)).toBe(100)
    expect(distanceToZoomPercent(0, 100)).toBe(100 / 1e-6 * 100)
  })
})

describe('clampDollyDistance dolly 夹取', () => {
  it('factor>1 放大 = 距离缩短', () => {
    expect(clampDollyDistance(100, 1.2, 20, 500)).toBeCloseTo(100 / 1.2)
  })
  it('超出边界时夹取', () => {
    expect(clampDollyDistance(30, 1.2, 20, 500)).toBe(25)
    expect(clampDollyDistance(30, 1.2, 26, 500)).toBe(26)
    expect(clampDollyDistance(400, 1 / 1.2, 20, 500)).toBe(480)
    expect(clampDollyDistance(400, 1 / 1.2, 20, 460)).toBe(460)
  })
  it('factor=0/NaN 防御:距离不变', () => {
    expect(clampDollyDistance(100, 0, 20, 500)).toBe(100)
  })
})
