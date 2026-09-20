/**
 * 逐章一致性门禁单测（52 号流程闭环）
 * 覆盖：稳定 key、章节号提取、阻断过滤（已登记/未来章节/当章与已写章节）、报错文案、
 * R10 节拍锚点相似度顺延（2026-09-15：大纲改写后旧保留不失效）、状态标注。
 */
import { describe, it, expect } from 'vitest'
import {
  conflictKey,
  conflictChapters,
  filterBlockingConflicts,
  buildConflictGateError,
  normalizeBeatText,
  beatSimilarity,
  isAcknowledgedConflict,
  annotateConflicts,
  R10_BEAT_SIMILARITY_THRESHOLD,
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

  it('§3c：blocking=false 的节奏提醒（R8 超期）豁免阻断，未标记规则行为不变', () => {
    const withFlag = [
      { rule: 'R8', message: '「x」第 3 章埋下，已写至第 10 章仍未回收', blocking: false },
      { rule: 'R2', message: '第 2 章关系失效', chapterNumber: 2 }, // 未标记 warning：行为必须不变
      { rule: 'R1', message: '角色已死亡', chapterNumber: 1, blocking: true }, // 显式 true：仍阻断
    ]
    const blocking = filterBlockingConflicts(withFlag as never, 3, new Set())
    expect(blocking.map((c) => c.rule)).toEqual(['R2', 'R1'])
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

describe('R10 节拍锚点（2026-09-15 忘川渡：大纲改写后旧保留失效问题）', () => {
  it('normalizeBeatText 去标点/引号/空白', () => {
    expect(normalizeBeatText("口述'方子动过'，不当场定性")).toBe('口述方子动过不当场定性')
  })

  it('beatSimilarity：同一拍补细节改写 → 高相似；换承诺 → 低相似', () => {
    // 大纲修订常见形态：同一拍加前缀细节（overlap 系数取短边，不被拉长稀释）
    const extended = beatSimilarity('逐户核对死而复生者', '夜访临安城核对死而复生者')
    expect(extended).toBeGreaterThanOrEqual(R10_BEAT_SIMILARITY_THRESHOLD)
    expect(beatSimilarity('逐户核对死而复生者', '阿蘅凭药气查篡改')).toBeLessThan(0.1)
    // 剥引号后前后缀差异：口述'方子动过' vs 方子动过 → 完全包含
    expect(beatSimilarity("口述'方子动过'", '方子动过')).toBeGreaterThanOrEqual(R10_BEAT_SIMILARITY_THRESHOLD)
  })

  const conflictOf = (beatText: string, chapterNumber = 2) => ({
    rule: 'R10',
    message: `第 ${chapterNumber} 章大纲承诺「${beatText}」未在正文落点`,
    chapterNumber,
    beatText,
  })

  it('精确 key 命中（所有规则通用）', () => {
    const c = { rule: 'R9', entityName: '周伯通', message: '名册外人名' }
    const rows = [{ key: conflictKey(c), status: 'kept' as const, at: 0 }]
    expect(isAcknowledgedConflict(c, rows)).toBe(true)
    expect(isAcknowledgedConflict({ ...c, message: '换了文案' }, rows)).toBe(false)
  })

  it('大纲改写（措辞变化、key 漂移）→ 保留按锚点顺延', () => {
    const rows = [
      { key: 'R10||2|staleold', rule: 'R10', status: 'kept' as const, at: 0, chapterNumber: 2, beatText: '逐户核对死而复生者' },
    ]
    const rewritten = conflictOf('夜访临安城核对死而复生者')
    expect(conflictKey(rewritten)).not.toBe('R10||2|staleold')
    expect(isAcknowledgedConflict(rewritten, rows)).toBe(true)
  })

  it('换了承诺（相似度低）→ 不顺延，重新拦截', () => {
    const rows = [
      { key: 'R10||2|staleold', rule: 'R10', status: 'kept' as const, at: 0, chapterNumber: 2, beatText: '逐户核对死而复生者' },
    ]
    expect(isAcknowledgedConflict(conflictOf('阿蘅凭药气查篡改'), rows)).toBe(false)
  })

  it('同拍不同章 → 不跨章顺延', () => {
    const rows = [
      { key: 'R10||2|x', rule: 'R10', status: 'kept' as const, at: 0, chapterNumber: 2, beatText: '逐户核对死而复生者' },
    ]
    expect(isAcknowledgedConflict(conflictOf('逐户核对死而复生者', 3), rows)).toBe(false)
  })

  it('filterBlockingConflicts 传保留记录数组：改写的 R10 不拦截', () => {
    const conflicts = [
      conflictOf('夜访临安城核对死而复生者'),
      conflictOf('阿蘅凭药气查篡改'),
    ]
    const rows = [
      { key: 'R10||2|staleold', rule: 'R10', status: 'kept' as const, at: 0, chapterNumber: 2, beatText: '逐户核对死而复生者' },
    ]
    expect(filterBlockingConflicts(conflicts, 3, rows).map((c) => c.beatText)).toEqual(['阿蘅凭药气查篡改'])
  })

  it('annotateConflicts：标注 pending/kept 并带回保留备注', () => {
    const c1 = conflictOf('夜访临安城核对死而复生者')
    const c2 = conflictOf('阿蘅凭药气查篡改')
    const rows = [
      { key: 'R10||2|staleold', rule: 'R10', status: 'kept' as const, note: 'AI 语义复核：已用其他措辞落点', at: 123, chapterNumber: 2, beatText: '逐户核对死而复生者' },
    ]
    const annotated = annotateConflicts([c1, c2], rows)
    expect(annotated[0].status).toBe('kept')
    expect(annotated[0].note).toBe('AI 语义复核：已用其他措辞落点')
    expect(annotated[1].status).toBe('pending')
    expect(annotated[1].note).toBeUndefined()
  })
})
