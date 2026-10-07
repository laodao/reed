/**
 * 滚动阅读产线测试：批次规划（字符预算/非叙事剔除/超长截断）、记忆容量截尾、
 * 运行循环（fake LLM + fake 仓储：批次推进、断点续跑、单批失败继续）。
 */
import { describe, it, expect, afterAll } from 'vitest'
import {
  planReadingBatches,
  capMemory,
  KbBookReadingService,
  MAX_MEMORY_CHARS,
} from '@core/platform/services/kb-brain/book-reading.service'
import type { KbChapterRecord } from '@core/database/repositories/kb-chapter.repository'
import type { KbNoteRecord } from '@core/database/repositories/kb-note.repository'

function mkChapter(ordering: number, chars: number, title?: string, parentTitle?: string | null): KbChapterRecord {
  return {
    id: `ch-${ordering}`,
    userId: null,
    documentId: 'doc1',
    knowledgeBaseId: 'kb1',
    title: title ?? `第${ordering}章`,
    level: 2,
    parentTitle: parentTitle ?? null,
    parentId: null,
    ordering,
    startOffset: null,
    endOffset: null,
    content: '字'.repeat(chars),
    contentHash: `hash-${ordering}`,
    summary: null,
    summaryStatus: 'done',
    summaryError: null,
    createdAt: new Date(),
    updatedAt: null,
  }
}

describe('planReadingBatches（批次规划）', () => {
  it('按字符预算切批；批末章为断点锚点', () => {
    const chapters = [mkChapter(1, 10000), mkChapter(2, 10000), mkChapter(3, 10000), mkChapter(4, 5000)]
    const plans = planReadingBatches(chapters, { batchChars: 22000 })
    expect(plans).toHaveLength(2)
    expect(plans[0]!.chapters.map(c => c.ordering)).toEqual([1, 2])
    expect(plans[0]!.last.ordering).toBe(2)
    expect(plans[1]!.chapters.map(c => c.ordering)).toEqual([3, 4])
  })

  it('非叙事章节（版权/简介/评析等）不进批次', () => {
    const chapters = [mkChapter(0, 500, '版权信息'), mkChapter(1, 3000, '序章'), mkChapter(2, 200, '**人物评析：**')]
    const plans = planReadingBatches(chapters, { batchChars: 22000 })
    expect(plans).toHaveLength(1)
    expect(plans[0]!.chapters.map(c => c.ordering)).toEqual([1])
  })

  it('空正文章跳过；超长章截断到单章上限', () => {
    const long = mkChapter(1, 30000)
    const empty = mkChapter(2, 0)
    const plans = planReadingBatches([long, empty, mkChapter(3, 100)], { batchChars: 22000, chapterCap: 12000 })
    expect(plans).toHaveLength(1)
    expect(plans[0]!.texts[0]!.text.length).toBeLessThanOrEqual(12000 + 20)
    expect(plans[0]!.texts).toHaveLength(2)
  })
})

describe('capMemory（记忆容量截尾）', () => {
  it('未超限原样返回', () => {
    const m = '## 卷册结构\n一二三'
    expect(capMemory(m)).toBe(m)
  })

  it('超限从情节进展段开始压缩，头部段落与后续段落保留', () => {
    const big = [
      '## 卷册结构',
      '第一卷 第1-10章',
      '## 世界设定',
      '设定A',
      '## 人物档案',
      '张小凡：主角',
      '## 情节进展',
      ...Array.from({ length: 700 }, (_, i) => `第${i}章 事件事件事件事件事件事件事件事件事件事件`),
      '## 伏笔与悬念',
      '伏笔X（第3章）',
      '## 存疑与待澄清',
      '疑点Y',
    ].join('\n')
    expect(big.length).toBeGreaterThan(MAX_MEMORY_CHARS)
    const capped = capMemory(big, 2000)
    expect(capped.length).toBeLessThanOrEqual(2100)
    expect(capped).toContain('## 卷册结构')
    expect(capped).toContain('## 人物档案')
    expect(capped).toContain('## 伏笔与悬念')
  })
})

describe('KbBookReadingService.run（滚动运行循环）', () => {
  const OLD_ENV = process.env.KB_READING_BATCH_CHARS
  process.env.KB_READING_BATCH_CHARS = '12000'
  afterAll(() => { if (OLD_ENV === undefined) delete process.env.KB_READING_BATCH_CHARS; else process.env.KB_READING_BATCH_CHARS = OLD_ENV })

  interface PassRow {
    passType: string
    passKey: string
    chapterId: string
    chapterHash: string | null
    status: string
    attempts: number
  }

  function makeService(opts: {
    /** 每次调用的记忆响应（循环取值） */
    responses: string[]
    chapters: KbChapterRecord[]
    existingNote?: KbNoteRecord | null
    donePasses?: PassRow[]
  }) {
    const calls: Array<{ memoryChars: number; batchChapters: number }> = []
    let call = 0
    const note: KbNoteRecord = opts.existingNote ?? {
      id: 'note-mem',
      userId: null,
      knowledgeBaseId: 'kb1',
      title: 'mem',
      description: '',
      body: '',
      type: 'reading-memory',
      status: 'published',
      evidence: '[]',
      origin: 'ai-distill',
      version: 1,
      patternSkeleton: null,
      patternInstances: null,
      lensAttention: null,
      classicScore: 0,
      supersededNoteId: null,
      tags: '["doc:doc1"]',
      fsrsStability: null,
      fsrsDifficulty: null,
      lastReviewAt: null,
      reviewCount: 0,
      lapseCount: 0,
      citedCount: 0,
      lastCitedAt: null,
      dueAt: null,
      fsrsState: null,
      createdAt: new Date(),
      updatedAt: null,
    }
    const passes: PassRow[] = opts.donePasses ?? []
    const svc = new KbBookReadingService({
      llm: async req => {
        void req
        calls.push({ memoryChars: 0, batchChapters: 0 })
        const r = opts.responses[Math.min(call, opts.responses.length - 1)]!
        call++
        return r
      },
      repos: () => ({
        chapters: {
          findByDocument: async () => opts.chapters,
        } as never,
        docs: {
          findById: async () => ({ id: 'doc1', name: '诛仙.epub', knowledgeBaseId: 'kb1' }),
        } as never,
        notes: {
          findReadingMemory: async () => note,
          evolveCard: async (_id: string, patch: { body?: string }) => {
            note.body = patch.body ?? note.body
            note.version += 1
            return note
          },
          propose: async () => note,
          publish: async () => note,
        } as never,
        passes: {
          ensurePass: async (input: { chapterId: string; chapterHash: string | null }) => {
            const done = passes.find(
              p =>
                p.passType === 'reading' &&
                p.chapterId === input.chapterId &&
                p.status === 'done' &&
                p.chapterHash === input.chapterHash
            )
            if (done) return { action: 'skip', reason: 'done-same-hash' }
            return {
              action: 'run',
              pass: { id: `pass-${input.chapterId}` },
            }
          },
          setRunning: async () => undefined,
          setDone: async (_id: string, stats: Record<string, number>) => {
            passes.push({
              passType: 'reading',
              passKey: 'reading',
              chapterId: `ch-batch-${passes.length}`,
              chapterHash: null,
              status: 'done',
              attempts: 0,
            })
            void stats
          },
          setFailed: async () => undefined,
        } as never,
      }),
    })
    return { svc, note, calls }
  }

  it('三批推进：记忆逐批更新，结果汇报批数', async () => {
    const chapters = [mkChapter(1, 5000), mkChapter(2, 5000), mkChapter(3, 5000), mkChapter(4, 5000), mkChapter(5, 5000)]
    // 预算 12000 → 批：[1,2] [3,4] [5]
    const { svc, note } = makeService({
      responses: [
        JSON.stringify({ memory: '## 情节进展\n第一批' }),
        JSON.stringify({ memory: '## 情节进展\n第一、二批' }),
        JSON.stringify({ memory: '## 情节进展\n全五章' }),
      ],
      chapters,
    })
    const res = await svc.run('kb1', 'doc1')
    expect(res.batches).toBe(3)
    expect(res.batchesTotal).toBe(3)
    expect(note.body).toContain('全五章')
  })

  it('断点续跑：台账已 done 的批次自动跳过', async () => {
    const chapters = [mkChapter(1, 5000), mkChapter(2, 5000), mkChapter(3, 5000), mkChapter(4, 5000), mkChapter(5, 5000)]
    const { svc, note } = makeService({
      responses: [JSON.stringify({ memory: '## 情节进展\n续跑后完成' })],
      chapters,
      donePasses: [
        { passType: 'reading', passKey: 'reading', chapterId: 'ch-2', chapterHash: 'hash-2', status: 'done', attempts: 0 },
      ],
    })
    // 批[1,2] 的末章 ch-2 已 done-same-hash → 跳过；从批[3,4] 起跑
    const res = await svc.run('kb1', 'doc1')
    expect(res.batches).toBe(3)
    expect(note.body).toContain('续跑后完成')
  })

  it('单批失败（响应缺 memory）→ 记忆保持上一批，继续跑完不炸', async () => {
    const chapters = [mkChapter(1, 5000), mkChapter(2, 5000), mkChapter(3, 5000), mkChapter(4, 5000), mkChapter(5, 5000), mkChapter(6, 5000)]
    const { svc, note } = makeService({
      responses: [
        JSON.stringify({ memory: '## 情节进展\n第一批正常' }),
        '这不是 JSON', // 第二批失败
        JSON.stringify({ memory: '## 情节进展\n第三批恢复' }),
      ],
      chapters,
    })
    const res = await svc.run('kb1', 'doc1')
    expect(res.batches).toBe(3)
    expect(note.body).toContain('第三批恢复')
    expect(note.body).not.toContain('第一批正常')
  })
})
