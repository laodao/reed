/**
 * 评测评分器单测（fixtures.ts）——runner 逻辑的门卫；真机基线走 run-eval CLI。
 */
import { describe, it, expect } from 'vitest'
import { evaluateCase, summarize, type EvalCase } from '@core/platform/services/kb-brain/eval/fixtures'

const results = [
  { documentId: 'doc-x', content: '他失去了左臂' },
  { documentId: 'doc-y', content: '复仇必升级代价' },
  { documentId: 'doc-z', content: '假性终局与真终局' },
]

describe('evaluateCase', () => {
  const c: EvalCase = {
    id: 'L01',
    query: 'q',
    intent: 'lookup',
    expectedDocumentIds: ['doc-y'],
    expectedKeywords: [],
  }
  it('期望文档在前 5 → hit + rank', () => {
    const r = evaluateCase(results, c)
    expect(r.hit).toBe(true)
    expect(r.rank).toBe(2)
    expect(r.recallAt5).toBe(1)
  })
  it('关键词弱判据（未标注文档时）', () => {
    const r = evaluateCase(results, { ...c, expectedDocumentIds: null, expectedKeywords: ['假性终局'] })
    expect(r.rank).toBe(3)
  })
  it('未命中 → recall 0', () => {
    const r = evaluateCase(results, { ...c, expectedDocumentIds: ['doc-none'] })
    expect(r.hit).toBe(false)
    expect(r.recallAt5).toBe(0)
  })
})

describe('summarize', () => {
  it('按 intent 分桶与门线指标', () => {
    const cases: EvalCase[] = [
      { id: '1', query: 'a', intent: 'lookup', expectedDocumentIds: ['d'], expectedKeywords: [] },
      { id: '2', query: 'b', intent: 'synthesize', expectedDocumentIds: ['d'], expectedKeywords: [] },
    ]
    const rs = [
      { caseId: '1', query: 'a', intent: 'lookup', hit: true, rank: 1, recallAt5: 1 },
      { caseId: '2', query: 'b', intent: 'synthesize', hit: false, rank: null, recallAt5: 0 },
    ]
    const rep = summarize('t', 'brain', cases, rs)
    expect(rep.evaluated).toBe(2)
    expect(rep.recallAt5).toBeCloseTo(0.5)
    expect(rep.byIntent['lookup'].recallAt5).toBe(1)
    expect(rep.byIntent['synthesize'].recallAt5).toBe(0)
  })
})
