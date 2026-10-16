/**
 * 引句回验单测（info-collection-quote）
 * @module tests/unit/shared/info-collection-quote.spec
 *
 * 钉死三级判定：exact（归一化包含）/ fuzzy（≥0.9 滑窗）/ miss（拒收）。
 * 防幻觉硬机制——回验不过的抽取在服务层拒收，这里钉死判定边界。
 */
import { describe, it, expect } from 'vitest'
import { verifyQuote, normalizeForQuoteMatch } from '@shared/utils/info-collection-quote'

const TEXT =
  '2024年末全国人口140828万人，比上年末减少139万人。全年出生人口954万人，出生率为6.77‰。'

describe('normalizeForQuoteMatch', () => {
  it('去空白/零宽字符、小写、NFC', () => {
    expect(normalizeForQuoteMatch('出生 人口')).toBe('出生人口')
    expect(normalizeForQuoteMatch('A\u200bB\u3000C')).toBe('abc')
    expect(normalizeForQuoteMatch('GDP')).toBe('gdp')
  })
})

describe('verifyQuote', () => {
  it('原文直引 → exact', () => {
    const r = verifyQuote('全年出生人口954万人', TEXT)
    expect(r.verdict).toBe('exact')
    expect(r.ratio).toBe(1)
  })

  it('排版差异（引句带换行/空格/全角空格）→ exact', () => {
    const r = verifyQuote('全年出生\n人口 954万人', TEXT)
    expect(r.verdict).toBe('exact')
  })

  it('轻微差异（一个字符不同）→ fuzzy', () => {
    // "954万" vs 原文 "954万"——改一位数字制造近似
    const r = verifyQuote('全年出生人口953万人，', TEXT)
    expect(r.verdict).toBe('fuzzy')
    expect(r.ratio).toBeGreaterThanOrEqual(0.9)
  })

  it('编造数值（差距大）→ miss', () => {
    const r = verifyQuote('全年出生人口800万人', TEXT)
    expect(r.verdict).toBe('miss')
    expect(r.ratio).toBeLessThan(0.9)
  })

  it('引句比正文还长 → miss（防整段正文当引句）', () => {
    const r = verifyQuote(TEXT + '以及更多更多不存在的内容', '短文')
    expect(r.verdict).toBe('miss')
  })

  it('空输入 → miss', () => {
    expect(verifyQuote('', TEXT).verdict).toBe('miss')
    expect(verifyQuote('x', '').verdict).toBe('miss')
  })

  it('英文大小写与空白差异 → exact', () => {
    const t = 'The population reached 1.408 billion at year end.'
    expect(verifyQuote('population reached 1.408 BILLION', t).verdict).toBe('exact')
  })
})
