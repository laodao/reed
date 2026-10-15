/**
 * 蓝图起草服务单测（ic-blueprint.service）
 * @module tests/unit/core/packs/info-collection/ic-blueprint.service.spec
 *
 * 钉死：先归一后校验纪律（别名/缺省/坏条目剔除）、响亮失败（无 JSON/零需求 → 中文错）、
 * 模型字段漂移不致命（id 缺失重编、悬空 schemaId 丢弃、organizationSpec 字符串形态）。
 */
import { describe, it, expect } from 'vitest'
import { draftBlueprint, normalizeBlueprintDraft } from '@core/packs/info-collection/services/ic-blueprint.service'
import type { IcLlmFn } from '@core/packs/info-collection/services/ic-deps'

/** 合法蓝图 JSON（模拟模型输出：含字段漂移——R2 无 id、多余字段、字符串产出物） */
function goodDraft(): string {
  return '好的，蓝图如下：\n```json\n' + JSON.stringify({
    goal: '某主题的公开资料搜集',
    assumptions: ['时间范围按近 10 年理解'],
    requirements: [
      { id: 'R1', question: '逐年数值清单', form: 'data', priority: 'must', schemaId: 's1' },
      { question: '关键事件时间线', form: 'fact', priority: 'should', extraField: '模型多吐的字段' },
    ],
    schemas: [
      {
        id: 's1',
        title: '数值行',
        jsonSchema: { type: 'object', properties: { v: { type: 'number' }, u: { type: 'string' }, p: { type: 'string' }, m: { type: 'string' } } },
        convention: { type: 'measure', map: { value: 'v', unit: 'u', period: 'p', metric: 'm' } },
      },
    ],
    sourceStrategy: {
      channels: ['search'],
      minTier: 1,
      languages: ['zh', 'en'],
      seedQueries: ['主题 逐年数据', '主题 statistics'],
      primaryHint: ['www.example.gov'],
    },
    stopRules: { coverageTarget: 0.8, minIndependentSources: 2, marginalRounds: 2, budget: { maxToolCalls: 300, maxMinutes: 120 } },
    organizationSpec: ['summary-cards', { kind: 'data-table', title: '数据表' }, { kind: 'source-list' }],
    strayTopLevel: '应被剥掉',
  }) + '\n```'
}

function fakeLlm(reply: string): IcLlmFn {
  return async () => reply
}

describe('draftBlueprint', () => {
  it('围栏 JSON + 字段漂移 → 归一成功且自检通过', async () => {
    const { blueprint, check } = await draftBlueprint('某主题', { llm: fakeLlm(goodDraft()) })
    expect(check.ok).toBe(true)
    expect(blueprint.goal).toBe('某主题的公开资料搜集')
    // R2 无 id → 重编；多吐字段剥掉
    expect(blueprint.requirements.map(r => r.id)).toEqual(['R1', 'R2'])
    expect(blueprint.requirements[0]).not.toHaveProperty('extraField')
    expect(blueprint.schemas[0].convention?.map.value).toBe('v')
    expect(blueprint.organizationSpec.map(d => d.kind)).toEqual(['summary-cards', 'data-table', 'source-list'])
    expect(blueprint.organizationSpec[1].title).toBe('数据表')
    // 安全缺省：autoConfirm 永远由调用方置位
    expect(blueprint.autoConfirm).toBe(false)
  })

  it('模型输出无 JSON → 中文错误（响亮失败）', async () => {
    await expect(draftBlueprint('某主题', { llm: fakeLlm('抱歉我做不到') })).rejects.toThrow('无法解析')
  })

  it('零需求 → 中文错误', async () => {
    const reply = '```json\n{"goal":"x","requirements":[]}\n```'
    await expect(draftBlueprint('某主题', { llm: fakeLlm(reply) })).rejects.toThrow('未能拆解出任何信息需求')
  })

  it('空 goal → 中文错误（不打 LLM）', async () => {
    let called = 0
    const llm: IcLlmFn = async () => {
      called += 1
      return '{}'
    }
    await expect(draftBlueprint('  ', { llm })).rejects.toThrow('主题描述为空')
    expect(called).toBe(0)
  })
})

describe('normalizeBlueprintDraft', () => {
  it('缺省填充：stopRules/sourceStrategy/autoConfirm', () => {
    const bp = normalizeBlueprintDraft({ goal: 'g', requirements: [{ id: 'R1', question: 'q', priority: 'must' }] })
    expect(bp.stopRules.budget).toEqual({ maxToolCalls: 300, maxMinutes: 120 })
    expect(bp.stopRules.minIndependentSources).toBe(2)
    expect(bp.sourceStrategy.minTier).toBe(1) // 有 must → 默认官方机构
    expect(bp.sourceStrategy.languages).toEqual(['zh'])
    expect(bp.organizationSpec.map(d => d.kind)).toEqual(['summary-cards', 'source-list'])
  })

  it('悬空 schemaId 引用丢弃（不整份打回）', () => {
    const bp = normalizeBlueprintDraft({
      goal: 'g',
      requirements: [{ id: 'R1', question: 'q', schemaId: 'ghost' }],
    })
    expect(bp.requirements[0].schemaId).toBeUndefined()
  })

  it('坏条目剔除：question 为空的 IR 不入清单', () => {
    const bp = normalizeBlueprintDraft({
      goal: 'g',
      requirements: [{ id: 'R1', question: '  ' }, { id: 'R2', question: '有效' }],
    })
    expect(bp.requirements.map(r => r.id)).toEqual(['R2'])
  })

  it('非法 convention 类型丢弃但保留 schema（2026-10-08 真机：模型发明 catalog 判死整份蓝图）', () => {
    const bp = normalizeBlueprintDraft({
      goal: 'g',
      requirements: [{ id: 'R1', question: '文本结构', form: 'data', priority: 'should', schemaId: 's2' }],
      schemas: [
        {
          id: 's2',
          title: '结构目录',
          jsonSchema: { type: 'object', properties: { chapter: { type: 'string' }, title: { type: 'string' } } },
          convention: { type: 'catalog' } as never, // 模型发明的类型
        },
        {
          id: 's1',
          title: '数值行',
          jsonSchema: { type: 'object', properties: { v: { type: 'number' } } },
          convention: { type: 'measure', map: { value: 'v' } },
        },
      ],
    })
    expect(bp.schemas).toHaveLength(2)
    expect(bp.schemas.find(s => s.id === 's2')?.convention).toBeUndefined()
    expect(bp.schemas.find(s => s.id === 's1')?.convention?.type).toBe('measure')
  })
})
