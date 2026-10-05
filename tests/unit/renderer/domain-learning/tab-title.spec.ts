// @vitest-environment happy-dom
/**
 * 学习空间 tab 标题截断（tabTitleOf）单测
 * @module tests/unit/renderer/domain-learning/tab-title.spec
 *
 * 背景（2026-10-05 用户需求）：点主题打开的空间 tab 标题应显示主题名而非统一的
 * 「领域学习空间」，且超 6 字截断加省略号（tab 宽度有限）。Home/Atlas/跨主题跳转的
 * preloadTab 与空间页自身的 updateTabTitle 共用这一份口径，这里钉死截断规则。
 */

import { describe, it, expect } from 'vitest'
import { tabTitleOf } from '../../../../src/renderer/src/views/domain-learning/domain-learning-ui'

describe('tabTitleOf（学习空间 tab 标题）', () => {
  it('≤6 字原样显示', () => {
    expect(tabTitleOf('量子计算')).toBe('量子计算')
    expect(tabTitleOf('量子计算入门')).toBe('量子计算入门')
  })

  it('超 6 字截断为前 6 字 + 省略号', () => {
    expect(tabTitleOf('量子计算入门课')).toBe('量子计算入门...')
    expect(tabTitleOf('高等数学（考研全程班）')).toBe('高等数学（考...')
    expect(tabTitleOf('abcdefg')).toBe('abcdef...')
  })

  it('空名兜底回默认 tab 标题', () => {
    expect(tabTitleOf('')).toBe('领域学习空间')
    expect(tabTitleOf('   ')).toBe('领域学习空间')
    expect(tabTitleOf(null)).toBe('领域学习空间')
    expect(tabTitleOf(undefined)).toBe('领域学习空间')
  })

  it('首尾空白先裁剪再计数', () => {
    expect(tabTitleOf('  量子计算  ')).toBe('量子计算')
    expect(tabTitleOf(' 量子计算入门课 ')).toBe('量子计算入门...')
  })
})
