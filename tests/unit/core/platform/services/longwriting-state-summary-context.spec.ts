/**
 * W2.2 状态摘要链：buildStateSummaryChainContext 纯函数单测
 */
import { describe, expect, it } from 'vitest'
import { buildStateSummaryChainContext } from '@core/platform/services/longwriting/state-summary-context'
import type { ChapterStateSummary } from '@shared/types/longwriting.types'

function mk(chapterNumber: number, overrides: Partial<ChapterStateSummary> = {}): ChapterStateSummary {
  return {
    id: `s${chapterNumber}`,
    projectId: 'p1',
    outlineId: `o${chapterNumber}`,
    chapterNumber,
    storyTime: `第${chapterNumber}日夜`,
    currentLocation: `地点${chapterNumber}`,
    characterStates: `角色A受伤（第${chapterNumber}章）`,
    pendingEvents: `伏笔${chapterNumber}未回收`,
    keyChanges: `变化${chapterNumber}`,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as ChapterStateSummary
}

describe('buildStateSummaryChainContext（W2.2）', () => {
  it('空摘要 → 空串', () => {
    expect(buildStateSummaryChainContext([], 5, 3)).toBe('')
    expect(buildStateSummaryChainContext([mk(7)], 5, 3)).toBe('') // 只有未来章
  })

  it('单条（仅上一章）→ 与旧行为逐字节一致', () => {
    const out = buildStateSummaryChainContext([mk(4)], 5, 3)
    expect(out).toBe(
      '\n\n【重要：前文状态】请确保与上一章结束状态保持一致：\n' +
      '\n【故事时间】第4日夜\n' +
      '\n【当前地点】地点4\n' +
      '\n【角色状态】\n角色A受伤（第4章）\n' +
      '\n【待处理事件/伏笔】\n伏笔4未回收\n' +
      '\n【上一章关键变化】\n变化4\n' +
      '\n【注意事项】\n' +
      '1. 时间线要连续，本章开始时间应从上一章结束时间之后开始\n' +
      '2. 角色状态要与上一章结束状态一致\n' +
      '3. 待处理事件可在本章继续发展或解决\n',
    )
  })

  it('多条 → 更早章节压缩回顾 + 上一章全量格式', () => {
    const out = buildStateSummaryChainContext([mk(2), mk(3), mk(4)], 5, 3)
    expect(out).toContain('【更早章节状态回顾】')
    expect(out).toContain('- 第 2 章：时间第2日夜 · 地点地点2 · 变化：变化2')
    expect(out).toContain('- 第 3 章：时间第3日夜 · 地点地点3 · 变化：变化3')
    // 第 4 章是上一章，走全量格式，不进回顾列表
    expect(out.indexOf('- 第 4 章')).toBe(-1)
    expect(out).toContain('【故事时间】第4日夜')
    expect(out).toContain('【重要：前文状态】')
  })

  it('chainLimit 截断取最近 N 条', () => {
    const out = buildStateSummaryChainContext([mk(1), mk(2), mk(3), mk(4)], 5, 2)
    expect(out).not.toContain('- 第 1 章')
    expect(out).not.toContain('- 第 2 章')
    expect(out).toContain('- 第 3 章')
    expect(out).toContain('【故事时间】第4日夜')
  })

  it('乱序输入也按章号正确取最近 N 条', () => {
    const out = buildStateSummaryChainContext([mk(3), mk(1), mk(4), mk(2)], 5, 2)
    expect(out).toContain('- 第 3 章')
    expect(out).not.toContain('- 第 1 章')
    expect(out).not.toContain('- 第 2 章')
  })

  it('长字段压缩截断', () => {
    const long = '变'.repeat(200)
    const out = buildStateSummaryChainContext([mk(1, { keyChanges: long }), mk(2)], 3, 2)
    expect(out).toContain('变'.repeat(80) + '…')
    expect(out).not.toContain('变'.repeat(120))
  })
})
