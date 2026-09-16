/**
 * 方案确认规则测试（learning-plan.rules）
 * @module tests/unit/core/packs/domain-learning/learning-plan.rules.spec
 *
 * 背景（2026-09-13 用户需求）：首批知识生成要先对齐诉求、再确认知识体系，用户确认后才落库。
 * 本用例钉死规范化/校验口径（尤其是"空分支"——上一版「投资与配置」就是空的）与额度派生。
 */

import { describe, it, expect } from 'vitest'
import {
  normalizePlanUnderstanding,
  normalizePlanSyllabus,
  planNodeNames,
  planConceptNames,
  planHasConcept,
  planSaveBudget,
  countPlanNodes,
  summarizePlanSyllabus,
} from '@core/packs/domain-learning/rules/learning-plan.rules'
import { DL_PLANNING_SAVE_BUDGET, DL_SAVE_BUDGET_MAX } from '@core/packs/domain-learning/services/dl-agent.types'

const UNDERSTANDING = {
  goalSummary: '他想搞懂金融产品与市场，能听懂并自己看数据',
  coverage: ['股票', '债券', '期货', '美元汇率', '财报阅读', '行情数据'],
  audience: '零基础，但会算百分比',
  notDoing: ['个人记账', '保险推销'],
  keyExpectations: ['能说出各类产品的收益来源', '能读懂一份财报的关键科目'],
}

const SYLLABUS = {
  branches: [
    {
      name: '金融产品',
      definitionShort: '各类可交易/可持有的金融工具',
      concepts: [
        { name: '股票', definitionShort: '公司所有权凭证', layer: 0, prerequisites: [] },
        { name: '债券', definitionShort: '债权凭证', layer: 0, prerequisites: [] },
      ],
    },
    {
      name: '市场与价格',
      concepts: [{ name: '汇率与美元', layer: 1, prerequisites: ['股票'] }],
    },
  ],
}

describe('normalizePlanUnderstanding', () => {
  it('正常输入：清洗空白、去重、补默认字段', () => {
    const r = normalizePlanUnderstanding({
      ...UNDERSTANDING,
      coverage: ['  股票 ', '股票', '', '债券'],
      notDoing: ['个人记账', '个人记账'],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.coverage).toEqual(['股票', '债券'])
    expect(r.value.notDoing).toEqual(['个人记账'])
    expect(r.value.keyExpectations).toHaveLength(2)
  })

  it('缺 goalSummary → 拒绝（模型没复述诉求，用户无从确认）', () => {
    const r = normalizePlanUnderstanding({ coverage: ['股票'] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('goalSummary')
  })

  it('缺 coverage → 拒绝，并说明这正是上一版跑偏的原因', () => {
    const r = normalizePlanUnderstanding({ goalSummary: '学金融' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('coverage')
    expect(r.reason).toContain('股票')
  })
})

describe('normalizePlanSyllabus', () => {
  it('正常输入：保留分支/知识点/前置/layer，派生节点名', () => {
    const r = normalizePlanSyllabus(SYLLABUS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(planNodeNames(r.value)).toEqual(['金融产品', '股票', '债券', '市场与价格', '汇率与美元'])
    expect(planConceptNames(r.value)).toEqual(['股票', '债券', '汇率与美元'])
    expect(countPlanNodes(r.value)).toBe(5)
    expect(summarizePlanSyllabus(r.value)).toBe('2 个分支 / 3 个知识点')
  })

  it('空分支 → 拒绝（复现上一版「投资与配置」没有子知识点的问题）', () => {
    const r = normalizePlanSyllabus({
      branches: [
        { name: '金融产品', concepts: [{ name: '股票' }] },
        { name: '投资与配置', concepts: [] },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('投资与配置')
    expect(r.reason).toContain('空分支')
  })

  it('没有任何分支 → 拒绝；分支无名 → 拒绝', () => {
    expect(normalizePlanSyllabus({ branches: [] }).ok).toBe(false)
    const noName = normalizePlanSyllabus({ branches: [{ concepts: [{ name: '股票' }] }] })
    expect(noName.ok).toBe(false)
    if (noName.ok) return
    expect(noName.reason).toContain('name')
  })

  it('跨分支重名知识点 → 去重并记入 changes（不静默丢内容）', () => {
    const r = normalizePlanSyllabus({
      branches: [
        { name: 'A', concepts: [{ name: '股票' }] },
        { name: 'B', concepts: [{ name: '股票' }, { name: '债券' }] },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(planConceptNames(r.value)).toEqual(['股票', '债券'])
    expect(r.changes.some((c) => c.includes('股票'))).toBe(true)
  })

  it('根层知识点与分支并列；layer 非法值归 0', () => {
    const r = normalizePlanSyllabus({
      ...SYLLABUS,
      rootConcepts: [{ name: '金融体系总览', layer: -3 }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(planConceptNames(r.value)).toContain('金融体系总览')
    expect(r.value.rootConcepts?.[0].layer).toBe(0)
  })
})

describe('planHasConcept / planSaveBudget', () => {
  it('planHasConcept：按名精确比对（两侧 trim）', () => {
    const r = normalizePlanSyllabus(SYLLABUS)
    if (!r.ok) throw new Error('fixture 不合法')
    expect(planHasConcept(r.value, '股票')).toBe(true)
    expect(planHasConcept(r.value, ' 股票 ')).toBe(true)
    expect(planHasConcept(r.value, '股票期权')).toBe(false)
    expect(planHasConcept(null, '股票')).toBe(false)
  })

  it('额度按方案条目数放宽，且不低于默认规划额度、不超过硬上限', () => {
    const small = planSaveBudget({ branches: [{ name: 'A', concepts: [{ name: 'a' }] }] })
    expect(small.concepts).toBe(DL_PLANNING_SAVE_BUDGET.concepts)
    expect(small.relations).toBe(DL_PLANNING_SAVE_BUDGET.relations)

    // 40 个知识点的方案：额度要够（40 + 6 = 46，未触上限）
    const bigConcepts = Array.from({ length: 40 }, (_, i) => ({ name: `c${i}` }))
    const big = planSaveBudget({ branches: [{ name: 'A', concepts: bigConcepts }] })
    expect(big.concepts).toBe(47)
    expect(big.relations).toBeGreaterThanOrEqual(big.concepts)

    // 超大方案：夹到硬上限
    const hugeConcepts = Array.from({ length: 500 }, (_, i) => ({ name: `h${i}` }))
    const huge = planSaveBudget({ branches: [{ name: 'A', concepts: hugeConcepts }] })
    expect(huge.concepts).toBe(DL_SAVE_BUDGET_MAX)
    expect(huge.relations).toBe(DL_SAVE_BUDGET_MAX)
  })
})
