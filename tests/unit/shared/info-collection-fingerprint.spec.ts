/**
 * 正文指纹与转载簇判定单测（info-collection-fingerprint）
 * @module tests/unit/shared/info-collection-fingerprint.spec
 *
 * 钉死：同文（排版差异）高相似、异文低相似、短文本不判簇、确定性。
 * 簇判定只影响主源选择不删内容（宁漏勿杀），因此测试只认边界不追高精度。
 */
import { describe, it, expect } from 'vitest'
import { fingerprintText, fingerprintSimilarity, isSameContent } from '@shared/utils/info-collection-fingerprint'

/** 造一段足够长的正文（>100 有效字符） */
function longText(seed: string): string {
  return (
    `${seed}：根据国家统计局公布的数据，2024年末全国人口140828万人，比上年末减少139万人。` +
    '全年出生人口954万人，人口出生率为6.77‰；死亡人口1093万人，人口死亡率为7.76‰；' +
    '人口自然增长率为-0.99‰。从性别构成看，男性人口71909万人，女性人口68919万人，' +
    '总人口性别比为104.34（以女性为100）。从年龄构成看，16-59岁的劳动年龄人口85798万人，'
  )
}

describe('fingerprintText', () => {
  it('确定性：同输入同指纹', () => {
    const t = longText('A')
    expect(fingerprintText(t)).toEqual(fingerprintText(t))
  })

  it('排版差异（空白/标点/换行注入）→ 指纹完全一致', () => {
    const a = longText('A')
    const b = a.replace(/，/g, '，\n').replace(/人口/g, ' 人 口 ')
    expect(fingerprintText(a).sampled).toBe(fingerprintText(b).sampled)
  })

  it('短文本（<100 有效字符）→ 空 sampled（不参与簇判定）', () => {
    const fp = fingerprintText('太短了')
    expect(fp.sampled).toBe('')
    expect(fp.chars).toBe(3)
  })
})

describe('fingerprintSimilarity / isSameContent', () => {
  it('同文不同排版 → 相似度 1，isSameContent=true', () => {
    const a = longText('B')
    const b = a.replace('数据', '数 据')
    expect(fingerprintSimilarity(fingerprintText(a), fingerprintText(b))).toBe(1)
    expect(isSameContent(a, b)).toBe(true)
  })

  it('不同正文 → 低相似，isSameContent=false', () => {
    // 两段主题、措辞、数值完全不同的正文（共享长尾会被正确判为近似，用例必须真不同）
    const a = longText('甲主题').replace(/140828|954|1093|85798/g, m => String(Number(m) + 7)) + '甲主题独有的补充说明段落，内容与另一篇完全不同。'
    const b = longText('乙主题').replace(/140828|954|1093|85798/g, m => String(Number(m) + 13)) + '乙主题独有的另一个补充说明，措辞与结构均不相同。'
    expect(fingerprintSimilarity(fingerprintText(a), fingerprintText(b))).toBeLessThan(0.8)
    expect(isSameContent(a, b)).toBe(false)
  })

  it('任一方为短文本 → 0（宁漏勿杀，不判簇）', () => {
    expect(fingerprintSimilarity(fingerprintText('短'), fingerprintText(longText('X')))).toBe(0)
  })

  it('局部改动（替换一句话）→ 相似但不为 1', () => {
    const a = longText('C')
    const b = a.replace('140828', '141000')
    const sim = fingerprintSimilarity(fingerprintText(a), fingerprintText(b))
    expect(sim).toBeGreaterThan(0.3)
    expect(sim).toBeLessThan(1)
  })
})
