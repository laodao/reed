/**
 * 领域学习「前置要求」纯规则测试（learning-prerequisites.rules）
 * @module tests/unit/core/packs/domain-learning/learning-prerequisites.rules.spec
 *
 * 用户需求（2026-09-12）：
 * 1. 增加**整个主题学习的前置要求**（含领域外需自备能力）；
 * 2. 增加**每个知识点学习的前置要求**（生成知识点时就声明）；
 * 3. 生成知识点时就要保证顺序循序渐进。
 *
 * 本 spec 用「深度学习」真实空间的形状钉死：规范化、快照简报、缺口检测、门槛覆盖判定。
 */

import { describe, it, expect } from 'vitest'
import {
  CONCEPT_PREREQ_MAX,
  SPACE_PREREQ_MAX,
  buildPrerequisiteBriefing,
  collectPrereqShortfalls,
  collectRelationGaps,
  coveredBySpacePrereqs,
  declaredPrereqsOf,
  matchPrereqName,
  normalizeConceptPrereqs,
  normalizeSpacePrereqs,
  prerequisiteNamesOf,
  wouldCreatePrereqCycle,
  type PrereqConcept,
  type PrereqRelation,
} from '@core/packs/domain-learning/rules/learning-prerequisites.rules'
import type { DlSpacePrereq } from '@shared/types/domain-learning.types'

const c = (id: string, name: string, prerequisites?: string[]): PrereqConcept => ({
  id,
  name,
  nodeType: 'concept',
  attrs: prerequisites ? { prerequisites } : null,
})

const edge = (source: string, target: string, type = 'prerequisite'): PrereqRelation => ({ source, target, type })

describe('normalizeSpacePrereqs（主题前置规范化）', () => {
  it('接受字符串数组、对象数组与 { items } 三种形态', () => {
    expect(normalizeSpacePrereqs(['Python 基础', '线性代数基础']).map((p) => p.name)).toEqual(['Python 基础', '线性代数基础'])
    expect(normalizeSpacePrereqs([{ name: 'Python 基础', why: '要写训练脚本' }])[0]).toEqual({
      name: 'Python 基础',
      why: '要写训练脚本',
    })
    expect(normalizeSpacePrereqs({ items: [{ name: '概率统计基础' }] }).map((p) => p.name)).toEqual(['概率统计基础'])
  })

  it('保留 why/level/inSpace，清洗空白与超长文本', () => {
    const [p] = normalizeSpacePrereqs([
      { name: '  线性代数基础 ', why: '  矩阵乘法  与转置用得到 ', level: '能算  (B,m)@(m,n)  即可', inSpace: true },
    ])
    expect(p).toMatchObject({
      name: '线性代数基础',
      why: '矩阵乘法 与转置用得到',
      level: '能算 (B,m)@(m,n) 即可',
      inSpace: true,
    })
  })

  it('去空名、按名去重（保留首条）、限条数', () => {
    const list = normalizeSpacePrereqs([{ name: 'A' }, { name: '  ' }, { name: 'A', why: '重复应丢弃' }, null, { name: 'B' }])
    expect(list.map((p) => p.name)).toEqual(['A', 'B'])
    expect(list[0].why).toBeUndefined()
    const many = normalizeSpacePrereqs(Array.from({ length: SPACE_PREREQ_MAX + 5 }, (_, i) => ({ name: `P${i}` })))
    expect(many).toHaveLength(SPACE_PREREQ_MAX)
  })

  it('非数组/undefined → 空数组（不抛错）', () => {
    expect(normalizeSpacePrereqs(undefined)).toEqual([])
    expect(normalizeSpacePrereqs('Python')).toEqual([])
    expect(normalizeSpacePrereqs({ items: 'x' })).toEqual([])
  })
})

describe('normalizeConceptPrereqs（知识点前置规范化）', () => {
  it('去空、去重、去掉自己、限条数', () => {
    expect(normalizeConceptPrereqs(['张量', ' 张量 ', '', '导数与链式法则'], '自动微分')).toEqual(['张量', '导数与链式法则'])
    expect(normalizeConceptPrereqs(['自动微分', '张量'], '自动微分')).toEqual(['张量'])
    const many = normalizeConceptPrereqs(Array.from({ length: CONCEPT_PREREQ_MAX + 3 }, (_, i) => `P${i}`))
    expect(many).toHaveLength(CONCEPT_PREREQ_MAX)
  })

  it('declaredPrereqsOf 从 attrs.prerequisites 读取', () => {
    expect(declaredPrereqsOf(c('k1', '自动微分', ['张量', '导数与链式法则']))).toEqual(['张量', '导数与链式法则'])
    expect(declaredPrereqsOf(c('k1', '张量'))).toEqual([])
  })
})

describe('prerequisiteNamesOf（关系边 + 声明互补）', () => {
  const concepts = [c('k-tensor', '张量'), c('k-deriv', '导数与链式法则'), c('k-ad', '自动微分', ['张量', '导数与链式法则'])]
  it('关系边为准，声明里多出来的算"仅声明未建关系"', () => {
    const r = prerequisiteNamesOf(concepts[2], concepts, [edge('k-tensor', 'k-ad')])
    expect(r.fromGraph).toEqual(['张量'])
    expect(r.declaredOnly).toEqual(['导数与链式法则'])
  })
  it('非 prerequisite 类型不算前置', () => {
    expect(prerequisiteNamesOf(concepts[2], concepts, [edge('k-tensor', 'k-ad', 'related')]).fromGraph).toEqual([])
  })
})

describe('matchPrereqName（前置名落点）', () => {
  const concepts = [c('k-tensor', '张量')]
  const space: DlSpacePrereq[] = [{ name: '线性代数基础' }, { name: 'Python 基础' }]
  it('同名/包含关系命中知识点、主题前置或缺失', () => {
    expect(matchPrereqName('张量', concepts, space)).toBe('concept')
    expect(matchPrereqName('线性代数基础', concepts, space)).toBe('space')
    expect(matchPrereqName('量子力学', concepts, space)).toBe('missing')
    expect(matchPrereqName('', concepts, space)).toBe('missing')
  })
})

describe('collectPrereqShortfalls / collectRelationGaps（缺口清单）', () => {
  const concepts = [
    c('k-tensor', '张量'),
    c('k-ad', '自动微分', ['张量', '导数与链式法则', 'Python 基础']),
    { id: 'g1', name: '深度学习·领域根', nodeType: 'group' },
  ]
  const relations = [edge('k-tensor', 'k-ad')]
  const space: DlSpacePrereq[] = [{ name: 'Python 基础', inSpace: false }]

  it('声明的"导数与链式法则"既无概念也无主题前置 → 缺口；Python 基础已在主题前置 → 不算缺口', () => {
    const short = collectPrereqShortfalls({ concepts, relations, spacePrereqs: space })
    expect(short).toHaveLength(1)
    expect(short[0]).toMatchObject({ conceptId: 'k-ad', conceptName: '自动微分' })
    expect(short[0].missing).toEqual(['导数与链式法则'])
  })

  it('group 目录不参与（不是可学知识点）', () => {
    const short = collectPrereqShortfalls({ concepts, relations, spacePrereqs: space })
    expect(short.some((s) => s.conceptId === 'g1')).toBe(false)
  })

  it('relationGaps：只有声明没有关系边的前置', () => {
    const gaps = collectRelationGaps({ concepts, relations })
    expect(gaps).toHaveLength(1)
    expect(gaps[0].pending).toEqual(['导数与链式法则', 'Python 基础'])
  })
})

describe('buildPrerequisiteBriefing（快照简报：让模型每轮看到门槛与顺序）', () => {
  it('主题前置为空时，明确要求用 dl_save_space_prereqs 落库', () => {
    const lines = buildPrerequisiteBriefing({ concepts: [], relations: [] })
    expect(lines[0]).toContain('主题前置要求')
    expect(lines[0]).toContain('dl_save_space_prereqs')
    expect(lines.join('\n')).toContain('各知识点前置')
    expect(lines.join('\n')).toContain('循序渐进')
  })

  it('有主题前置时逐条列出，并标注空间内/需自备', () => {
    const lines = buildPrerequisiteBriefing({
      spacePrereqs: [
        { name: '线性代数基础', why: '矩阵乘法与转置', inSpace: true },
        { name: 'Python 基础', level: '能用 NumPy 索引', inSpace: false },
      ],
      concepts: [],
      relations: [],
    })
    const text = lines.join('\n')
    expect(text).toContain('线性代数基础')
    expect(text).toContain('空间内已建知识点')
    expect(text).toContain('Python 基础')
    expect(text).toContain('需自备/另行补课')
  })

  it('列出各知识点前置（关系已建 / 仅声明），并提示补关系、补落点', () => {
    const lines = buildPrerequisiteBriefing({
      spacePrereqs: [{ name: 'Python 基础' }],
      concepts: [c('k-tensor', '张量'), c('k-ad', '自动微分', ['张量', '导数与链式法则'])],
      relations: [edge('k-tensor', 'k-ad')],
    })
    const text = lines.join('\n')
    expect(text).toContain('【各知识点前置】')
    expect(text).toContain('自动微分 ← 已建关系：张量 ；仅声明未建关系：导数与链式法则')
    expect(text).toContain('dl_save_relation')
    expect(text).toContain('导数与链式法则')
    expect(text).toContain('dl_save_concept')
  })
})

describe('coveredBySpacePrereqs（门禁用：主题前置已明示门槛）', () => {
  it('主题前置里声明过该能力 → 视为已覆盖', () => {
    const space: DlSpacePrereq[] = [{ name: '线性代数基础' }, { name: '导数与链式法则' }]
    expect(coveredBySpacePrereqs('线性代数（矩阵/向量运算）', ['线性代数', '矩阵'], space)).toBe(true)
    expect(coveredBySpacePrereqs('导数与链式法则', ['导数', '链式法则'], space)).toBe(true)
    expect(coveredBySpacePrereqs('积分', ['积分'], space)).toBe(false)
    expect(coveredBySpacePrereqs('积分', ['积分'], [])).toBe(false)
  })
})

describe('wouldCreatePrereqCycle（2026-09-25 P0-1：建边防环）', () => {
  it('空图/无环图上加边 → 不拦', () => {
    expect(wouldCreatePrereqCycle([], 'a', 'b')).toBe(false)
    const chain = [edge('a', 'b'), edge('b', 'c')]
    expect(wouldCreatePrereqCycle(chain, 'a', 'c')).toBe(false)
  })

  it('直接互指 A→B 已存在，再建 B→A → 拦', () => {
    const rels = [edge('a', 'b')]
    expect(wouldCreatePrereqCycle(rels, 'b', 'a')).toBe(true)
  })

  it('三层链闭合 A→B→C 已存在，再建 C→A → 拦（环可经任意长度传导）', () => {
    const rels = [edge('a', 'b'), edge('b', 'c')]
    expect(wouldCreatePrereqCycle(rels, 'c', 'a')).toBe(true)
  })

  it('同链非闭合方向（A→C，A 是 C 的祖先方向）→ 放行', () => {
    const rels = [edge('a', 'b'), edge('b', 'c')]
    expect(wouldCreatePrereqCycle(rels, 'a', 'c')).toBe(false)
  })

  it('非 prerequisite 类型的边不参与判定', () => {
    const rels = [edge('a', 'b', 'related')]
    expect(wouldCreatePrereqCycle(rels, 'b', 'a')).toBe(false)
  })
})
