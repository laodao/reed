/**
 * 疑点正文定位回填单测（attachConflictLocations）
 * 覆盖：R9 exact 定位/跨章搜索/总量封顶、R1-R8 mention、R10 结构性跳过、
 * outlineId 回填（含未写章节）、无 entityName 不挂 locs。
 */
import { describe, it, expect } from 'vitest'
import { attachConflictLocations, type ConflictItem, type LocChapterSource } from '@core/platform/services/longwriting/graph/consistency.service'

const CH = (number: number, content: string, outlineId = `ol_${number}`): LocChapterSource => ({
  outlineId,
  number,
  title: `第${number}章`,
  content,
})

const CH1 = CH(1, '第一段。阿蘅出现。\n\n第二段阿蘅施针。阿蘅不语。')
const CH2 = CH(2, '别章内容，没有此人。')

function item(partial: Partial<ConflictItem>): ConflictItem {
  return { rule: 'R9', severity: 'warning', message: 'm', ...partial }
}

describe('attachConflictLocations', () => {
  it('R9：按章号定位人名提及，kind=exact，偏移可切回原文', () => {
    const [c] = attachConflictLocations([item({ rule: 'R9', entityName: '阿蘅', chapterNumber: 1 })], [CH1, CH2])
    expect(c.locs).toHaveLength(3)
    expect(c.locs!.every((l) => l.chapterNumber === 1 && l.kind === 'exact')).toBe(true)
    expect(c.locs![0].paragraph).toBe(1)
    expect(c.locs![1].paragraph).toBe(2)
    expect(CH1.content.slice(c.locs![1].start, c.locs![1].end)).toBe('阿蘅')
    expect(c.outlineId).toBe('ol_1')
  })

  it('R9 无章号（v2 跨章人名）：在全部已写章节搜索，总量封顶 5', () => {
    const many = CH(3, Array.from({ length: 8 }, () => '路人甲点头').join('\n\n'), 'ol_3')
    const [c] = attachConflictLocations([item({ rule: 'R9', entityName: '路人甲' })], [CH1, CH2, many])
    expect(c.locs).toHaveLength(5)
    expect(c.locs![0].chapterNumber).toBe(3)
    expect(c.outlineId).toBeUndefined() // 无章号无 outlineId
  })

  it('R1-R8：mention 级（提及处只是导航锚）', () => {
    const [c] = attachConflictLocations(
      [item({ rule: 'R2', entityName: '阿蘅', chapterNumber: 1 })],
      [CH1, CH2],
    )
    expect(c.locs).toHaveLength(3)
    expect(c.locs!.every((l) => l.kind === 'mention')).toBe(true)
  })

  it('R10 跳过：结构上无正文位置，但 outlineId 仍回填', () => {
    const [c] = attachConflictLocations(
      [item({ rule: 'R10', entityName: '阿蘅', chapterNumber: 1, beatText: '下葬' })],
      [CH1, CH2],
    )
    expect(c.locs).toBeUndefined()
    expect(c.outlineId).toBe('ol_1')
  })

  it('目标章未写：不挂 locs，outlineId 照样回填（跳大纲用）', () => {
    const empty = { outlineId: 'ol_4', number: 4, title: '第4章', content: '' }
    const [c] = attachConflictLocations([item({ rule: 'R1', entityName: '阿蘅', chapterNumber: 4 })], [CH1, empty])
    expect(c.locs).toBeUndefined()
    expect(c.outlineId).toBe('ol_4')
  })

  it('无 entityName（R7/R8 类）不挂 locs', () => {
    const [c] = attachConflictLocations([item({ rule: 'R8', chapterNumber: 1 })], [CH1])
    expect(c.locs).toBeUndefined()
  })
})
