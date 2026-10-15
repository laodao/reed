// @vitest-environment happy-dom
/**
 * 剧集制作项目 tab 标题截断（epTabTitleOf）单测
 * @module tests/unit/renderer/episode-production/tab-title.spec
 *
 * 背景（2026-10-14 用户需求）：点项目打开的 tab 标题应显示项目名而非统一的
 * 「剧集制作」，且超 6 字截断加省略号（tab 宽度有限）。首页/项目列表/导入卡的
 * preloadTab 与工作台、创建页自身的 updateTabTitle 共用这一份口径，这里钉死截断规则。
 */

import { describe, it, expect } from 'vitest'
import { epTabTitleOf } from '../../../../src/renderer/src/views/episode-production-ui'

describe('epTabTitleOf（剧集制作项目 tab 标题）', () => {
  it('≤6 字原样显示', () => {
    expect(epTabTitleOf('都市重生')).toBe('都市重生')
    expect(epTabTitleOf('都市重生之')).toBe('都市重生之')
  })

  it('超 6 字截断为前 6 字 + 省略号', () => {
    expect(epTabTitleOf('都市重生之风云再起')).toBe('都市重生之风...')
    expect(epTabTitleOf('仙逆（修仙长篇）')).toBe('仙逆（修仙长...')
    expect(epTabTitleOf('abcdefgh')).toBe('abcdef...')
  })

  it('空名兜底回默认 tab 标题', () => {
    expect(epTabTitleOf('')).toBe('剧集制作')
    expect(epTabTitleOf('   ')).toBe('剧集制作')
    expect(epTabTitleOf(null)).toBe('剧集制作')
    expect(epTabTitleOf(undefined)).toBe('剧集制作')
  })

  it('首尾空白先裁剪再计数', () => {
    expect(epTabTitleOf('  都市重生  ')).toBe('都市重生')
    expect(epTabTitleOf(' 都市重生之风云再起 ')).toBe('都市重生之风...')
  })
})
