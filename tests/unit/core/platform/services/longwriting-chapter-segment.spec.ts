/**
 * W3.1 长章分段：buildChapterSegmentSection 纯函数单测 + 阈值常量护栏
 */
import { describe, expect, it } from 'vitest'
import {
  buildChapterSegmentSection,
  CHAPTER_SEGMENT_THRESHOLD_WORDS,
  CHAPTER_SEGMENT_TARGET_WORDS,
  CHAPTER_SEGMENT_MAX_COUNT,
} from '@core/platform/services/longwriting/chapter-context'

describe('buildChapterSegmentSection（W3.1）', () => {
  it('第一段：不含已生成前文，不收束本章', () => {
    const s = buildChapterSegmentSection(12000, 5, 0, 2400, '')
    expect(s).toContain('第 1 段')
    expect(s).toContain('从正文开头写起')
    expect(s).toContain('不要收束本章')
    expect(s).not.toContain('已生成的前文')
  })

  it('中间段：携带已生成前文 + 禁止重复 + 不收束', () => {
    const s = buildChapterSegmentSection(12000, 5, 2, 2400, '前文第一段。前文第二段。')
    expect(s).toContain('第 3 段')
    expect(s).toContain('【本章已生成的前文】')
    expect(s).toContain('前文第二段。')
    expect(s).toContain('禁止重复或改写已生成内容')
    expect(s).toContain('不要收束本章')
  })

  it('最后一段：要求推进到钩子/卡点收束', () => {
    const s = buildChapterSegmentSection(12000, 5, 4, 2400, '前文。')
    expect(s).toContain('最后一段')
    expect(s).toContain('钩子/卡点')
    expect(s).not.toContain('不要收束本章')
  })

  it('阈值常量护栏：12000 字目标按 2500/段 → 5 段；封顶 8 段', () => {
    expect(CHAPTER_SEGMENT_THRESHOLD_WORDS).toBe(5000)
    expect(Math.ceil(12000 / CHAPTER_SEGMENT_TARGET_WORDS)).toBe(5)
    expect(Math.min(CHAPTER_SEGMENT_MAX_COUNT, Math.ceil(30000 / CHAPTER_SEGMENT_TARGET_WORDS))).toBe(8)
  })
})
