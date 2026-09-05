/**
 * normalizeShotNumbers 单测（F1：AI 分镜编号规范化）
 * @module tests/unit/episode-production/narrative/storyboard-numbering
 *
 * 背景：AI 生成分镜返回的 shotNumber 不保证连续（实测返回过 2/3/5），
 * 落库前必须按返回顺序强制重排为 1..N（保持数组顺序，只改编号）。
 */

import { describe, expect, it } from 'vitest'
import { normalizeShotNumbers } from '@core/modules/episode-production/narrative/services/storyboard.service'

describe('normalizeShotNumbers', () => {
  it('跳号输入（2/3/5）→ 重排为 1/2/3，保持数组顺序', () => {
    const input = [
      { shotNumber: 2, frameDescription: 'a' },
      { shotNumber: 3, frameDescription: 'b' },
      { shotNumber: 5, frameDescription: 'c' },
    ]
    const out = normalizeShotNumbers(input)
    expect(out.map((s) => s.shotNumber)).toEqual([1, 2, 3])
    expect(out.map((s) => s.frameDescription)).toEqual(['a', 'b', 'c'])
  })

  it('已连续输入不变', () => {
    const input = [{ shotNumber: 1 }, { shotNumber: 2 }, { shotNumber: 3 }]
    expect(normalizeShotNumbers(input).map((s) => s.shotNumber)).toEqual([1, 2, 3])
  })

  it('乱序 / 重复编号 → 仍按数组顺序重排为 1..N', () => {
    const input = [{ shotNumber: 7 }, { shotNumber: 1 }, { shotNumber: 7 }]
    expect(normalizeShotNumbers(input).map((s) => s.shotNumber)).toEqual([1, 2, 3])
  })

  it('空数组 / 单元素', () => {
    expect(normalizeShotNumbers([])).toEqual([])
    expect(normalizeShotNumbers([{ shotNumber: 42 }])[0].shotNumber).toBe(1)
  })

  it('不修改入参原对象（返回新数组）', () => {
    const input = [{ shotNumber: 9 }]
    const out = normalizeShotNumbers(input)
    expect(input[0].shotNumber).toBe(9)
    expect(out[0]).not.toBe(input[0])
  })
})
