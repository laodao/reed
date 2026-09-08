/**
 * 间隔复习候选规则测试（learning-review.rules，M3-B）
 * @module tests/unit/core/packs/domain-learning/learning-review.rules.spec
 *
 * 钉死口径：候选 = mastered/review 知识概念且逾期；最近掌握/复习时间取 mastery_log
 * （终点 mastered 或 trigger∈review/lesson_ack/self_test），无记录回落 createdAt；
 * 到期按最久未复习优先、limit 截断；group/未掌握不参与。
 */

import { describe, it, expect } from 'vitest'
import {
  lastReviewTime,
  pickReviewCandidates,
  type ReviewConceptRow,
  type ReviewLogRow,
} from '@core/packs/domain-learning/rules/learning-review.rules'

function concept(id: string, mastery: string, over: Partial<ReviewConceptRow> = {}): ReviewConceptRow {
  return { id, name: `概念${id}`, nodeType: 'concept', mastery, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: null, ...over }
}

describe('lastReviewTime', () => {
  it('取终点 mastered 或复习类 trigger 的最新记录；无记录回落 createdAt', () => {
    const c = concept('c1', 'mastered', { createdAt: new Date('2026-01-01T00:00:00Z') })
    const logs: ReviewLogRow[] = [
      { conceptId: 'c1', trigger: 'lesson_ack', toMastery: 'mastered', at: new Date('2026-01-05T00:00:00Z') },
      { conceptId: 'c1', trigger: 'review', at: new Date('2026-02-01T00:00:00Z') },
      { conceptId: 'c1', trigger: 'expire', at: new Date('2026-03-01T00:00:00Z') }, // 非复习类 → 忽略
      { conceptId: 'c2', trigger: 'lesson_ack', toMastery: 'mastered', at: new Date('2026-02-01T00:00:00Z') }, // 他人
    ]
    expect(lastReviewTime(c, logs).toISOString()).toBe('2026-02-01T00:00:00.000Z')
    expect(lastReviewTime(concept('c9', 'mastered'), logs).toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('pickReviewCandidates', () => {
  const day = 24 * 60 * 60 * 1000
  const now = new Date('2026-03-01T00:00:00Z')

  it('mastered 且逾期 → 到期；未掌握/group 不参与', () => {
    const concepts = [
      concept('m1', 'mastered', { createdAt: new Date('2026-01-01T00:00:00Z') }), // 逾期 59 天
      concept('m2', 'mastered', { createdAt: new Date('2026-02-28T12:00:00Z') }), // 12h → 未到期
      concept('u1', 'untouched', { createdAt: new Date('2026-01-01T00:00:00Z') }),
      concept('g1', 'mastered', { nodeType: 'group', createdAt: new Date('2026-01-01T00:00:00Z') }),
    ]
    const picks = pickReviewCandidates(concepts, [], { intervalMs: day, limit: 10, now })
    expect(picks.map((p) => p.id)).toEqual(['m1'])
  })

  it('按最近复习记录算到期：近复习过的不到期，最早未复习的优先、limit 截断', () => {
    const concepts = [
      concept('a', 'mastered', { createdAt: new Date('2026-01-01T00:00:00Z') }),
      concept('b', 'mastered', { createdAt: new Date('2026-01-10T00:00:00Z') }),
      concept('c', 'review', { createdAt: new Date('2026-01-20T00:00:00Z') }),
    ]
    const logs: ReviewLogRow[] = [
      { conceptId: 'a', trigger: 'lesson_ack', toMastery: 'mastered', at: new Date('2026-02-01T00:00:00Z') }, // 逾期 28 天
      { conceptId: 'b', trigger: 'review', at: new Date('2026-02-28T00:00:00Z') }, // 逾期 1 天
      { conceptId: 'c', trigger: 'review', at: new Date('2026-02-28T12:00:00Z') }, // 逾期半天
    ]
    const picks = pickReviewCandidates(concepts, logs, { intervalMs: day, limit: 2, now })
    expect(picks.map((p) => p.id)).toEqual(['a', 'b']) // 逾期最久优先，limit=2
    expect(picks[0].overdueMs).toBeGreaterThan(0)
  })
})
