/**
 * 逐章一致性门禁单测（52 号流程闭环）
 * 覆盖：稳定 key、章节号提取、阻断过滤（已登记/未来章节/当章与已写章节）、报错文案。
 */
import { describe, it, expect } from 'vitest'
import {
  conflictKey,
  conflictChapters,
  filterBlockingConflicts,
  buildConflictGateError,
} from '@core/platform/services/longwriting/conflict-gate'

describe('conflictKey', () => {
  it('同字段同消息 → 同 key（重扫不漂移）', () => {
    const a = { rule: 'R8', entityName: '信物', message: '第 1 章埋下未回收' }
    const b = { rule: 'R8', entityName: '信物', message: '第 1 章埋下未回收' }
    expect(conflictKey(a)).toBe(conflictKey(b))
  })

  it('消息不同 → key 不同', () => {
    const a = { rule: 'R8', entityName: '信物', message: '第 1 章埋下未回收' }
    const b = { rule: 'R8', entityName: '信物', message: '第 2 章埋下未回收' }
    expect(conflictKey(a)).not.toBe(conflictKey(b))
  })
})

describe('conflictChapters', () => {
  it('item 字段 + 消息文本合并去重', () => {
    const c = { chapterNumber: 2, message: '「x」第 1 章埋下，已写至第 10 章仍未回收' }
    expect(conflictChapters(c).sort((a, b) => a - b)).toEqual([1, 2, 10])
  })
})

describe('filterBlockingConflicts', () => {
  const conflicts = [
    { rule: 'R6', message: '第 1 章终态，第 2 章恢复', chapterNumber: 2 },
    { rule: 'R8', message: '「x」第 3 章埋下，已写至第 10 章仍未回收' },
    { rule: 'R8', message: '「续篇钩子」第 9 章埋下，已写至第 10 章仍未回收' },
    { rule: 'R9', message: '名册外人名「路人甲」' },
  ]

  it('写第 1 章时：拦引用了第 1 章与无章节引用的，放行纯未来章节的', () => {
    const blocking = filterBlockingConflicts(conflicts, 1, new Set())
    expect(blocking.map((c) => c.rule)).toEqual(['R6', 'R9'])
  })

  it('写第 3 章时：拦 R6/R8(第3章)/R9，不拦只提第9-10章的未来伏笔', () => {
    const blocking = filterBlockingConflicts(conflicts, 3, new Set())
    expect(blocking).toHaveLength(3)
  })

  it('已登记的 key 不再拦截', () => {
    const blockingAll = filterBlockingConflicts(conflicts, 3, new Set())
    const key = conflictKey(blockingAll[0])
    const blocking = filterBlockingConflicts(conflicts, 3, new Set([key]))
    expect(blocking).toHaveLength(blockingAll.length - 1)
  })
})

describe('buildConflictGateError', () => {
  it('无阻断 → null', () => {
    expect(buildConflictGateError(3, [])).toBeNull()
  })

  it('有阻断 → 文案含章号/条数/处理指引', () => {
    const msg = buildConflictGateError(3, [
      { rule: 'R6', message: '第 1 章终态，第 2 章恢复' },
      { rule: 'R8', message: '「x」第 3 章埋下未回收' },
    ])!
    expect(msg).toContain('第 3 章')
    expect(msg).toContain('R6')
    expect(msg).toContain('AI 解题')
    expect(msg).toContain('知情保留')
  })
})
