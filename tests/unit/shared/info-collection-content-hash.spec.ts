/**
 * 行内容哈希单测（info-collection-content-hash）
 * @module tests/unit/shared/info-collection-content-hash.spec
 *
 * 钉死确定性契约：键序无关（stableStringify）、quote 参与哈希、undefined 剔除。
 * content_hash 是 ic_rows 去重与 merged 判定的根基。
 */
import { describe, it, expect } from 'vitest'
import { contentHash, stableStringify } from '@shared/utils/info-collection-content-hash'

describe('stableStringify', () => {
  it('对象键序无关', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }))
  })

  it('嵌套对象键序无关；数组保序', () => {
    const x = { outer: { y: 1, x: 2 }, list: [1, 2, 3] }
    const y = { list: [1, 2, 3], outer: { x: 2, y: 1 } }
    expect(stableStringify(x)).toBe(stableStringify(y))
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })

  it('undefined 字段剔除', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }))
  })
})

describe('contentHash', () => {
  it('确定性：同输入同哈希', () => {
    expect(contentHash({ v: 1465 }, '引句')).toBe(contentHash({ v: 1465 }, '引句'))
  })

  it('键序无关的载荷 → 同哈希（不同 AI 输出顺序不产生假去重 miss）', () => {
    expect(contentHash({ v: 1, unit: '万人' })).toBe(contentHash({ unit: '万人', v: 1 }))
  })

  it('payload 或 quote 不同 → 哈希不同', () => {
    expect(contentHash({ v: 1 })).not.toBe(contentHash({ v: 2 }))
    expect(contentHash({ v: 1 }, '引句A')).not.toBe(contentHash({ v: 1 }, '引句B'))
  })

  it('quote 空白差异归一（同引句不同排版 → 同哈希）', () => {
    expect(contentHash({ v: 1 }, '全年出生 人口')).toBe(contentHash({ v: 1 }, '全年出生人口'))
  })
})
