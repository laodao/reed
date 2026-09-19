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
    lwCustomEntities: {
      getByProjectAndKind: vi.fn(async () => []),
      createRow: vi.fn(async (_pid: string, kind: string, name: string) => ({ id: `bce-${name}`, kindKey: kind, name })),
      deleteRow: vi.fn(async () => true),
    },
    lwLocations: { getByProjectId: vi.fn(async () => [{ id: 'l1', name: '青云宗' }]) },
    lwItems: { getByProjectId: vi.fn(async () => []) },
    lwOutlines: {
      getById: vi.fn(async () => ({ id: 'o1', projectId: 'p1', involvedCharacters: ['c1'], involvedLocations: ['l1'], involvedItems: [] })),
    },
    lwEvents: {
      batchCreate: vi.fn(async (list: any[]) => { const saved = list.map((e, i) => ({ id: `evt-${i}`, ...e })); eventsStore.push(...saved); return saved }),
      // 清理步骤（复核修复后位于提取成功之后）
      listByChapter: vi.fn(async () => [...eventsStore]),
      deleteByChapter: vi.fn(async () => { const n = eventsStore.length; eventsStore.length = 0; return n }),
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
      deleteBySourceEventIds: vi.fn(async () => 0),
      // 44 号关系演变步骤的重跑幂等清理（fake 之前缺失，该步恒静默失败）
      deleteByOriginChapter: vi.fn(async () => 0),
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
    // 44 号关系演变（fake 之前缺失 → 该步恒静默失败；hash 聚合后必须补齐才能走"全成功"分支）
    extractChapterRelationChanges: vi.fn(async () => ({ success: true, data: [] })),
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
    expect(result.edges).toHaveLength(0) // 52 号：involves 边由 getGraph 从 JSON 推导，处理器不再写边副本
    expect(db.edgesStore).toHaveLength(0)

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

  it('事件涉及未知实体：进未登记队列，正文共现补链挂真实实体（52 号，不建幽灵边）', async () => {
    const db = makeFakeDb()
    // 正文里出现名册内的「林晓」与名册外的「李三」——模型只提案了未知实体
    const ai = makeFakeAi({
      extractChapterForeshadows: vi.fn(async () => ({ success: true, data: [] })),
    extractChapterEvents: vi.fn(async () => ({
        success: true,
        data: [{ name: '李三遇害', involvedEntities: [{ type: 'character', name: '不存在的人' }] }],
      })),
    })
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    const content = '林晓赶到现场时，李三已经断了气。'
    const result = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: content, chapterNumber: 2 })
    expect(result.events).toHaveLength(1)
    // 「不存在的人」未解析不挂；共现补链把正文同句的名册实体「林晓」挂上（解析过的真实 ID，非幽灵边）
    const linked = db.eventsStore[0].involvedEntities.map((e: any) => e.name)
    expect(linked).toContain('林晓')
    expect(linked).not.toContain('不存在的人')
    // 名册外的「李三」进未登记队列（R9 数据源）
    expect(db.lwCustomEntities.getByProjectAndKind).toHaveBeenCalledWith('p1', '未登记人物')
  })

  it('内容未变的二次保存 → 0 次 AI 调用（评审#61 幂等短路）', async () => {
    const ai = makeFakeAi()
    const proc = new ChapterGraphProcessor(makeFakeDb() as any, ai as any)
    const input = { projectId: 'p9-unchanged-test', outlineId: 'o1', chapterContent: '固定内容', chapterNumber: 1 }
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

  it('复核修复：全部步骤成功才记 hash（失败步骤不短路，下次保存重跑）', async () => {
    const db = makeFakeDb()
    // 状态提取抛错 → failedSteps 非空 → hash 不记录
    const ai = makeFakeAi({
      extractEntityStates: vi.fn(async () => { throw new Error('状态提取炸了') }),
    })
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    const input = { projectId: 'p-fail', outlineId: 'o1', chapterContent: '同内容', chapterNumber: 1 }
    const r1 = await proc.process(input)
    expect(r1.failedSteps).toContain('状态切片')
    // 内容未变但 hash 未记录 → 再次保存会重跑（旧实现会永久短路）
    await proc.process(input)
    expect(ai.extractChapterEvents.mock.calls.length).toBe(2)
  })

  it('复核修复：提取失败时旧事件保留（清理移至提取成功之后）', async () => {
    const db = makeFakeDb()
    db.eventsStore.push({ id: 'old-evt', projectId: 'p1', name: '旧事件', chapterNumber: 4 })
    const ai = makeFakeAi({
      extractChapterEvents: vi.fn(async () => { throw new Error('提取超时') }),
    })
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 4 })
    // 提取失败：旧事件不被清理（旧实现先删后提取，失败即丢）
    expect(db.eventsStore.some((e: any) => e.id === 'old-evt')).toBe(true)
    // 提取成功时才清理：旧事件被删、新事件落库
    const db2 = makeFakeDb()
    db2.eventsStore.push({ id: 'old-evt', projectId: 'p1', name: '旧事件', chapterNumber: 4 })
    const proc2 = new ChapterGraphProcessor(db2 as any, makeFakeAi() as any)
    await proc2.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 4 })
    expect(db2.eventsStore.some((e: any) => e.id === 'old-evt')).toBe(false)
    expect(db2.eventsStore.length).toBeGreaterThan(0)
  })
})


// ==================== 空转防线 + 全要素覆盖（2026-09-19 写后审查数据面加固） ====================

describe('ChapterGraphProcessor 空转防线与全要素覆盖（2026-09-19）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ChapterGraphProcessor.clearContentHashCache()
  })

  it('事件提取空产物：重试一次仍空 → failedSteps 记录 + 旧事件保留', async () => {
    const db = makeFakeDb()
    db.eventsStore.push({ id: 'old-evt', projectId: 'p1', name: '旧事件', chapterNumber: 4 })
    const ai = makeFakeAi({
      extractChapterEvents: vi.fn(async () => ({ success: true, data: [] })),
    })
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    const r = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 4 })
    expect(r.failedSteps).toContain('事件提取')
    expect(ai.extractChapterEvents).toHaveBeenCalledTimes(2)
    // 空产物与提取失败同口径：旧数据不被清理
    expect(db.eventsStore.some((e: any) => e.id === 'old-evt')).toBe(true)
  })

  it('事件提取解析假成功（data 非数组）：重试一次仍失败 → failedSteps 记录（ep11 事故回归）', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({
      extractChapterEvents: vi.fn(async () => ({ success: true, data: '不是数组的原始文本' as any })),
    })
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    const r = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 1 })
    expect(r.failedSteps).toContain('事件提取')
    expect(ai.extractChapterEvents).toHaveBeenCalledTimes(2)
  })

  it('章节状态摘要空产物：重试一次仍不可用 → failedSteps 记录（ep8 事故回归）', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({
      extractChapterStateSummary: vi.fn(async () => ({
        success: true,
        data: { storyTime: '', currentLocation: '', characterStates: '', pendingEvents: '', keyChanges: '' },
      })),
    })
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    const r = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 2 })
    expect(r.failedSteps).toContain('章节状态摘要')
    expect(ai.extractChapterStateSummary).toHaveBeenCalledTimes(2)
  })

  it('事件 storyTime 透传落库', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({
      extractChapterEvents: vi.fn(async () => ({
        success: true,
        data: [{ name: '州桥夜市救人', storyTime: '二更天', involvedEntities: [{ type: 'character', name: '林晓' }] }],
      })),
    })
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '林晓在州桥救人', chapterNumber: 3 })
    expect(db.eventsStore[0].storyTime).toBe('二更天')
  })

  it('全要素覆盖：名册内实体正文命中即纳入状态提取（不依赖大纲/事件挂载）', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi()
    const proc = new ChapterGraphProcessor(db as any, ai as any)
    // 顾言在大纲与事件里都没挂载，只在本章正文出现
    await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '林晓与顾言在青云宗重逢，旧怨未消。', chapterNumber: 3 })
    const involvedArg = ai.extractEntityStates.mock.calls[0][5] as Array<{ name: string }>
    const names = involvedArg.map((e) => e.name)
    expect(names).toContain('顾言')
    expect(names).toContain('林晓')
    expect(names).toContain('青云宗')
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


// ==================== 44 号：人物关系演变提取段 ====================

import { GraphService } from '@core/platform/services/longwriting/graph/graph.service'

/** 带边存储/演变原语的 fake db（在 makeFakeDb 基础上扩 lwGraphEdges） */
function makeDbWithEdges() {
  const db = makeFakeDb() as ReturnType<typeof makeFakeDb> & { lwGraphEdges: any }
  const rawEdges: Array<any> = []
  db.rawEdges = rawEdges
  db.lwGraphEdges = {
    ...db.lwGraphEdges,
    create: vi.fn(async (data: any) => {
      const saved = { id: `edge-new-${rawEdges.length + 1}`, ...data }
      rawEdges.push(saved)
      return saved
    }),
    getByProjectId: vi.fn(async () =>
      rawEdges.map((e) => ({
        ...e,
        origin: e.origin ? JSON.parse(e.origin) : undefined,
      })),
    ),
    endRelation: vi.fn(async (id: string, chapter: number) => {
      const e = rawEdges.find((x) => x.id === id)
      if (e) e.validUntilChapter = chapter
      return e ?? null
    }),
    deleteByOriginChapter: vi.fn(async (_pid: string, chapter: number) => {
      let n = 0
      for (let i = rawEdges.length - 1; i >= 0; i--) {
        const o = rawEdges[i].origin ? JSON.parse(rawEdges[i].origin) : null
        if (o?.type === 'extract' && o?.chapter === chapter) {
          rawEdges.splice(i, 1)
          n++
        }
      }
      return n
    }),
  }
  return db
}

describe('ChapterGraphProcessor 关系演变提取段（44 号）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ChapterGraphProcessor.clearContentHashCache()
  })

  it('changed 演变 → 关旧边 + 开新边（origin=extract 带章号）', async () => {
    const db = makeDbWithEdges()
    // 演变前事实：林晓↔顾言 师徒
    db.rawEdges.push({ id: 'e-old', projectId: 'p1', sourceType: 'character', sourceId: 'c1', targetType: 'character', targetId: 'c2', relationType: '师徒', validFromChapter: 1 })
    const ai = makeFakeAi({
      extractChapterRelationChanges: vi.fn(async () => ({
        success: true,
        data: [{ changeType: 'changed', sourceName: '林晓', targetName: '顾言', relationType: '师徒', newRelationType: '敌对', description: '顾言叛出师门' }],
      })),
    })
    const proc = new ChapterGraphProcessor(db as never, ai as never)
    const r = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 5 })

    expect(r.relationChangeCount).toBe(2) // 关旧 1 + 开新 1
    const old = db.rawEdges.find((e) => e.id === 'e-old')
    expect(old.validUntilChapter).toBe(5)
    const created = db.rawEdges.filter((e) => e.relationType === '敌对')
    expect(created).toHaveLength(1)
    expect(created[0].validFromChapter).toBe(5)
    expect(created[0].origin).toMatchObject({ type: 'extract', chapter: 5 })
  })

  it('提取失败 → fail-soft：主链路照常，relationChangeCount=0', async () => {
    const db = makeDbWithEdges()
    const ai = makeFakeAi({ extractChapterRelationChanges: vi.fn(async () => ({ success: false, error: 'x' })) })
    const proc = new ChapterGraphProcessor(db as never, ai as never)
    const r = await proc.process({ projectId: 'p1', outlineId: 'o1', chapterContent: '正文', chapterNumber: 2 })
    expect(r.relationChangeCount ?? 0).toBe(0)
    expect(db.eventsStore.length).toBeGreaterThan(0)
  })

  it('applyRelationChanges：名称解析失败计入 unresolved，不落边', async () => {
    const db = makeDbWithEdges()
    const graph = new GraphService(db as never)
    const r = await graph.applyRelationChanges(
      'p1',
      [{ changeType: 'new', sourceName: '不存在的人', targetName: '林晓', relationType: '盟友' }],
      4,
    )
    expect(r.unresolved).toBe(1)
    expect(r.created).toBe(0)
  })
})
