/**
 * kb-chapter-lookup 单测（M3 章节匹配内核）
 * @description 重点回归 review 发现的歧义场景：同名「第一节」在多章下重复出现时，
 *              必须按 chunk 的 sectionPath 父路径消歧，不能张冠李戴。
 */
import { describe, it, expect } from 'vitest'
import {
  buildChapterLookup,
  chapterPathOf,
  matchChapter,
  normalizeChapterTitle,
  parseSectionPath,
} from '@core/platform/services/kb-chapter-lookup'
import type { KbChapterRecord } from '@core/database/repositories/kb-chapter.repository'

function chapter(over: Partial<KbChapterRecord> & { id: string; title: string }): KbChapterRecord {
  return {
    userId: null,
    documentId: 'doc-1',
    knowledgeBaseId: 'kb-1',
    level: 1,
    parentTitle: null,
    parentId: null,
    ordering: 0,
    startOffset: null,
    endOffset: null,
    content: null,
    contentHash: null,
    summary: null,
    summaryStatus: 'pending',
    summaryError: null,
    createdAt: new Date(),
    updatedAt: null,
    ...over,
  }
}

// 两个章下各有一个「第一节 设立」——同名歧义场景
const records: KbChapterRecord[] = [
  chapter({ id: 'c2', title: '第二章 公司登记', ordering: 0 }),
  chapter({ id: 'c2-s1', title: '第一节 设立', level: 2, parentId: 'c2', ordering: 1, summary: '第二章设立摘要' }),
  chapter({ id: 'c5', title: '第五章 股份有限公司', ordering: 2 }),
  chapter({ id: 'c5-s1', title: '第一节 设立', level: 2, parentId: 'c5', ordering: 3, summary: '第五章设立摘要' }),
]

describe('kb-chapter-lookup', () => {
  it('同名章节按 sectionPath 父路径消歧（不张冠李戴）', () => {
    const lookup = buildChapterLookup(records)

    const hit5 = matchChapter(lookup, null, JSON.stringify(['第五章 股份有限公司', '第一节 设立']))
    expect(hit5?.id).toBe('c5-s1')
    expect(hit5?.summary).toBe('第五章设立摘要')

    const hit2 = matchChapter(lookup, null, JSON.stringify(['第二章 公司登记', '第一节 设立']))
    expect(hit2?.id).toBe('c2-s1')
    expect(hit2?.summary).toBe('第二章设立摘要')
  })

  it('仅有标题时退化为标题精确匹配（同名取首个）', () => {
    const lookup = buildChapterLookup(records)
    const hit = matchChapter(lookup, '第一节 设立', null)
    expect(hit?.id).toBe('c2-s1') // 首个同名
  })

  it('章节标题带空白/全角空格差异仍能命中', () => {
    const lookup = buildChapterLookup(records)
    const hit = matchChapter(lookup, '第五章　股份有限公司', null)
    expect(hit?.id).toBe('c5')
  })

  it('包含兜底：chunk.title 是章节标题前缀时命中', () => {
    const lookup = buildChapterLookup(records)
    const hit = matchChapter(lookup, '第二章 公司登记（草案）', null)
    expect(hit?.id).toBe('c2')
  })

  it('无匹配返回 null；空章节表返回 null', () => {
    const lookup = buildChapterLookup(records)
    expect(matchChapter(lookup, '完全无关的标题', null)).toBeNull()
    expect(matchChapter(buildChapterLookup([]), '任何标题', null)).toBeNull()
  })

  it('chapterPathOf 沿 parentId 拼出完整路径', () => {
    const lookup = buildChapterLookup(records)
    const node = lookup.byId.get('c5-s1')!
    expect(chapterPathOf(node, lookup.byId)).toEqual(['第五章 股份有限公司', '第一节 设立'])
    expect(chapterPathOf(lookup.byId.get('c5')!, lookup.byId)).toEqual(['第五章 股份有限公司'])
  })

  it('normalizeChapterTitle / parseSectionPath 边界', () => {
    expect(normalizeChapterTitle('  第 一 章　总则 ')).toBe('第一章总则')
    expect(normalizeChapterTitle(null)).toBe('')
    expect(parseSectionPath('["a","b"]')).toEqual(['a', 'b'])
    expect(parseSectionPath(['x'])).toEqual(['x'])
    expect(parseSectionPath('not-json')).toEqual([])
    expect(parseSectionPath(null)).toEqual([])
  })
})