/**
 * 关系图谱构建纯逻辑：关系白名单过滤/自环剔除/去重/实体名别名解析
 */
import { describe, it, expect } from 'vitest'
import { normalizeRelations, resolveEntityName, type GraphEntityRef } from '@core/platform/services/kb-brain/graph-build.service'

const entities: GraphEntityRef[] = [
  { id: 'e1', name: '张小凡', aliases: ['鬼厉'], entityType: 'character' },
  { id: 'e2', name: '青云门', aliases: [], entityType: 'organization' },
  { id: 'e3', name: '烧火棍', aliases: ['噬血珠'], entityType: 'item' },
]

describe('normalizeRelations', () => {
  it('白名单外关系/自环/重复剔除', () => {
    const raw = {
      relations: [
        { source: '张小凡', relation: 'member-of', target: '青云门', evidence: '拜入', chapters: '第5章' },
        { source: '张小凡', relation: '喜欢', target: '田灵儿' }, // 白名单外
        { source: '张小凡', relation: 'wields', target: '张小凡' }, // 自环
        { source: '张小凡', relation: 'wields', target: '烧火棍', evidence: '融合', chapters: '第16章' },
        { source: '张小凡', relation: 'wields', target: '烧火棍' }, // 重复
      ],
    }
    const out = normalizeRelations(raw)
    expect(out).toHaveLength(2)
    expect(out[0]!.relation).toBe('member-of')
    expect(out[1]!.target).toBe('烧火棍')
  })

  it('非数组输入安全返回空', () => {
    expect(normalizeRelations(null)).toEqual([])
    expect(normalizeRelations({})).toEqual([])
  })
})

describe('resolveEntityName', () => {
  it('精确名与别名都能命中', () => {
    expect(resolveEntityName('张小凡', entities)!.id).toBe('e1')
    expect(resolveEntityName('鬼厉', entities)!.id).toBe('e1')
    expect(resolveEntityName('噬血珠', entities)!.id).toBe('e3')
  })
  it('未匹配返回 null（宁缺勿造）', () => {
    expect(resolveEntityName('嘉鱼出版社', entities)).toBeNull()
  })
})
