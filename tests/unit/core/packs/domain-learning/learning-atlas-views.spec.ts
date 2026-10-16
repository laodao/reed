/**
 * Atlas 增强视图派生规则测试（learning-atlas-views，M2-E）
 * @module tests/unit/core/packs/domain-learning/learning-atlas-views.spec
 *
 * 钉死口径：时间线按 attrs 时间类键升序；流程按 prerequisite 拓扑分层（同层并行）；
 * 矩阵按 nodeType×relationType 计数；三层结构 = 目录/概念/卡片著作；enabled =
 * 画像侧重别名 ∩ available，无侧重跟随 available。
 */

import { describe, it, expect } from 'vitest'
import {
  buildAtlasViews,
  type AtlasViewInput,
} from '@core/packs/domain-learning/rules/learning-atlas-views'

function baseInput(): AtlasViewInput {
  return {
    concepts: [],
    relations: [],
    profile: null,
  }
}

describe('learning-atlas-views', () => {
  it('时间线：有年份 attrs 的节点升序输出；无时间锚点不出现', () => {
    const input = baseInput()
    input.concepts = [
      { id: 'c2', name: '贝叶斯定理', nodeType: 'concept', parentId: 'g1', attrs: { year: '1763' } },
      { id: 'c1', name: '条件概率', nodeType: 'concept', parentId: 'g1', attrs: { 年份: '1700' } },
      { id: 'c3', name: '无时间节点', nodeType: 'concept', parentId: null },
      { id: 'g1', name: '概率论', nodeType: 'group', parentId: null },
    ]
    const v = buildAtlasViews(input)
    expect(v.available).toContain('timeline')
    expect(v.timeline?.items.map((i) => i.id)).toEqual(['c1', 'c2'])
    expect(v.timeline?.items[1].group).toBe('概率论')
    expect(v.enabled).toContain('timeline')
  })

  it('流程：prerequisite 边分层（无前置者为第 0 层，同层并行）', () => {
    const input = baseInput()
    input.concepts = [
      { id: 'c1', name: '概率论基础', nodeType: 'concept', parentId: null },
      { id: 'c2', name: '条件概率', nodeType: 'concept', parentId: null },
      { id: 'c3', name: '贝叶斯定理', nodeType: 'concept', parentId: null },
      { id: 'c4', name: '先验后验', nodeType: 'concept', parentId: null },
    ]
    input.relations = [
      { source: 'c1', target: 'c2', relationType: 'prerequisite', verified: true },
      { source: 'c2', target: 'c3', relationType: 'prerequisite', verified: true },
      { source: 'c1', target: 'c4', relationType: 'prerequisite', verified: true },
    ]
    const v = buildAtlasViews(input)
    expect(v.flow?.stages).toEqual([
      { order: 0, conceptIds: ['c1'] },
      { order: 1, conceptIds: ['c2', 'c4'] },
      { order: 2, conceptIds: ['c3'] },
    ])
    expect(v.flow?.sourceIds).toEqual(['c1'])
    expect(v.flow?.sinkIds).toEqual(['c3', 'c4'])
    expect(v.enabled).toContain('flow')
  })

  it('矩阵：nodeType × relationType 计数；无关系边不出矩阵', () => {
    const input = baseInput()
    input.concepts = [
      { id: 't1', name: '定理A', nodeType: 'theory', parentId: null },
      { id: 't2', name: '定理B', nodeType: 'theory', parentId: null },
      { id: 'm1', name: '方法X', nodeType: 'method', parentId: null },
    ]
    input.relations = [
      { source: 't1', target: 'm1', relationType: 'prerequisite', verified: true },
      { source: 'm1', target: 't2', relationType: 'related', verified: true },
    ]
    const v = buildAtlasViews(input)
    expect(v.matrix?.relationTypes).toEqual(['prerequisite', 'related'])
    // 行 = 边起点类型：t1→m1 记 theory.prerequisite；m1→t2 记 method.related
    expect(v.matrix?.cells.theory?.prerequisite).toBe(1)
    expect(v.matrix?.cells.method?.prerequisite).toBeUndefined()
    expect(v.matrix?.cells.method?.related).toBe(1)

    expect(buildAtlasViews(baseInput()).matrix).toBeNull()
  })

  it('三层结构：group→概念→卡片/著作；根层无 group 概念归根桶', () => {
    const input = baseInput()
    input.concepts = [
      { id: 'g1', name: '概率论', nodeType: 'group', parentId: null },
      { id: 'c1', name: '条件概率', nodeType: 'concept', parentId: 'g1', card: { version: 2, status: 'published', worksCount: 3 } },
      { id: 'c2', name: '贝叶斯定理', nodeType: 'concept', parentId: null, card: null },
    ]
    const v = buildAtlasViews(input)
    const g = v.layers?.groups.find((x) => x.groupName === '概率论')
    expect(g?.concepts).toHaveLength(1)
    expect(g?.concepts[0]).toMatchObject({ id: 'c1', hasCard: true, worksCount: 3 })
    const root = v.layers?.groups.find((x) => x.groupId === null)
    expect(root?.concepts.map((c) => c.id)).toEqual(['c2'])
    expect(v.enabled).toContain('layers')
  })

  it('画像侧重别名驱动 enabled：强调「时间线+流程」时只启用能派生的', () => {
    const input = baseInput()
    input.concepts = [
      { id: 'g1', name: '组', nodeType: 'group', parentId: null },
      { id: 'c1', name: 'A', nodeType: 'concept', parentId: 'g1', attrs: { year: '2000' } },
      { id: 'c2', name: 'B', nodeType: 'concept', parentId: 'g1', attrs: { year: '2010' } },
    ]
    input.profile = { kindLabel: '自定义', nature: 'x', emphasis: ['时间线', '矩阵'] }
    const v = buildAtlasViews(input)
    // 时间线可用且被启用；矩阵不可用（无关系）→ 被过滤掉
    expect(v.enabled).toEqual(['timeline'])
    expect(v.available).toEqual(['timeline', 'layers'])

    // 无侧重（自定义空 emphasis）→ 跟随 available
    const v2 = buildAtlasViews({ ...input, profile: { kindLabel: '自定义', nature: '', emphasis: [] } })
    expect(v2.enabled).toEqual(['timeline', 'layers'])
  })

  it('空空间：各视图 null、available/enabled 为空', () => {
    const v = buildAtlasViews(baseInput())
    expect(v.available).toEqual([])
    expect(v.enabled).toEqual([])
    expect(v.timeline).toBeNull()
    expect(v.flow).toBeNull()
    expect(v.matrix).toBeNull()
    expect(v.layers).toBeNull()
  })
})
