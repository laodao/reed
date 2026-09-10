/**
 * ChapterGraphProcessor 单测（fake db + fake aiService）
 * 覆盖：事件提取→落库（名称→ID 解析）、状态提取→upsert、自动建边（事件→实体 involves）、章节状态摘要、分步失败容错。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChapterGraphProcessor } from '@core/platform/services/longwriting/graph/chapter-graph.processor'

function makeFakeDb() {
  const eventsStore: any[] = []
  const statesStore: any[] = []
  const edgesStore: any[] = []
  const foreshadowRows: any[] = []
  return {
    eventsStore, statesStore, edgesStore, foreshadowRows,
    lwCharacters: { getByProjectId: vi.fn(async () => [{ id: 'c1', name: '林晓' }, { id: 'c2', name: '顾言' }]) },
    lwLocations: { getByProjectId: vi.fn(async () => [{ id: 'l1', name: '青云宗' }]) },
    lwItems: { getByProjectId: vi.fn(async () => []) },
    lwOutlines: {
      getById: vi.fn(async () => ({ id: 'o1', projectId: 'p1', involvedCharacters: ['c1'], involvedLocations: ['l1'], involvedItems: [] })),
    },
    lwEvents: {
      batchCreate: vi.fn(async (list: any[]) => { const saved = list.map((e, i) => ({ id: `evt-${i}`, ...e })); eventsStore.push(...saved); return saved }),
    },
    lwForeshadows: {
      deleteExtractByChapter: vi.fn(async () => 0),
      createRow: vi.fn(async (pid: string, content: string, planted: number | null, origin: any) => {
        const row = { id: `fb_${foreshadowRows.length + 1}`, projectId: pid, content, plantedChapter: planted, payoffChapter: null, status: 'open', origin: JSON.stringify(origin), createdAt: 1, updatedAt: 1 }
        foreshadowRows.push(row)
        return row
      }),
    },
    lwEntityStates: {
      batchCreate: vi.fn(async (list: any[]) => { const saved = list.map((e, i) => ({ id: `st-${i}`, ...e })); statesStore.push(...saved); return saved }),
    },
    lwGraphEdges: {
      batchCreate: vi.fn(async (list: any[]) => { const saved = list.map((e, i) => ({ id: `edge-${i}`, ...e })); edgesStore.push(...saved); return saved }),
    },
    lwChapterStateSummaries: {
      getLatestBeforeChapter: vi.fn(async () => null),
      upsert: vi.fn(async (data: any) => ({ id: 'css-1', ...data })),
    },
  }
}

function makeFakeAi(over: Record<string, unknown> = {}) {
  return {
    extractChapterForeshadows: vi.fn(async () => ({ success: true, data: [] })),
    extractChapterEvents: vi.fn(async () => ({
      success: true,
      data: [
        { name: '比武大会夺魁', description: '林晓击败宿敌', involvedEntities: [{ type: 'character', name: '林晓' }, { type: 'location', name: '青云宗' }], stateAfter: '林晓扬名' },
      ],
    })),
    extractEntityStates: vi.fn(async () => ({
      success: true,
      data: [
        { entityType: 'character', entityId: 'c1', entityName: '林晓', stateSummary: '夺魁扬名', keyChanges: ['战胜宿敌'] },
        { entityType: 'location', entityId: 'l1', entityName: '青云宗', stateSummary: '大比圆满', keyChanges: ['举办比武大会'] },
      ],
    })),
    extractChapterStateSummary: vi.fn(async () => ({
      success: true,
      data: { storyTime: '第三年春', currentLocation: '青云宗', characterStates: '林晓状态良好', pendingEvents: '', keyChanges: '比武结束' },
    })),
    ...over,
  }
}

describe('ChapterGraphProcessor', () => {
  beforeEach(() => {
    // 评审 #61：内容 hash 缓存跨用例清空，防同内容短路影响断言
    ChapterGraphProcessor.clearContentHashCache()
  })
  it('完整流水线：事件→状态→建边→摘要', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi()
    const proc = new ChapterGraphProcessor(db as any, ai as any)

    const result = await proc.process({
      projectId: 'p1', outlineId: 'o1', chapterContent: '正文...', chapterNumber: 3,
    })

    // 事件落库（涉及实体已解析为 ID）
    expect(result.events).toHaveLength(1)
    expect(db.eventsStore[0].involvedEntities).toEqual([
      { type: 'character', id: 'c1', name: '林晓' },
      { type: 'location', id: 'l1', name: '青云宗' },
    ])
    expect(db.eventsStore[0].chapterNumber).toBe(3)

    // 状态 upsert
    expect(result.states).toHaveLength(2)
    expect(db.statesStore[0].entityId).toBe('c1')

    // 建边：事件→实体 involves
    expect(result.edges).toHaveLength(2)
    expect(db.edgesStore[0]).toMatchObject({ sourceType: 'event', targetType: 'character', targetId: 'c1', relationType: 'involves', validFromChapter: 3 })

    // 章节状态摘要
    expect(db.lwChapterStateSummaries.upsert).toHaveBeenCalledTimes(1)
    expect(db.lwChapterStateSummaries.upsert).toHaveBeenCalledWith(expect.objectContaining({ chapterNumber: 3, storyTime: '第三年春' }))
    expect(result.stateCount).toBe(2)
  })

  it('事件提取失败不影响状态/摘要步骤（分步容错）', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({ extractChapterEvents: vi.fn(async () => ({ success: false, error: 'AI 错误' })) })
    const proc = new ChapterGraphProcessor(db as any, ai as any)

    const result = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 1 })
    expect(result.events).toHaveLength(0)
    expect(result.states).toHaveLength(2) // 状态仍提取（涉及实体来自大纲）
    expect(db.lwChapterStateSummaries.upsert).toHaveBeenCalledTimes(1)
  })

  it('事件涉及未知实体：名称解析失败跳过（不建幽灵边）', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({
      extractChapterForeshadows: vi.fn(async () => ({ success: true, data: [] })),
    extractChapterEvents: vi.fn(async () => ({
        success: true,
        data: [{ name: '神秘事件', involvedEntities: [{ type: 'character', name: '不存在的人' }] }],
      })),
    })
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    const result = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 2 })
    expect(result.events).toHaveLength(1)
    expect(db.eventsStore[0].involvedEntities).toEqual([]) // 未解析的实体被过滤
    expect(result.edges).toHaveLength(0) // 无涉及实体 → 无边
  })

  it('内容未变的二次保存 → 0 次 AI 调用（评审#61 幂等短路）', async () => {
    const ai = makeFakeAi()
    const proc = new ChapterGraphProcessor(makeFakeDb() as any, ai as any)
    const input = { projectId: 'p9', outlineId: 'o1', chapterContent: '固定内容', chapterNumber: 1 }
    const r1 = await proc.process(input)
    expect(r1.events.length).toBeGreaterThan(0)
    const callsAfterFirst = ai.extractChapterEvents.mock.calls.length
    expect(callsAfterFirst).toBe(1)
    // 同章节同内容：短路，不再消耗 AI
    const r2 = await proc.process(input)
    expect(r2.events).toHaveLength(0)
    expect(r2.states).toHaveLength(0)
    expect(ai.extractChapterEvents.mock.calls.length).toBe(1)
    // 内容变化 → 重跑
    await proc.process({ ...input, chapterContent: '内容已修改' })
    expect(ai.extractChapterEvents.mock.calls.length).toBe(2)
  })

  it('空事件 + 空状态：流水线不报错', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({
      extractChapterForeshadows: vi.fn(async () => ({ success: true, data: [] })),
    extractChapterEvents: vi.fn(async () => ({ success: true, data: [] })),
      extractEntityStates: vi.fn(async () => ({ success: true, data: [] })),
    })
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    const result = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '短', chapterNumber: 1 })
    expect(result.events).toHaveLength(0)
    expect(result.states).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })
})


// ==================== 42 号 P1：伏笔提取段 ====================

describe('ChapterGraphProcessor 伏笔提取段（42 号 P1）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ChapterGraphProcessor.clearContentHashCache()
  })

  it('AI 返回伏笔 → 落 lw_foreshadows（origin=extract 带章号）', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({
      extractChapterForeshadows: vi.fn(async () => ({
        success: true,
        data: [{ content: '断剑实为父亲遗物', plantedChapter: 3 }],
      })),
    })
    const proc = new ChapterGraphProcessor(db as never, ai as never)
    const r = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 3 })
    expect(r.foreshadowCount).toBe(1)
    expect(db.foreshadowRows).toHaveLength(1)
    expect(JSON.parse(db.foreshadowRows[0].origin)).toMatchObject({ type: 'extract', chapter: 3 })
  })

  it('伏笔提取失败 → fail-soft：主链路照常（events/states 落库），foreshadowCount=0', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({ extractChapterForeshadows: vi.fn(async () => ({ success: false, error: 'x' })) })
    const proc = new ChapterGraphProcessor(db as never, ai as never)
    const r = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 3 })
    expect(r.foreshadowCount ?? 0).toBe(0)
    expect(db.eventsStore.length).toBeGreaterThan(0)
  })
})
