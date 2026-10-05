/**
 * 地图完整度诊断测试（assessMapCoverage）
 * @module tests/unit/core/packs/domain-learning/learning-map-coverage.rules.spec
 *
 * 用户反馈（2026-09-12）：「知识体系我认为不够完善」。
 * 本 spec 用**真机库里的深度学习空间形状**（8 个知识点 / 9 条前置边 / 1 份讲义 / 只有领域根目录）
 * 作为回归基线，钉死诊断能把这些结构问题逐条点出来，并给出可比较的评分；
 * 同时钉死"完整地图不给假缺口"（避免模型被无意义缺口带跑偏）。
 */

import { describe, it, expect } from 'vitest'
import {
  assessMapCoverage,
  detectPrereqCycles,
  levelsOf,
  mapCoverageBriefing,
  reachableFrom,
  type CoverageConcept,
  type CoverageRelation,
} from '@core/packs/domain-learning/rules/learning-map-coverage.rules'

const c = (id: string, name: string, extra: Partial<CoverageConcept> = {}): CoverageConcept => ({
  id,
  name,
  nodeType: 'concept',
  researchState: 'unresearched',
  cardId: null,
  attrs: null,
  ...extra,
})
const e = (source: string, target: string, verified = false): CoverageRelation => ({
  source,
  target,
  type: 'prerequisite',
  verified,
})

/** 真机库「深度学习」空间的形状（2026-09-12 实测） */
function deepLearningSpace(): { concepts: CoverageConcept[]; relations: CoverageRelation[] } {
  const concepts: CoverageConcept[] = [
    { id: 'g-root', name: '深度学习·领域根', nodeType: 'group' },
    c('k-tensor', '张量', { cardId: 'card-1', researchState: 'extracted' }),
    c('k-deriv', '导数与链式法则', { researchState: 'extracted' }),
    c('k-partial', '偏导数与梯度', { researchState: 'extracted' }),
    c('k-ad', '自动微分与反向传播', { researchState: 'extracted' }),
    c('k-mlp', '多层感知机与激活函数', { researchState: 'extracted' }),
    c('k-gd', '梯度下降与优化器', { researchState: 'extracted' }),
    c('k-cnn', '卷积神经网络', { researchState: 'extracted' }),
    c('k-tf', '注意力机制与 Transformer', { researchState: 'extracted' }),
  ]
  const relations: CoverageRelation[] = [
    e('k-deriv', 'k-partial'),
    e('k-tensor', 'k-partial'),
    e('k-deriv', 'k-ad'),
    e('k-tensor', 'k-ad'),
    e('k-partial', 'k-ad'),
    e('k-ad', 'k-mlp'),
    e('k-ad', 'k-gd'),
    e('k-mlp', 'k-cnn'),
    e('k-mlp', 'k-tf'),
  ]
  return { concepts, relations }
}

describe('levelsOf / reachableFrom（图算法）', () => {
  it('levels：入口=0，最长前置链决定层级', () => {
    const lv = levelsOf(
      ['a', 'b', 'c', 'd'],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'a', target: 'c' },
        { source: 'c', target: 'd' },
      ],
    )
    expect(lv.get('a')).toBe(0)
    expect(lv.get('b')).toBe(1)
    expect(lv.get('c')).toBe(2)
    expect(lv.get('d')).toBe(3)
  })

  it('levels：环不炸（保守取 0 不递归）', () => {
    const lv = levelsOf(['a', 'b'], [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }])
    expect(lv.get('a')).toBeGreaterThanOrEqual(0)
    expect(lv.get('b')).toBeGreaterThanOrEqual(0)
  })

  it('reachableFrom：从无前置的入口出发能到达全部 → 全可达', () => {
    const { concepts, relations } = deepLearningSpace()
    const ids = concepts.filter((x) => x.nodeType !== 'group').map((x) => x.id)
    const reach = reachableFrom(ids, relations.map((r) => ({ source: r.source, target: r.target })))
    expect(ids.every((id) => reach.has(id))).toBe(true)
  })

  it('reachableFrom：独立子图各自有入口 → 都可达；前置漏建的节点不可达', () => {
    const reach = reachableFrom(
      ['a', 'b', 'x', 'y'],
      [{ source: 'a', target: 'b' }, { source: 'x', target: 'y' }],
    )
    expect(reach.has('a')).toBe(true)
    expect(reach.has('b')).toBe(true)
    expect(reach.has('x')).toBe(true) // x 自身无前置 → 也是入口
    expect(reach.has('y')).toBe(true)
    // 前置漏建（边的来源不在概念集合里）→ 该节点不是入口，从任何入口都到不了
    const reach2 = reachableFrom(['a', 'b', 'y'], [{ source: 'a', target: 'b' }, { source: 'ghost', target: 'y' }])
    expect(reach2.has('y')).toBe(false)
  })
})

describe('assessMapCoverage：真机深度学习空间（体系不完善的基线）', () => {
  const { concepts, relations } = deepLearningSpace()
  const r = assessMapCoverage({ concepts, relations, spacePrereqs: [] })

  it('指标正确（8 知识点 / 9 边 / 5 层 / 1 份讲义 / 1 个目录）', () => {
    expect(r.metrics).toMatchObject({ leaves: 8, groups: 1, edges: 9, verifiedEdges: 0, lessons: 1, levels: 5 })
    expect(r.metrics.entries).toBe(2) // 张量、导数与链式法则
  })

  it('点出"多起点直接汇入"（张量+导数→自动微分，缺中间台阶）', () => {
    const funnel = r.gaps.find((g) => g.kind === 'funnel')
    expect(funnel).toBeTruthy()
    expect(funnel!.conceptNames).toContain('自动微分与反向传播')
    expect(funnel!.message).toContain('缺过渡台阶')
  })

  it('点出讲义交付率（1/8 有讲义）与目录结构（只有领域根）', () => {
    expect(r.gaps.map((g) => g.kind)).toContain('no-lesson')
    expect(r.gaps.find((g) => g.kind === 'no-lesson')!.message).toContain('7/8')
    expect(r.gaps.map((g) => g.kind)).toContain('flat-branches')
  })

  it('点出主题前置未声明', () => {
    expect(r.gaps.map((g) => g.kind)).toContain('no-space-prereq')
  })

  it('评分明显低于满分且摘要可读（含分数/规模/层数/缺口数）', () => {
    expect(r.score).toBeGreaterThan(0)
    expect(r.score).toBeLessThan(75)
    expect(r.summary).toContain(`地图完整度 ${r.score}/100`)
    expect(r.summary).toContain('知识点 8')
    expect(r.summary).toContain('学习路径 5 层')
    expect(r.summary).toContain('已建讲义 1/8')
  })

  it('可达性/入口正常时**不**报这两类缺口（不给假缺口）', () => {
    const kinds = r.gaps.map((g) => g.kind)
    expect(kinds).not.toContain('no-entry')
    expect(kinds).not.toContain('unreachable')
    expect(kinds).not.toContain('flat-trunk') // 5 层，是台阶式
  })
})

describe('assessMapCoverage：其它缺口判定', () => {
  it('无入口 → no-entry（high）', () => {
    const r = assessMapCoverage({
      concepts: [c('a', '甲'), c('b', '乙')],
      relations: [e('a', 'b'), e('b', 'a')],
      spacePrereqs: [{ name: 'X' }],
    })
    expect(r.gaps.map((g) => g.kind)).toContain('no-entry')
  })

  it('前置漏建导致不可达 → unreachable 并点名概念', () => {
    const r = assessMapCoverage({
      concepts: [c('a', '甲'), c('b', '乙'), c('z', '孤立概念')],
      relations: [e('a', 'b'), e('missing', 'z')],
      spacePrereqs: [{ name: 'X' }],
    })
    const gap = r.gaps.find((g) => g.kind === 'unreachable')
    expect(gap).toBeTruthy()
    expect(gap!.conceptNames).toContain('孤立概念')
  })

  it('平铺一层（层数<3 且叶≥5）→ flat-trunk（high）', () => {
    const concepts = ['甲', '乙', '丙', '丁', '戊', '己'].map((n, i) => c(`k${i}`, n))
    const r = assessMapCoverage({ concepts, relations: [], spacePrereqs: [{ name: 'X' }] })
    expect(r.gaps.map((g) => g.kind)).toContain('flat-trunk')
  })

  it('声明未落边 → declared-only（点名 概念（前置））', () => {
    const r = assessMapCoverage({
      concepts: [c('a', '张量'), c('b', '自动微分', { attrs: { prerequisites: ['张量', '导数与链式法则'] } })],
      relations: [e('a', 'b')],
      spacePrereqs: [{ name: 'X' }],
    })
    const gap = r.gaps.find((g) => g.kind === 'declared-only')
    expect(gap).toBeTruthy()
    expect(gap!.conceptNames?.[0]).toContain('导数与链式法则')
  })

  it('粒度太粗（把整个空间名当知识点 / 领域级词 / 超长名）→ coarse', () => {
    const r = assessMapCoverage({
      spaceName: '深度学习',
      concepts: [
        c('a', '深度学习'), // 与空间名同名 → 整块领域当知识点
        c('b', '张量'),
        c('long', '一个非常长的概念名直接当成了一句话'),
        c('d', '自动微分'),
        c('e', '知识体系'), // 领域级词
      ],
      relations: [e('b', 'd')],
      spacePrereqs: [{ name: 'X' }],
    })
    const gap = r.gaps.find((g) => g.kind === 'coarse')
    expect(gap).toBeTruthy()
    expect(gap!.conceptNames).toEqual(expect.arrayContaining(['深度学习', '知识体系']))
    // 合法的基础概念命名不应被误伤
    expect(gap!.conceptNames).not.toContain('张量')
    const legit = assessMapCoverage({
      spaceName: '深度学习',
      concepts: [c('a', '线性代数基础'), c('b', 'Python 基础')],
      relations: [],
      spacePrereqs: [{ name: 'X' }],
    })
    expect(legit.gaps.map((g) => g.kind)).not.toContain('coarse')
  })

  it('空空间 → 0 分且摘要说明原因（不抛错）', () => {
    const r = assessMapCoverage({ concepts: [], relations: [] })
    expect(r.score).toBe(0)
    expect(r.metrics.leaves).toBe(0)
    expect(r.summary).toContain('还没有任何知识点')
  })
})

describe('mapCoverageBriefing（注入提示词的简报）', () => {
  it('空地图：只给一行结论（不列缺口明细）', () => {
    const lines = mapCoverageBriefing(assessMapCoverage({ concepts: [], relations: [] }))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('还没有任何知识点')
  })

  it('有缺口：high 在前，带涉及概念；行数受 maxGaps 限制', () => {
    const lines = mapCoverageBriefing(
      assessMapCoverage({
        concepts: [c('a', '甲'), c('b', '乙'), c('z', '孤立')],
        relations: [e('a', 'b'), e('ghost', 'z')],
        spacePrereqs: [],
      }),
      2,
    )
    const text = lines.join('\n')
    expect(text).toContain('【地图完整度】')
    expect(text).toContain('缺口清单')
    expect(text).toContain('[high]')
    // 只列 2 条明细
    expect(lines.filter((l) => l.startsWith('  · '))).toHaveLength(2)
  })

  it('无缺口：给"未发现结构性缺口"而不是空清单', () => {
    const lines = mapCoverageBriefing(
      assessMapCoverage({
        concepts: [
          c('a', '线性代数基础', { cardId: 'k1' }),
          c('b', '导数与链式法则', { cardId: 'k2' }),
          c('d', '张量', { cardId: 'k3' }),
          c('e', '自动微分', { cardId: 'k4' }),
          c('f', '多层感知机', { cardId: 'k5' }),
        ],
        relations: [e('a', 'd', true), e('b', 'd', true), e('d', 'e', true), e('e', 'f', true), e('b', 'e', true)],
        spacePrereqs: [{ name: 'Python 基础' }],
      }),
    )
    const text = lines.join('\n')
    expect(text).toContain('未发现结构性缺口')
  })
})

describe('assessMapCoverage：完整地图得分高（回归防误报）', () => {
  it('台阶充足 + 前置边齐 + 讲义齐 + 目录分组 + 主题前置已声明 → 高分且无 high 缺口', () => {
    const concepts: CoverageConcept[] = [
      { id: 'g-root', name: '领域根', nodeType: 'group' },
      { id: 'g-a', name: '基础层', nodeType: 'group', parentId: 'g-root' },
      { id: 'g-b', name: '核心层', nodeType: 'group', parentId: 'g-root' },
      c('a1', '线性代数基础', { cardId: 'c1', researchState: 'extracted', parentId: 'g-a' }),
      c('a2', '导数与链式法则', { cardId: 'c2', researchState: 'extracted', parentId: 'g-a' }),
      c('b1', '张量', { cardId: 'c3', researchState: 'extracted', parentId: 'g-b' }),
      c('b2', '自动微分与反向传播', { cardId: 'c4', researchState: 'extracted', parentId: 'g-b' }),
      c('b3', '多层感知机', { cardId: 'c5', researchState: 'extracted', parentId: 'g-b' }),
      c('b4', 'Transformer', { cardId: 'c6', researchState: 'extracted', parentId: 'g-b' }),
    ]
    const relations: CoverageRelation[] = [
      e('a1', 'b1', true),
      e('a2', 'b1', true),
      e('b1', 'b2', true),
      e('a2', 'b2', true),
      e('b2', 'b3', true),
      e('b3', 'b4', true),
    ]
    const r = assessMapCoverage({
      concepts,
      relations,
      spacePrereqs: [{ name: 'Python 基础', inSpace: false }],
    })
    expect(r.metrics.levels).toBeGreaterThanOrEqual(3)
    expect(r.gaps.filter((g) => g.severity === 'high')).toEqual([])
    expect(r.score).toBeGreaterThanOrEqual(90)
    expect(r.gaps.map((g) => g.kind)).not.toContain('no-lesson')
    expect(r.gaps.map((g) => g.kind)).not.toContain('flat-branches')
  })
})

describe('detectPrereqCycles / cycle 缺口（2026-09-25 P0-1 配套：存量环诊断）', () => {
  it('无环图 → 空列表', () => {
    const { relations } = deepLearningSpace()
    const ids = relations.flatMap((r) => [r.source, r.target])
    expect(detectPrereqCycles([...new Set(ids)], relations)).toEqual([])
  })

  it('二成员环 A→B→A → 两个成员都被点名', () => {
    const ids = ['a', 'b']
    const edges = [e('a', 'b'), e('b', 'a')]
    expect(detectPrereqCycles(ids, edges).sort()).toEqual(['a', 'b'])
  })

  it('三成员环 + 环外节点 → 只点环上三个', () => {
    const ids = ['a', 'b', 'c', 'd']
    const edges = [e('a', 'b'), e('b', 'c'), e('c', 'a'), e('c', 'd')]
    expect(detectPrereqCycles(ids, edges).sort()).toEqual(['a', 'b', 'c'])
  })

  it('assessMapCoverage：成环 → cycle 缺口（high，重扣分），简报点名成员与修复入口', () => {
    const concepts = [c('a', '极限'), c('b', '导数'), c('d', '微分方程')]
    const relations = [e('a', 'b'), e('b', 'd'), e('d', 'a')]
    const r = assessMapCoverage({ concepts, relations, spacePrereqs: [{ name: '四则运算' }] })
    const gap = r.gaps.find((g) => g.kind === 'cycle')
    expect(gap).toBeTruthy()
    expect(gap?.severity).toBe('high')
    expect(gap?.message).toContain('极限')
    expect(gap?.message).toContain('删除')
    const lines = mapCoverageBriefing(r).join('\n')
    expect(lines).toContain('[high]')
    expect(lines).toContain('成环')
  })
})
