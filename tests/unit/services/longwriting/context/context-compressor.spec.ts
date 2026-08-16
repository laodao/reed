/**
 * 步骤1 P5：context-compressor 测试（验收 1.4 / 1.6）
 */

import { describe, it, expect } from 'vitest'
import { compressToBudget, applyForcedContext } from '@core/services/longwriting/context/context-compressor'
import type { ContextSection } from '@core/services/longwriting/context/context.types'

function makeItem(id: string, priority: number, content: string, score?: number) {
  return {
    id, type: 'memory' as any, title: id, summary: '', content,
    source: 'sql' as const, included: true, editable: true, priority: priority as any, score,
  }
}

function makeSection(key: string, priority: number, items: any[]): ContextSection {
  return { key, title: key, priority: priority as any, items, tokenEstimate: 0 }
}

describe('compressToBudget（验收 1.4）', () => {
  it('未超预算：全部保留', () => {
    const sections = [makeSection('a', 2, [makeItem('i1', 2, '短内容')])]
    const r = compressToBudget(sections, 1000)
    expect(r[0].items[0].included).toBe(true)
  })

  it('超预算：priority 1-4 必留，11 丢弃', () => {
    const sections = [
      makeSection('char', 2, [makeItem('must', 2, '必留内容'.repeat(50))]),
      makeSection('minor', 11, Array.from({ length: 5 }, (_, i) => makeItem(`m${i}`, 11, '次要'.repeat(20), 0.3 + i * 0.05))),
    ]
    const r = compressToBudget(sections, 100) // 极小预算强制压缩
    // priority 2 必留
    expect(r[0].items[0].included).toBe(true)
    // priority 11 至少有部分被丢（低分先丢）
    const minorIncluded = r[1].items.filter((i) => i.included).length
    expect(minorIncluded).toBeLessThan(5)
  })

  it('超预算：priority 10 background 摘要化（content ≤200字）', () => {
    const longBg = '世界背景'.repeat(200) // 800 字
    const sections = [makeSection('bg', 10, [makeItem('bg1', 10, longBg)])]
    const r = compressToBudget(sections, 100)
    const bg = r[0].items[0]
    // 摘要化后 content 含省略号且 ≤ 201 字
    expect(bg.content.endsWith('…')).toBe(true)
    expect(bg.content.length).toBeLessThanOrEqual(201)
  })

  it('超预算：priority 8/6 按 score 升序丢弃（低分先丢）', () => {
    const sections = [
      makeSection('vec', 8, [
        makeItem('v_low', 8, 'x'.repeat(100), 0.5),
        makeItem('v_high', 8, 'x'.repeat(100), 0.9),
      ]),
    ]
    const r = compressToBudget(sections, 50)
    // 低分先被丢
    const lowIncluded = r[0].items.find((i) => i.id === 'v_low')!.included
    const highIncluded = r[0].items.find((i) => i.id === 'v_high')!.included
    if (highIncluded) expect(lowIncluded).toBe(false)
  })
})

describe('applyForcedContext（验收 1.6）', () => {
  it('exclude → included=false', () => {
    const sections = [makeSection('a', 6, [makeItem('i1', 6, '内容')])]
    applyForcedContext(sections, [{ itemId: 'i1', action: 'exclude' }])
    expect(sections[0].items[0].included).toBe(false)
  })

  it('include → included=true（即使低优先级）', () => {
    const sections = [makeSection('a', 11, [makeItem('i1', 11, '内容', 0.1)])])
    const forcedIds = applyForcedContext(sections, [{ itemId: 'i1', action: 'include' }])
    expect(sections[0].items[0].included).toBe(true)
    expect(forcedIds.has('i1')).toBe(true)
  })

  it('edit → content 替换 + included=true', () => {
    const sections = [makeSection('a', 6, [makeItem('i1', 6, '旧内容')])]
    applyForcedContext(sections, [{ itemId: 'i1', action: 'edit', editedContent: '新内容' }])
    expect(sections[0].items[0].content).toBe('新内容')
    expect(sections[0].items[0].included).toBe(true)
  })

  it('forced include 项不参与压缩', () => {
    const sections = [makeSection('a', 11, [makeItem('i1', 11, 'x'.repeat(200), 0.1)])]
    const forcedIds = applyForcedContext(sections, [{ itemId: 'i1', action: 'include' }])
    const r = compressToBudget(sections, 50, forcedIds)
    // forced include 的 i1 不被压缩
    expect(r[0].items[0].included).toBe(true)
  })
})
