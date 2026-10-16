/**
 * web-extract 智能截断测试
 * @module tests/unit/core/platform/workflow/web-extract-truncate
 * @description truncateTextSmart：优先在句末/段落边界截断（不切半句子），
 *              回退软边界（空格/逗号），最后硬切；始终带「…[已截断]」标记。
 */
import { describe, it, expect } from 'vitest'
import { truncateTextSmart } from '@core/platform/workflow/nodes/extra-nodes'

describe('truncateTextSmart', () => {
  it('不超过上限原样返回（不追加标记）', () => {
    expect(truncateTextSmart('短文本内容', 100)).toBe('短文本内容')
    expect(truncateTextSmart('', 10)).toBe('')
  })

  it('在句末标点边界截断（保留完整句子，不切半）', () => {
    const text = '第一句话。第二句话比较长。第三句话也在这里。'
    const out = truncateTextSmart(text, 12)
    expect(out).toBe('第一句话。…[已截断]')
  })

  it('句末边界太靠前时回退软边界（空格）', () => {
    // head=slice(0,13)='abcd efgh ij'：无句末；软边界取最后一个空格 index=4 → 切到 'abcd'
    const out = truncateTextSmart('abcd efgh ijkl mnop', 13)
    expect(out).toBe('abcd…[已截断]')
  })

  it('无任何边界时硬切并带标记', () => {
    // budget = 8-6 = 2 → '这是'；无标点/空格边界 → 硬切
    const out = truncateTextSmart('这是一个完全没有标点的超长文本内容', 8)
    expect(out).toBe('这是…[已截断]')
  })

  it('换行作为段落边界同样生效', () => {
    // budget = 12-6 = 6 → '第一段内容\n'；句末边界取最后一个换行（index 5）
    const out = truncateTextSmart('第一段内容\n第二段内容很长很长', 12)
    expect(out).toBe('第一段内容\n…[已截断]')
  })

  it('截断后长度不超过上限（上限过小时仅保留标记）', () => {
    expect(truncateTextSmart('这是第一句。这是第二句，带逗号。这是第三句没有标点啊', 5)).toBe('…[已截断]')
    for (const max of [8, 12, 20]) {
      const out = truncateTextSmart('这是第一句。这是第二句，带逗号。这是第三句没有标点啊', max)
      expect(out.length, `max=${max}`).toBeLessThanOrEqual(max)
      expect(out.endsWith('…[已截断]'), `max=${max}: ${out}`).toBe(true)
    }
  })
})
