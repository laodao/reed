/**
 * 领域学习排程/门控纯规则测试（design-v3 §9 D9 / §14）
 *
 * 钉死：前置依赖方向（source→target）、掌握度门控、拓扑取下一概念（含回退插队）、
 * 「没懂」拆解阈值。纯函数零依赖。
 */

import { describe, it, expect } from 'vitest'
import {
  isMastered,
  prerequisiteIdsOf,
  prereqsReady,
  isLearnable,
  pickNextToLearn,
  shouldSuggestSplit,
  CONFUSED_SPLIT_THRESHOLD,
} from '@core/packs/domain-learning/rules/learning-sequence.rules'
import type { DlConceptView, DlRelationView } from '@shared/types/domain-learning.types'

function concept(id: string, mastery: DlConceptView['mastery'], nodeType: DlConceptView['nodeType'] = 'concept'): DlConceptView {
  return { id, parentId: null, nodeType, name: id, researchState: 'extracted', mastery, source: 'material' }
}

const P = (source: string, target: string): DlRelationView => ({ source, target, type: 'prerequisite' })
const R = (source: string, target: string): DlRelationView => ({ source, target, type: 'related' })

describe('learning-sequence.rules', () => {
  it('isMastered：仅 mastered 视为已掌握（review 需回访）', () => {
    expect(isMastered('mastered')).toBe(true)
    expect(isMastered('review')).toBe(false)
    expect(isMastered('learning')).toBe(false)
    expect(isMastered('untouched')).toBe(false)
  })

  it('prerequisiteIdsOf / prereqsReady：方向 source→target，type 精确匹配', () => {
    const rels = [P('a', 'b'), P('c', 'b'), R('x', 'b')]
    expect(prerequisiteIdsOf(rels, 'b')).toEqual(['a', 'c'])
    expect(prerequisiteIdsOf(rels, 'a')).toEqual([])
    expect(prereqsReady('b', rels, new Set(['a']))).toBe(false)
    expect(prereqsReady('b', rels, new Set(['a', 'c']))).toBe(true)
    expect(prereqsReady('a', rels, new Set())).toBe(true) // 无前置
  })

  it('isLearnable：未掌握 + 前置全就绪；group 目录不可学', () => {
    const rels = [P('a', 'b')]
    expect(isLearnable(concept('b', 'untouched'), rels, new Set(['a']))).toBe(true)
    expect(isLearnable(concept('b', 'untouched'), rels, new Set())).toBe(false)
    expect(isLearnable(concept('b', 'mastered'), rels, new Set(['a']))).toBe(false)
    expect(isLearnable(concept('g1', 'untouched', 'group'), [], new Set())).toBe(false)
  })

  it('pickNextToLearn：按序取第一个可学；门控未满足跳过后继；无后备则全部掌握返回 null', () => {
    // b 依赖 a：a 未掌握时 b 不可学，但 c 可学
    const rels = [P('a', 'b')]
    expect(pickNextToLearn([concept('b', 'untouched'), concept('c', 'untouched')], rels)).toBe('c')
    // a 已掌握 → 顺序首个 b
    expect(pickNextToLearn([concept('a', 'mastered'), concept('b', 'untouched')], rels)).toBe('b')
    // 全部掌握 → null
    expect(pickNextToLearn([concept('a', 'mastered'), concept('b', 'mastered')], rels)).toBeNull()
  })

  it('pickNextToLearn：全不可学时回退到第一个未掌握（插队兜底，图数据缺陷容忍）', () => {
    // c 声明依赖 a，但 a 不在概念集（地图缺节点）→ 门控永远不满足；
    // 兜底仍让用户能打开 c（系统只建议不强制，D9）
    const rels = [P('a', 'c')]
    const next = pickNextToLearn(
      [concept('c', 'untouched'), concept('g', 'untouched', 'group')],
      rels,
    )
    expect(next).toBe('c') // group 不算
    // 正常链：a→b 且 a 学习中（未掌握但仍可续学）→ 顺序首个可学的是 a
    const next2 = pickNextToLearn(
      [concept('a', 'learning'), concept('b', 'untouched')],
      [P('a', 'b')],
    )
    expect(next2).toBe('a')
  })

  it('shouldSuggestSplit：达到阈值（默认 2）才建议拆解', () => {
    expect(CONFUSED_SPLIT_THRESHOLD).toBe(2)
    expect(shouldSuggestSplit(0)).toBe(false)
    expect(shouldSuggestSplit(1)).toBe(false)
    expect(shouldSuggestSplit(2)).toBe(true)
    expect(shouldSuggestSplit(3)).toBe(true)
  })
})
