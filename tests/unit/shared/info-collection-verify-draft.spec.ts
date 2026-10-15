/**
 * 反查校验单测（info-collection-verify-draft）
 * @module tests/unit/shared/info-collection-verify-draft.spec
 *
 * 钉死：结构化回链（证据行 id 必须真实存在）、数值回链（值/期间/引句/行字段
 * 四个来源任一命中即过）、千位分隔与小数规范化、违规剔句。
 */
import { describe, it, expect } from 'vitest'
import {
  extractNumbers,
  entryNumbers,
  verifyStatements,
  type IcDraftEntry,
} from '@shared/utils/info-collection-verify-draft'

const entry: IcDraftEntry = {
  rowId: 'r-1',
  value: 954,
  period: '2024',
  quote: '全年出生人口954万人，出生率为6.77‰。',
  row: { v: 954, u: '万人', region: '全国' },
}

describe('extractNumbers', () => {
  it('千位分隔/小数规范化', () => {
    expect(extractNumbers('1,408万人，增3.4%')).toEqual(['1408', '3.4'])
    expect(extractNumbers('负增长 -0.99')).toEqual(['-0.99'])
    expect(extractNumbers('无数字')).toEqual([])
  })
})

describe('entryNumbers', () => {
  it('值/期间/引句/行字段并入一个集合', () => {
    const s = entryNumbers(entry)
    expect(s.has('954')).toBe(true)
    expect(s.has('2024')).toBe(true)
    expect(s.has('6.77')).toBe(true)
    expect(s.has('万人') || s.has('全国')).toBe(false) // 非数字不收
  })
})

describe('verifyStatements', () => {
  it('数值全部可回链 → 通过', () => {
    const [v] = verifyStatements(
      [{ text: '2024 年出生人口 954 万人', evidenceRowIds: ['r-1'] }],
      [entry],
    ).passed
    expect(v.ok).toBe(true)
  })

  it('幻觉数值（条目里没有）→ 剔除，missingNumbers 指明', () => {
    const { stripped } = verifyStatements(
      [{ text: '2024 年出生人口 990 万人', evidenceRowIds: ['r-1'] }],
      [entry],
    )
    expect(stripPierced(stripped, '990')).toBe(true)
  })

  it('证据行 id 不存在 → missingEvidence（禁自由写作回链）', () => {
    const { stripped } = verifyStatements(
      [{ text: '出生人口 954 万人', evidenceRowIds: ['ghost'] }],
      [entry],
    )
    expect(stripped).toHaveLength(1)
    expect(stripped[0].missingEvidence).toBe(true)
  })

  it('无数值陈述也必须挂至少一条真实证据', () => {
    const ok = verifyStatements([{ text: '出生率保持低位', evidenceRowIds: ['r-1'] }], [entry])
    expect(ok.passed).toHaveLength(1)
    const bad = verifyStatements([{ text: '出生率保持低位', evidenceRowIds: [] }], [entry])
    expect(bad.stripped).toHaveLength(1)
  })

  it('千位分隔形态的数值可与条目整数值回链', () => {
    const big: IcDraftEntry = { rowId: 'r-2', value: 140828, period: '2024', quote: null, row: null }
    const [v] = verifyStatements(
      [{ text: '年末总人口 140,828 万人', evidenceRowIds: ['r-2'] }],
      [big],
    ).passed
    expect(v.ok).toBe(true)
  })
})

function stripPierced(stripped: ReturnType<typeof verifyStatements>['stripped'], num: string): boolean {
  return stripped.length === 1 && stripped[0].missingNumbers.includes(num)
}
