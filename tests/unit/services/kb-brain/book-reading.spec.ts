/**
 * 滚动阅读产线测试：批次规划（字符预算/非叙事剔除/超长截断）、记忆容量截尾、
 * 运行循环（fake LLM + fake 仓储：批次推进、断点续跑、单批失败继续、
 * 记忆携带/审核拦截/归属校验/竞态守卫——review M9 补断言）。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
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

  it('截尾方向：丢最早情节、保最新情节（review H1 回归）', () => {
    const lines = [
      '## 情节进展',
      ...Array.from({ length: 300 }, (_, i) => `第${i + 1}章 事件事件事件事件事件`),
    ]
    const capped = capMemory(lines.join('\n'), 2000)
    const kept = [...capped.matchAll(/第(\d+)章/g)].map(m => Number(m[1]))
    expect(kept.length).toBeGreaterThan(0)
    expect(Math.max(...kept)).toBe(300) // 最新情节保留
    expect(Math.min(...kept)).toBeGreaterThan(1) // 最早情节先丢
    expect(capped).toContain('更早的情节细节') // 压缩留痕
  })

  it('无「情节进展」标题 → 整体尾部截断兜底，输出不超 cap（review H1 附带①）', () => {
    const big = [
      '## 其他段落',
      ...Array.from({ length: 300 }, (_, i) => `第${i + 1}章 事件事件事件事件事件`),
    ].join('\n')
    const capped = capMemory(big, 2000)
    expect(capped.length).toBeLessThanOrEqual(2000)
    expect(capped).not.toBe(big)
    expect(capped.endsWith('第300章 事件事件事件事件事件')).toBe(true) // 保最新
  })

  it('截断点遇重复空行不重复装填（review H1 附带②）', () => {
    // 头部含空行；情节进展内也有空行，令 cap = 触发空行前累计 size + 200，
    // 截断恰落在与头部重复的空行上——旧实现 indexOf 取首个空行会把已产出区重复装填
    const filler = '事'.repeat(20)
    const lines: string[] = [
      '## 卷册结构',
      `卷一 ${filler}`,
      '', // 首个空行
      `卷二 ${filler}`,
      '## 情节进展',
      `第1章 ${filler}`,
      '', // 与首个空行重复的触发行
    ]
    for (let i = 2; i <= 30; i++) lines.push(`第${i}章 ${filler}`)
    lines.push('## 尾段哨兵', '哨兵内容唯一串')
    let size = 0
    for (let i = 0; i < 6; i++) size += lines[i]!.length + 1
    const cap = size + 200
    const memory = lines.join('\n')
    expect(memory.length).toBeGreaterThan(cap)

    const capped = capMemory(memory, cap)
    const count = (s: string) => capped.split(s).length - 1
    expect(count('## 情节进展')).toBe(1) // 段标题保留且仅一次
    expect(count(`第30章 ${filler}`)).toBe(1) // 最新情节保留且仅一次
    expect(count(`第1章 ${filler}`)).toBeLessThanOrEqual(1)
    expect(capped.length).toBeLessThanOrEqual(cap)
  })
})

describe('KbBookReadingService.run（滚动运行循环）', () => {
  const OLD_ENV = process.env.KB_READING_BATCH_CHARS
  process.env.KB_READING_BATCH_CHARS = '12000'
  afterAll(() => { if (OLD_ENV === undefined) delete process.env.KB_READING_BATCH_CHARS; else process.env.KB_READING_BATCH_CHARS = OLD_ENV })

  /** 与实现同式的整批锚点哈希（review M2） */
  const combinedHash = (hashes: string[]): string =>
    createHash('sha256').update(hashes.join('|')).digest('hex')

  interface PassRow {
    passType: string
    passKey: string
    chapterId: string
    chapterHash: string | null
    status: string
    attempts: number
  }

  function makeService(opts: {
    /** 每次调用的记忆响应（循环取值）；`@error:<msg>` 形态表示抛出该错误 */
    responses: string[]
    chapters: KbChapterRecord[]
    existingNote?: KbNoteRecord | null
    donePasses?: PassRow[]
    /** 文档归属库（review M4 归属校验用例）；缺省 kb1 */
    docKbId?: string
  }) {
    const calls: Array<{ system: string; user: string }> = []
    const ensureInputs: Array<{ chapterId: string; chapterHash: string | null }> = []
    const exhausted: string[] = []
    let call = 0
    let currentAnchor: { chapterId: string; chapterHash: string | null } | null = null
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
    const exhaustedChapterIds = new Set<string>()
    const svc = new KbBookReadingService({
      llm: async req => {
        calls.push({ system: req.system, user: req.user })
        const r = opts.responses[Math.min(call, opts.responses.length - 1)]!
        call++
        if (r.startsWith('@error:')) throw new Error(r.slice(7))
        return r
      },
      repos: () => ({
        chapters: {
          findByDocument: async () => opts.chapters,
        } as never,
        docs: {
          findById: async () => ({
            id: 'doc1',
            name: '诛仙.epub',
            knowledgeBaseId: opts.docKbId ?? 'kb1'
          }),
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
            ensureInputs.push({ chapterId: input.chapterId, chapterHash: input.chapterHash })
            currentAnchor = { chapterId: input.chapterId, chapterHash: input.chapterHash }
            const done = passes.find(
              p =>
                p.passType === 'reading' &&
                p.chapterId === input.chapterId &&
                p.status === 'done' &&
                p.chapterHash === input.chapterHash
            )
            if (done) return { action: 'skip', reason: 'done-same-hash' }
            if (exhaustedChapterIds.has(input.chapterId)) {
              return { action: 'skip', reason: 'exhausted', pass: { id: `pass-${input.chapterId}` } }
            }
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
              chapterId: currentAnchor?.chapterId ?? `ch-batch-${passes.length}`,
              chapterHash: currentAnchor?.chapterHash ?? null,
              status: 'done',
              attempts: 0,
            })
            void stats
          },
          setFailed: async () => undefined,
          markExhausted: async (id: string) => {
            exhausted.push(id)
            exhaustedChapterIds.add(id.replace('pass-', ''))
          },
        } as never,
      }),
    })
    return { svc, note, calls, ensureInputs, exhausted }
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

  it('断点续跑：台账已 done 的批次自动跳过（锚点为整批合成哈希）', async () => {
    const chapters = [mkChapter(1, 5000), mkChapter(2, 5000), mkChapter(3, 5000), mkChapter(4, 5000), mkChapter(5, 5000)]
    const { svc, note } = makeService({
      responses: [JSON.stringify({ memory: '## 情节进展\n续跑后完成' })],
      chapters,
      donePasses: [
        {
          passType: 'reading',
          passKey: 'reading',
          chapterId: 'ch-2',
          chapterHash: combinedHash(['hash-1', 'hash-2']),
          status: 'done',
          attempts: 0
        },
      ],
    })
    // 批[1,2] 的末章 ch-2 已 done-same-hash → 跳过；从批[3,4] 起跑
    const res = await svc.run('kb1', 'doc1')
    expect(res.batches).toBe(3)
    expect(note.body).toContain('续跑后完成')
  })

  it('批内非末章改动 → 锚点哈希失效不误跳（review M2）', async () => {
    const { svc, ensureInputs } = makeService({
      responses: [JSON.stringify({ memory: '## 情节进展\n第一批' })],
      chapters: [mkChapter(1, 5000), mkChapter(2, 5000), mkChapter(3, 2000)],
    })
    await svc.run('kb1', 'doc1')
    expect(ensureInputs[0]!.chapterHash).toBe(combinedHash(['hash-1', 'hash-2', 'hash-3']))
    expect(ensureInputs[0]!.chapterHash).not.toBe('hash-3') // 不再是只哈希批末章
  })

  it('每批请求携带上一批工作记忆（review M9/M3：核心机制零断言→逐批断言）', async () => {
    const chapters = [mkChapter(1, 5000), mkChapter(2, 5000), mkChapter(3, 5000), mkChapter(4, 5000), mkChapter(5, 5000), mkChapter(6, 5000)]
    const { svc, calls } = makeService({
      responses: [
        JSON.stringify({ memory: '## 情节进展\n第一二批记忆标记' }),
        JSON.stringify({ memory: '## 情节进展\n第三四批记忆标记' }),
        JSON.stringify({ memory: '## 情节进展\n全六卷总纲' }),
      ],
      chapters,
    })
    await svc.run('kb1', 'doc1')
    expect(calls).toHaveLength(3)
    expect(calls[1]!.user).toContain('第一二批记忆标记') // 批 2 携带批 1 记忆
    expect(calls[2]!.user).toContain('第三四批记忆标记') // 批 3 携带批 2 记忆
  })

  it('审核拦截批 → markExhausted 封账，续跑不再重撞（review M5）', async () => {
    const chapters = [mkChapter(1, 5000), mkChapter(2, 5000), mkChapter(3, 5000), mkChapter(4, 5000), mkChapter(5, 5000), mkChapter(6, 5000)]
    const { svc, calls, exhausted } = makeService({
      responses: [
        '@error:{"error":{"code":"data_inspection_failed","message":"inappropriate content"}}',
        JSON.stringify({ memory: '## 情节进展\n第二批正常' }),
        JSON.stringify({ memory: '## 情节进展\n第三批正常' }),
      ],
      chapters,
    })
    const res = await svc.run('kb1', 'doc1')
    expect(exhausted).toEqual(['pass-ch-2']) // 批[1,2] 末章 ch-2 被封账
    expect(res.batches).toBe(3)

    // 续跑：封账批 skip 不再调 LLM（仅剩批[5,6] 已 done；前两批 done/跳过）
    const callsBefore = calls.length
    const res2 = await svc.run('kb1', 'doc1')
    expect(res2.batches).toBe(3)
    expect(calls.length).toBe(callsBefore) // 零 LLM 调用
  })

  it('文档不属于该库 → 拒绝运行（review M4）', async () => {
    const { svc } = makeService({
      responses: [JSON.stringify({ memory: 'x' })],
      chapters: [mkChapter(1, 100)],
      docKbId: 'kb-other',
    })
    await expect(svc.run('kb1', 'doc1')).rejects.toThrow('文档不属于该知识库')
  })

  it('并发双发：第二个 run 立即拒绝，不产生并发双跑（review M6）', async () => {
    const { svc, calls } = makeService({
      responses: [JSON.stringify({ memory: '## 情节进展\n唯一一批' })],
      chapters: [mkChapter(1, 5000)],
    })
    const first = svc.run('kb1', 'doc1')
    await expect(svc.run('kb1', 'doc1')).rejects.toThrow('全书精读进行中')
    await first
    expect(calls).toHaveLength(1)
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
