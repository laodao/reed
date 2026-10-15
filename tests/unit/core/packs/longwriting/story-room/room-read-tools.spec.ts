/**
 * 研讨室读工具单测（09-15 缺口修复）：lw_query_bible / lw_query_outline / lw_query_chapter
 * @module tests/unit/core/packs/longwriting/story-room/room-read-tools.spec
 *
 * 读工具统一路由 BibleQueryService（与设定集面板同一读模型）。断言：
 * - lw_query_bible 列表覆盖 概要/世界背景/人物/故事线/自定义分类/事件（此前
 *   故事线与世界背景无任何读工具）；伏笔按 includeForeshadows 开关；
 * - lw_query_bible 单条详情：人物富字段（外貌/性格…schema 缺失也不丢）+
 *   演进时间线（状态/事件/关系，关系支持章节锚点过滤）+ 故事线按标题可查
 *   且涉及人物解析为名称；歧义与未找到路径；
 * - lw_query_outline 目录（章号/id/120 字摘要）与 node 详情（概要全文/出场
 *   人物/写作状态字数）；
 * - lw_query_chapter 未写/缺省「开头+结尾」视图/offset 窗口翻页（注册表对结果
 *   单字段有 2000 字硬截断，窗口预算据此设计）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { registerLwRoomTools } from '@core/packs/longwriting/story-room/room-agent-tools'

vi.mock('@core/database/database-manager.interface', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCoreDatabaseManager: () => (globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb,
}))

// ==================== 假 db ====================

const CHAR_SCHEMA = JSON.stringify([
  { key: 'name', label: '姓名', type: 'text' },
  { key: 'aliases', label: '别名', type: 'tags' },
  { key: 'occupation', label: '身份', type: 'text' },
  { key: 'appearance', label: '外貌', type: 'textarea' },
  { key: 'personality', label: '性格', type: 'textarea' },
])

const KINDS = [
  { key: 'overview', label: '概要', storage: 'entity', entityRepo: 'lwStoryOverviews', fieldsSchema: null },
  { key: 'character', label: '人物', storage: 'entity', entityRepo: 'lwCharacters', fieldsSchema: CHAR_SCHEMA },
  { key: 'plot', label: '故事线', storage: 'entity', entityRepo: 'lwPlots', fieldsSchema: null },
  { key: 'outline', label: '大纲', storage: 'entity', entityRepo: 'lwOutlines', fieldsSchema: null },
  { key: 'faction', label: '门派', storage: 'entity', entityRepo: 'lwFactions', fieldsSchema: null },
  { key: 'skill', label: '武功', storage: 'entity', entityRepo: 'lwSkills', fieldsSchema: null },
  { key: 'item', label: '物品', storage: 'entity', entityRepo: 'lwItems', fieldsSchema: null },
  { key: 'location', label: '地点', storage: 'entity', entityRepo: 'lwLocations', fieldsSchema: null },
  { key: 'nation', label: '国别', storage: 'custom', entityRepo: null, fieldsSchema: JSON.stringify([{ key: 'name', label: '国名', type: 'text' }, { key: 'stance', label: '立场', type: 'text' }]) },
]

const LONG_SUMMARY = `${'林家满门被灭，少年林晓在雨夜中幸存。'.repeat(8)}断剑秘闻唯他知晓。`

function makeFakeDb() {
  const characters = [
    { id: 'c1', name: '林晓', aliases: ['晓哥'], gender: 'male', age: 25, occupation: '外门弟子', rolePosition: 'protagonist', appearance: '青衫长剑', background: '山村孤儿', personality: '坚韧', abilities: '基础剑法', majorEvents: '' },
    { id: 'c2', name: '顾长风', gender: 'male', age: 40, occupation: '掌门', personality: '沉稳' },
    { id: 'c3', name: '林平之', gender: 'male', occupation: '江湖客' },
  ]
  const plots = [
    { id: 'pl1', title: '复仇线', summary: '灭门→查真相→雪恨', notes: '贯穿全书', involvedCharacters: ['c1'], involvedLocations: [], plotOrder: 0 },
    { id: 'pl2', title: '权谋线', summary: '朝堂之争', involvedCharacters: [], involvedLocations: [], plotOrder: 1 },
  ]
  const outlines = [
    { id: 'v1', parentId: null, nodeType: 'volume', name: '第一卷 风起', orderIndex: 0, summary: '主角入门' },
    { id: 'o1', parentId: 'v1', nodeType: 'chapter', name: '第一章 夜雨', orderIndex: 0, summary: LONG_SUMMARY, involvedCharacters: ['c1'], involvedLocations: ['l1'], involvedItems: [], estimatedWords: 2000 },
    { id: 'o2', parentId: 'v1', nodeType: 'chapter', name: '第二章 入门', orderIndex: 1, summary: '拜入青云', involvedCharacters: [], involvedLocations: [], involvedItems: [] },
  ]
  const chapterContent = `HEAD雨夜屠村。${'中段情节。'.repeat(900)}TAIL天明了。`
  const chaptersByOutline = new Map<string, { id: string; outlineId: string; content: string }>([
    ['o1', { id: 'ch1', outlineId: 'o1', content: chapterContent }],
  ])

  const db = {
    lwBibleKinds: { getEnabled: async () => KINDS },
    lwProjects: { getById: async () => ({ id: 'p1', name: 'x', wizardState: {} }) },
    lwStoryOverviews: { getByProjectId: async () => [{ id: 'ov1', title: '洗冤录', storyType: '武侠', summary: '少年洗冤复仇', coreConflict: '个人恩怨 vs 朝堂阴谋' }] },
    lwCharacters: { getByProjectId: async () => characters, getById: async (id: string) => characters.find((c) => c.id === id) ?? null },
    lwPlots: { getByProjectId: async () => plots, getById: async (id: string) => plots.find((p) => p.id === id) ?? null },
    lwOutlines: {
      getByProjectId: async () => [...outlines].sort((a, b) => a.orderIndex - b.orderIndex),
      getTreeByProjectId: async () => outlines,
      getById: async (id: string) => outlines.find((o) => o.id === id) ?? null,
    },
    lwLocations: { getByProjectId: async () => [{ id: 'l1', name: '青云山', description: '门派所在地' }], getById: async () => null },
    lwFactions: { getByProjectId: async () => [{ id: 'f1', name: '青云门', description: '正道魁首' }] },
    lwSkills: { getByProjectId: async () => [] },
    lwItems: { getByProjectId: async () => [{ id: 'i1', name: '断剑', description: '父亲遗物' }] },
    lwBackgrounds: { getByProjectId: async () => ({ id: 'b1', eraDescription: '类古代架空王朝', specialRules: '武功分九品', techLevel: '冷兵器' }) },
    lwCustomEntities: {
      getByProjectAndKind: async (_pid: string, kindKey: string) =>
        kindKey === 'nation' ? [{ id: 'n1', name: '大周王朝', fields: { stance: '中立', ruler: '景和帝', note: '分封诸侯' }, origin: null }] : [],
    },
    lwForeshadows: {
      getByProjectId: async () => [{ id: 'fb1', content: '断剑其实是父亲遗物', plantedChapter: 1, payoffChapter: null, status: 'open', origin: null }],
    },
    lwEvents: {
      getByProjectId: async () => [
        { id: 'e1', chapterNumber: 1, name: '灭门', description: '林家被灭', state: 'happened', involvedEntities: [{ type: 'character', id: 'c1' }] },
      ],
    },
    lwEntityStates: {
      getByProjectId: async () => [
        { entityType: 'character', entityId: 'c1', chapterNumber: 1, stateSummary: '负伤', keyChanges: '灭门负伤', entityName: '林晓' },
      ],
    },
    lwGraphEdges: {
      getByEntity: async (_pid: string, type: string, id: string) =>
        type === 'character' && id === 'c1' ? [{ targetName: '顾长风', relationType: '师徒', validFromChapter: 2, validUntilChapter: null }] : [],
    },
    lwChapters: {
      getByOutlineId: async (outlineId: string) => chaptersByOutline.get(outlineId) ?? null,
      getByOutlineIds: async (ids: string[]) => new Map(ids.map((id) => [id, chaptersByOutline.get(id)]).filter(([, v]) => v)),
    },
  }
  return { db, chapterContent }
}

// ==================== 装配 ====================

function getTool(name: string): AgentToolDef {
  const registry = new AgentToolRegistry()
  registerLwRoomTools(registry)
  const defs = registry.buildToolDefs([{ tool: name } as never])
  const def = defs[name]
  if (!def) throw new Error(`工具未注册：${name}`)
  return def
}

const ctx = { logContext: { projectId: 'p1' } } as never

/** 注册表管线把工具原始返回包在 outer.data 里（外层 ok 恒 true，业务语义在 raw.ok）——
 *  这里解包还原工具自身返回：{ ok, data, error } */
async function run(name: string, input: unknown) {
  const outer = (await getTool(name).execute(input, ctx)) as { data?: Record<string, unknown> }
  const raw = (outer.data ?? {}) as { ok?: boolean; data?: Record<string, unknown>; error?: unknown }
  return {
    ok: raw.ok !== false,
    data: (raw.data ?? {}) as Record<string, unknown>,
    error: typeof raw.error === 'string' ? raw.error : String(raw.error ?? ''),
  }
}

describe('lw_query_bible（统一读模型）', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = makeFakeDb().db
  })

  it('all 列表覆盖 概要/世界背景/人物/故事线/自定义分类/事件，不含大纲与伏笔', async () => {
    const r = await run('lw_query_bible', { query: {} })
    expect(r.ok).toBe(true)
    const text = String(r.data?.text)
    expect(text).toContain('【概要】洗冤录')
    expect(text).toContain('类古代架空王朝')
    expect(text).toContain('武功分九品')
    expect(text).toContain('林晓(c1)：外门弟子')
    expect(text).toContain('复仇线(pl1)：灭门→查真相→雪恨')
    expect(text).toContain('大周王朝')
    expect(text).toContain('【事件】')
    // 大纲走专用工具；伏笔按开关
    expect(text).not.toContain('第一卷 风起')
    expect(text).not.toContain('断剑其实是父亲遗物')
  })

  it('includeForeshadows 附带待回收伏笔；type=world 给全量背景', async () => {
    const r = await run('lw_query_bible', { query: { includeForeshadows: true } })
    expect(String(r.data?.text)).toContain('【待回收伏笔】')

    const w = await run('lw_query_bible', { query: { type: 'world' } })
    const wText = String(w.data?.text)
    expect(wText).toContain('【世界背景】')
    expect(wText).toContain('青云山')
    expect(wText).not.toContain('林晓(c1)')
  })

  it('type=plot 只列故事线', async () => {
    const r = await run('lw_query_bible', { query: { type: 'plot' } })
    const text = String(r.data?.text)
    expect(text).toContain('复仇线')
    expect(text).toContain('权谋线')
    expect(text).not.toContain('林晓(c1)')
  })

  it('人物详情：富字段（schema 标签）+ 状态演进/事件/关系时间线', async () => {
    const r = await run('lw_query_bible', { query: { name: '林晓' } })
    expect(r.data?.found).toBe(true)
    const text = String(r.data?.text)
    expect(text).toContain('【林晓】人物 · id=c1')
    expect(text).toContain('别名：晓哥')
    expect(text).toContain('身份：外门弟子')
    expect(text).toContain('外貌：青衫长剑')
    expect(text).toContain('性格：坚韧')
    expect(text).toContain('状态演进：第1章 负伤')
    expect(text).toContain('第1章 灭门')
    expect(text).toContain('顾长风：师徒（自第2章）')
  })

  it('别名可查；章节锚点过滤掉未生效关系', async () => {
    const byAlias = await run('lw_query_bible', { query: { name: '晓哥' } })
    expect(String(byAlias.data?.text)).toContain('【林晓】')

    const anchored = await run('lw_query_bible', { query: { name: '林晓', chapter: 1 } })
    expect(String(anchored.data?.text)).not.toContain('顾长风')
  })

  it('故事线按标题查：全字段 + 涉及人物解析为名称', async () => {
    const r = await run('lw_query_bible', { query: { type: 'plot', name: '复仇线' } })
    expect(r.data?.found).toBe(true)
    const text = String(r.data?.text)
    expect(text).toContain('概要：灭门→查真相→雪恨')
    expect(text).toContain('备注：贯穿全书')
    expect(text).toContain('涉及人物：林晓')
  })

  it('未找到与多命中歧义', async () => {
    const miss = await run('lw_query_bible', { query: { name: '独孤求败' } })
    expect(miss.data?.found).toBe(false)

    const amb = await run('lw_query_bible', { query: { name: '林' } })
    expect(amb.data?.found).toBe(false)
    const ambList = amb.data?.ambiguous as string[]
    expect(ambList).toHaveLength(2)
    expect(ambList.join('、')).toContain('林晓')
    expect(ambList.join('、')).toContain('林平之')
  })
})

describe('lw_query_outline（目录 + 节点详情）', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = makeFakeDb().db
  })

  it('目录：文档序章号 + id，概要截断 120', async () => {
    const r = await run('lw_query_outline', {})
    const text = String(r.data?.text)
    expect(text).toContain('【卷】 《第一卷 风起》 id=v1')
    expect(text).toContain('第1章 《第一章 夜雨》 id=o1')
    expect(text).toContain('第2章 《第二章 入门》 id=o2')
    expect(text).toContain(LONG_SUMMARY.slice(0, 100))
    expect(text).not.toContain('断剑秘闻唯他知晓')
  })

  it('node 详情：概要全文 + 出场人物/地点 + 写作状态', async () => {
    const r = await run('lw_query_outline', { node: '第一章 夜雨' })
    expect(r.ok).toBe(true)
    expect(r.data?.outlineId).toBe('o1')
    expect(r.data?.chapterNo).toBe(1)
    const text = String(r.data?.text)
    expect(text).toContain('第1章《第一章 夜雨》 id=o1')
    expect(text).toContain('断剑秘闻唯他知晓')
    expect(text).toContain('出场人物：林晓')
    expect(text).toContain('涉及地点：青云山')
    expect(text).toContain('写作状态：已写（')

    const unwritten = await run('lw_query_outline', { node: '第二章' })
    expect(String(unwritten.data?.text)).toContain('写作状态：未写')
  })

  it('不存在的章号：报错附大纲索引', async () => {
    const r = await run('lw_query_outline', { node: '第99章' })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('没有第 99 章')
  })
})

describe('lw_query_chapter（读已写正文）', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = makeFakeDb().db
  })

  it('已写章：窗口模式按 offset/maxChars 精确切片，带 nextOffset 翻页', async () => {
    const { chapterContent } = makeFakeDb()
    const r = await run('lw_query_chapter', { chapter: '第1章', offset: 0, maxChars: 1800 })
    expect(r.data?.written).toBe(true)
    expect(r.data?.text).toBe(chapterContent.slice(0, 1800))
    expect(r.data?.totalChars).toBe(chapterContent.length)
    expect(r.data?.wordCount).toBe(chapterContent.replace(/\s/g, '').length)
    expect(r.data?.nextOffset).toBe(1800)

    const tail = await run('lw_query_chapter', { chapter: '第1章', offset: 4000, maxChars: 500 })
    expect(tail.data?.text).toBe(chapterContent.slice(4000, 4500))
    expect(tail.data?.nextOffset).toBe(4500)
  })

  it('缺省视图：开头+结尾，中略标注全文字数', async () => {
    const { chapterContent } = makeFakeDb()
    const r = await run('lw_query_chapter', { chapter: '第1章' })
    expect(r.data?.written).toBe(true)
    const text = String(r.data?.text)
    expect(text.startsWith(chapterContent.slice(0, 1140))).toBe(true)
    expect(text.endsWith(chapterContent.slice(-760))).toBe(true)
    expect(text).toContain('（中略，全文 ')
    expect(text).toContain('offset 翻页')
  })

  it('未写章与坏引用', async () => {
    const unwritten = await run('lw_query_chapter', { chapter: '第二章' })
    expect(unwritten.data?.written).toBe(false)
    expect(String(unwritten.data?.message)).toContain('还没有正文')

    const bad = await run('lw_query_chapter', { chapter: '第99章' })
    expect(bad.ok).toBe(false)
  })
})
