/**
 * 蓝图程序化自检单测（info-collection-blueprint）
 * @module tests/unit/shared/info-collection-blueprint.spec
 *
 * 钉死阶段 1 自检 ①-⑤：结构缺陷 = error（不允许执行），可疑 = warning。
 * 自检是启发式不是内容审查——它拦结构性缺陷，不判"问得好不好"。
 */
import { describe, it, expect } from 'vitest'
import { checkBlueprint, MIN_TOOL_CALLS_PER_REQUIREMENT } from '@shared/utils/info-collection-blueprint'
import type { IcBlueprint } from '@shared/types/info-collection.types'

/** 一份合法蓝图（快速模式 AI 应产出的形状） */
function validBlueprint(): IcBlueprint {
  return {
    version: 1,
    goal: '搜集某主题的公开资料与数据',
    assumptions: ['时间范围按近 10 年理解'],
    requirements: [
      { id: 'R1', question: '逐年数值清单', form: 'data', priority: 'must', schemaId: 's1' },
      { id: 'R2', question: '关键事件时间线', form: 'fact', priority: 'should' },
    ],
    schemas: [
      {
        id: 's1',
        title: '数值行',
        jsonSchema: {
          type: 'object',
          properties: { v: { type: 'number' }, u: { type: 'string' }, p: { type: 'string' }, m: { type: 'string' }, region: { type: 'string' } },
        },
        convention: { type: 'measure', map: { value: 'v', unit: 'u', period: 'p', metric: 'm', dims: ['region'] } },
      },
    ],
    sourceStrategy: {
      channels: ['search', 'info-source'],
      minTier: 2,
      languages: ['zh', 'en'],
      seedQueries: ['主题 逐年数据', '主题 官方统计', 'topic statistics'],
      primaryHint: ['www.example.gov'],
    },
    stopRules: {
      coverageTarget: 0.8,
      minIndependentSources: 2,
      marginalRounds: 2,
      budget: { maxToolCalls: 300, maxMinutes: 120 },
    },
    organizationSpec: [{ kind: 'data-table' }, { kind: 'source-list' }],
    autoConfirm: false,
  }
}

describe('checkBlueprint', () => {
  it('合法蓝图 → ok=true 无 error', () => {
    const r = checkBlueprint(validBlueprint())
    expect(r.ok).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('① IR 问题为空 → error（不可判定满足与否）', () => {
    const bp = validBlueprint()
    bp.requirements[1].question = '   '
    const r = checkBlueprint(bp)
    expect(r.ok).toBe(false)
    expect(r.errors.some(i => i.path.includes('R2') && i.message.includes('为空'))).toBe(true)
  })

  it('① IR id 重复 → error；需求清单为空 → error', () => {
    const bp = validBlueprint()
    bp.requirements[1].id = 'R1'
    expect(checkBlueprint(bp).ok).toBe(false)
    const empty = validBlueprint()
    empty.requirements = []
    expect(checkBlueprint(empty).ok).toBe(false)
  })

  it('② 种子查询为空 → error；少于 must 级 IR → warning', () => {
    const bp = validBlueprint()
    bp.sourceStrategy.seedQueries = []
    expect(checkBlueprint(bp).ok).toBe(false)

    const bp2 = validBlueprint()
    bp2.requirements.push(
      { id: 'R3', question: '另一条必须项', form: 'fact', priority: 'must' },
      { id: 'R4', question: '再一条必须项', form: 'fact', priority: 'must' },
      { id: 'R5', question: '第四条必须项', form: 'fact', priority: 'must' },
    )
    const r2 = checkBlueprint(bp2)
    expect(r2.ok).toBe(true)
    expect(r2.warnings.some(i => i.path.includes('seedQueries'))).toBe(true)
  })

  it('③ convention 映射不存在的字段 → error（抽不到的字段不许出现）', () => {
    const bp = validBlueprint()
    bp.schemas[0].convention = { type: 'measure', map: { value: '不存在的字段', unit: 'u', period: 'p', metric: 'm' } }
    const r = checkBlueprint(bp)
    expect(r.ok).toBe(false)
    expect(r.errors.some(i => i.message.includes('不在 schema properties'))).toBe(true)
  })

  it('③ IR 引用不存在的 schema → error；未被引用的 schema → warning', () => {
    const bp = validBlueprint()
    bp.requirements[0].schemaId = 'ghost'
    expect(checkBlueprint(bp).ok).toBe(false)

    const bp2 = validBlueprint()
    bp2.schemas.push({ id: 's-dead', title: '死规格', jsonSchema: { type: 'object', properties: { a: { type: 'string' } } } })
    const r2 = checkBlueprint(bp2)
    expect(r2.ok).toBe(true)
    expect(r2.warnings.some(i => i.path.includes('s-dead'))).toBe(true)
  })

  it('④ must IR 存在但独立源下限 <2 → error', () => {
    const bp = validBlueprint()
    bp.stopRules.minIndependentSources = 1
    const r = checkBlueprint(bp)
    expect(r.ok).toBe(false)
    expect(r.errors.some(i => i.path.includes('minIndependentSources'))).toBe(true)
  })

  it('⑤ 预算低于每 IR 下限 → warning（不阻断但提醒）；覆盖率目标非法 → error', () => {
    const bp = validBlueprint()
    bp.stopRules.budget.maxToolCalls = 5
    const r = checkBlueprint(bp)
    expect(r.ok).toBe(true)
    expect(r.warnings.some(i => i.path.includes('maxToolCalls'))).toBe(true)
    expect(5).toBeLessThan(2 * MIN_TOOL_CALLS_PER_REQUIREMENT)

    const bp2 = validBlueprint()
    bp2.stopRules.coverageTarget = 1.5
    expect(checkBlueprint(bp2).ok).toBe(false)
  })
})
