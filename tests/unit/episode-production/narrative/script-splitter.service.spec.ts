/**
 * script-splitter.service 单测
 * @module tests/unit/episode-production/narrative/script-splitter
 *
 * 验证按章节标记拆分剧本为剧集候选（复用 StructureDetector，零 AI）。
 */

import { describe, it, expect } from 'vitest'
import { analyzeScriptToEpisodes } from '@core/platform/episode-production/narrative/services/script-splitter.service'

describe('analyzeScriptToEpisodes', () => {
  it('中文章节「第X章」→ 每章一集，title/content 正确', () => {
    const text =
      '第一章 开端\n张三走进茶馆坐下。\n\n第二章 冲突\n李四拍桌而起怒视。\n\n第三章 结局\n两人最终握手言和。'
    const r = analyzeScriptToEpisodes(text)
    expect(r.hasStructure).toBe(true)
    expect(r.episodes).toHaveLength(3)
    expect(r.episodes[0].title).toContain('第一章')
    expect(r.episodes[0].content).toContain('张三走进茶馆')
    expect(r.episodes[1].title).toContain('第二章')
    expect(r.episodes[2].title).toContain('第三章')
  })

  it('「第X集」量词识别（剧本常用分集标记）', () => {
    const text = '第一集 开端\n张三走进茶馆坐下。\n\n第二集 冲突\n李四拍桌而起怒视。'
    const r = analyzeScriptToEpisodes(text)
    expect(r.hasStructure).toBe(true)
    expect(r.episodes).toHaveLength(2)
    expect(r.episodes[0].title).toContain('第一集')
    expect(r.episodes[1].title).toContain('第二集')
  })

  it('「第X节/第X回」量词也识别', () => {
    const text = '第一节 起\n内容一足够长的正文。\n\n第二节 承\n内容二足够长的正文。'
    const r = analyzeScriptToEpisodes(text)
    expect(r.hasStructure).toBe(true)
    expect(r.episodes.length).toBeGreaterThanOrEqual(2)
  })

  it('英文章节「Chapter N」→ 每章一集', () => {
    const text =
      'Chapter 1 Begin\nHello world one two three.\n\nChapter 2 Conflict\nHello world four five six.'
    const r = analyzeScriptToEpisodes(text)
    expect(r.hasStructure).toBe(true)
    expect(r.episodes).toHaveLength(2)
    expect(r.episodes[0].title).toContain('Chapter 1')
  })

  it('Markdown # 标题 → 每节一集', () => {
    const text = '# 序章\n开端内容描写。\n\n# 正篇\n高潮内容描写。'
    const r = analyzeScriptToEpisodes(text)
    expect(r.hasStructure).toBe(true)
    expect(r.episodes.length).toBeGreaterThanOrEqual(2)
    expect(r.episodes[0].title).toContain('序章')
  })

  it('无章节标记的连续长文 → hasStructure:false、episodes:[]', () => {
    const text =
      '这是一段没有章节标记的连续文字，只是不停地写下去，没有任何第一章第二章之类的标记，也不会被识别为有结构。'
    const r = analyzeScriptToEpisodes(text)
    expect(r.hasStructure).toBe(false)
    expect(r.episodes).toEqual([])
  })

  it('content 含章节标题行（供后续剧本 stage 保留章节语境）', () => {
    const text = '第一章 开端\n张三走进茶馆坐下。\n\n第二章 冲突\n李四拍桌而起怒视。'
    const r = analyzeScriptToEpisodes(text)
    expect(r.episodes[0].content).toMatch(/第一章/)
  })
})
