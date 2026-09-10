/**
 * 故事研讨室 v2.1 M1：story-persist 落库段单测
 * @module tests/unit/core/platform/services/longwriting/story-persist.spec
 *
 * 落库段自 agent-actions.ts 抽取——本 spec 钉死逐字段行为（字段缺省回落、
 * 去重只入新增、create-if-missing、大纲建树计数、章节 saveChapter 语义），
 * 旧 agent-actions / lw-agent-harness spec 回归作为委托等价的对照面。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@core/platform/services/longwriting/graph/graph.service', () => ({
  GraphService: vi.fn().mockImplementation(() => ({
    syncEntityRelations: vi.fn(async () => undefined),
  })),
}))

import { GraphService } from '@core/platform/services/longwriting/graph/graph.service'
import {
  persistOverview,
  persistCharacters,
  persistPlots,
  persistWorld,
  persistOutlineTree,
  persistChapter,
  extractJsonObject,
  extractJsonArray,
} from '@core/platform/services/longwriting/story-persist'

// ==================== 假仓库 ====================

function makeFakeDb() {
  const store = {
    overviews: [] as Array<Record<string, unknown>>,
    characters: [] as Array<Record<string, unknown>>,
    plots: [] as Array<Record<string, unknown>>,
    locations: [] as Array<Record<string, unknown>>,
    factions: [] as Array<Record<string, unknown>>,
    skills: [] as Array<Record<string, unknown>>,
    items: [] as Array<Record<string, unknown>>,
    outlines: [] as Array<Record<string, unknown>>,
    chapters: new Map<string, string>(),
    chapterVersions: [] as Array<Record<string, unknown>>,
  }
  let idSeq = 100
  const nextId = () => `e${++idSeq}`

  const listRepo = (rows: Array<Record<string, unknown>>, create: (input: any) => Record<string, unknown>) => ({
    getByProjectId: async () => rows,
    create: async (input: any) => {
      const row = create(input)
      rows.push(row)
      return row
    },
  })

  const db = {
    lwStoryOverviews: {
      getByProjectId: async () => (store.overviews.length > 0 ? store.overviews[0] : null),
      create: async (_projectId: string) => {
        const row = { id: nextId() }
        store.overviews.push(row)
        return row
      },
      update: async (id: string, patch: Record<string, unknown>) => {
        const row = store.overviews.find((o) => o.id === id)
        if (row) Object.assign(row, patch)
        return row
      },
    },
    lwCharacters: listRepo(store.characters, (input) => ({ id: nextId(), ...input })),
    lwLocations: listRepo(store.locations, (input) => ({ id: nextId(), ...input })),
    lwFactions: listRepo(store.factions, (input) => ({ id: nextId(), ...input })),
    lwSkills: listRepo(store.skills, (input) => ({ id: nextId(), ...input })),
    lwItems: listRepo(store.items, (input) => ({ id: nextId(), ...input })),
    lwPlots: {
      getByProjectId: async () => store.plots,
      create: async (input: any) => {
        const row = { id: nextId(), ...input }
        store.plots.push(row)
        return row
      },
      batchCreate: async (_projectId: string, inputs: any[]) => {
        for (const input of inputs) {
          store.plots.push({ id: nextId(), ...input })
        }
        return inputs.length
      },
    },
    lwOutlines: {
      getTreeByProjectId: async () => store.outlines,
      getById: async (id: string) => store.outlines.find((o) => o.id === id) ?? null,
      create: async (input: any) => {
        const row = { id: nextId(), orderIndex: store.outlines.length, ...input }
        store.outlines.push(row)
        return row
      },
    },
    lwChapters: {
      getByOutlineId: async (outlineId: string) => {
        if (!store.chapters.has(outlineId)) return null
        return { id: `ch-${outlineId}`, outlineId, content: store.chapters.get(outlineId) }
      },
      getByOutlineIds: async (ids: string[]) => {
        const m = new Map()
        for (const id of ids) if (store.chapters.has(id)) m.set(id, { id: `ch-${id}` })
        return m
      },
      create: async (outlineId: string, content: string) => {
        store.chapters.set(outlineId, content)
        return { id: `ch-${outlineId}`, outlineId, content }
      },
      updateContent: async (id: string, content: string) => {
        const outlineId = id.replace('ch-', '')
        store.chapters.set(outlineId, content)
        return { id, outlineId, content }
      },
      createVersion: async (chapterId: string, content: string, source: string) => {
        store.chapterVersions.push({ chapterId, content, source })
        return { chapterId, content, source }
      },
    },
    lwGraphEdges: { deleteByEntity: async () => 0 },
    _store: store,
  }
  return db as any & { _store: typeof store }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ==================== 概要 ====================

describe('persistOverview', () => {
  it('行缺失时先建行再更新（防假成功），patch 带全量字段', async () => {
    const db = makeFakeDb()
    const r = await persistOverview(db, 'p1', {
      title: '修仙之路', storyType: '修仙', summary: '凡人逆天。', coreConflict: '凡人与天道',
      keyCharacters: ['张三'], estimatedChapters: 100,
    }, '修仙题材，凡人流')
    expect(r.ok).toBe(true)
    expect(db._store.overviews).toHaveLength(1)
    const patch = db._store.overviews[0] as any
    expect(patch.title).toBe('修仙之路')
    expect(patch.coreIdea).toBe('修仙题材，凡人流')
    expect(patch.isSaved).toBe(true)
    expect(patch.estimatedChapters).toBe(100)
    expect(r.message).toContain('修仙之路')
  })

  it('data 字段缺省时回落库内现有值（upsert 不丢旧数据）', async () => {
    const db = makeFakeDb()
    await persistOverview(db, 'p1', { title: '旧标题', summary: '旧简介' })
    await persistOverview(db, 'p1', { title: '新标题' })
    const row = db._store.overviews[0] as any
    expect(row.title).toBe('新标题')
    expect(row.summary).toBe('旧简介')
    expect(row.coreIdea).toBeNull()
  })
})

// ==================== 人物 ====================

describe('persistCharacters', () => {
  it('按名称去重只入新增，字段缺省值与原动作一致', async () => {
    const db = makeFakeDb()
    await persistCharacters(db, 'p1', [{ name: '林晓' }])
    const r = await persistCharacters(db, 'p1', [
      { name: '林晓' }, // 已存在 → 跳过
      { name: '苏婉儿', rolePosition: 'supporting' },
      { name: '  ' }, // 空名 → 过滤
    ])
    expect(r.ok).toBe(true)
    expect(db._store.characters.map((c: any) => c.name).sort()).toEqual(['林晓', '苏婉儿'])
    const su = db._store.characters.find((c: any) => c.name === '苏婉儿') as any
    expect(su.rolePosition).toBe('supporting')
    expect(db._store.characters.find((c: any) => c.name === '林晓').gender).toBe('other')
  })

  it('全部已存在 → skipped（不报错不重复入库）', async () => {
    const db = makeFakeDb()
    await persistCharacters(db, 'p1', [{ name: '林晓' }])
    const r = await persistCharacters(db, 'p1', [{ name: '林晓' }])
    expect(r.ok).toBe(false)
    expect(r.skipped).toBe(true)
    expect(db._store.characters).toHaveLength(1)
  })

  it('relations 输出 → 图谱 syncEntityRelations（幂等边落库）', async () => {
    const db = makeFakeDb()
    await persistCharacters(db, 'p1', [
      { name: '林晓', relations: [{ targetName: '大师兄', relationType: '仇敌', description: '被冤' }] },
    ])
    const inst = (GraphService as any).mock.results[0]?.value
    expect(inst?.syncEntityRelations).toHaveBeenCalled()
  })
})

// ==================== 故事线 ====================

describe('persistPlots', () => {
  it('按标题对库内去重 + batchCreate 载荷字段齐全（批内不去重——与原动作语义一致）', async () => {
    const db = makeFakeDb()
    await persistPlots(db, 'p1', [{ title: '旧线' }])
    const r = await persistPlots(db, 'p1', [
      { title: '洗冤线', summary: '主线', involvedCharacters: ['林晓'] },
      { title: '旧线' }, // 库内已存在 → 去重
    ])
    expect(r.ok).toBe(true)
    expect(db._store.plots.map((p: any) => p.title).sort()).toEqual(['旧线', '洗冤线'])
    expect(db._store.plots.find((p: any) => p.title === '洗冤线')).toMatchObject({ summary: '主线', involvedCharacters: ['林晓'] })
  })
})

// ==================== 世界设定 ====================

describe('persistWorld', () => {
  it('四类分别去重入库，缺省值与原动作一致', async () => {
    const db = makeFakeDb()
    const r = await persistWorld(db, 'p1', {
      locations: [{ name: '青云宗' }],
      factions: [{ name: '天机阁' }],
      skills: [{ name: '御剑术' }],
      items: [{ name: '诛仙剑' }],
    })
    expect(r.ok).toBe(true)
    expect(r.message).toContain('地点1个')
    expect(db._store.locations[0]).toMatchObject({ type: 'other', importance: 'auxiliary' })
    expect(db._store.factions[0]).toMatchObject({ factionType: 'other' })
    expect(db._store.skills[0]).toMatchObject({ type: 'ability', level: 'beginner', characterIds: [] })
    expect(db._store.items[0]).toMatchObject({ type: 'artifact', level: 'common' })
  })

  it('空数据 → 失败回执', async () => {
    const db = makeFakeDb()
    const r = await persistWorld(db, 'p1', {})
    expect(r.ok).toBe(false)
    expect(r.skipped).toBeUndefined()
  })
})

// ==================== 大纲 ====================

describe('persistOutlineTree', () => {
  it('三级结构：卷→章→节逐层建节点并计数', async () => {
    const db = makeFakeDb()
    const n = await persistOutlineTree(db, 'p1', [
      { name: '第一卷', chapters: [{ name: '第1章', sections: [{ name: '第一节' }] }] },
    ], 3)
    expect(n).toBe(3)
    expect(db._store.outlines.map((o: any) => o.nodeType)).toEqual(['volume', 'chapter', 'section'])
    const chapterNode = db._store.outlines[1] as any
    expect(chapterNode.parentId).toBe(db._store.outlines[0].id)
  })

  it('一级结构：平铺章节', async () => {
    const db = makeFakeDb()
    const n = await persistOutlineTree(db, 'p1', [{ name: '第1章' }, { name: '第2章' }], 1)
    expect(n).toBe(2)
    expect(db._store.outlines.every((o: any) => o.nodeType === 'chapter')).toBe(true)
  })
})

// ==================== 章节 ====================

describe('persistChapter', () => {
  it('新章 create + createVersion（saveChapter 语义）', async () => {
    const db = makeFakeDb()
    await persistOutlineTree(db, 'p1', [{ name: '第1章' }], 1)
    const outlineId = (db._store.outlines[0] as any).id
    const r = await persistChapter(db, 'p1', { outlineId, content: '正文内容。' })
    expect(r.ok).toBe(true)
    expect(db._store.chapters.get(outlineId)).toBe('正文内容。')
    expect(db._store.chapterVersions).toEqual([{ chapterId: `ch-${outlineId}`, content: '正文内容。', source: 'manual' }])
  })

  it('已有章 updateContent + 建版本；ai 缺省时跳过图谱流水线不报错', async () => {
    const db = makeFakeDb()
    await persistOutlineTree(db, 'p1', [{ name: '第1章' }], 1)
    const outlineId = (db._store.outlines[0] as any).id
    await persistChapter(db, 'p1', { outlineId, content: '第一版' })
    const r = await persistChapter(db, 'p1', { outlineId, content: '第二版' })
    expect(r.ok).toBe(true)
    expect(db._store.chapters.get(outlineId)).toBe('第二版')
    expect(db._store.chapterVersions).toHaveLength(2)
  })

  it('outlineId 无效 / 空正文 → 失败回执', async () => {
    const db = makeFakeDb()
    expect((await persistChapter(db, 'p1', { outlineId: 'nope', content: 'x' })).ok).toBe(false)
    await persistOutlineTree(db, 'p1', [{ name: '第1章' }], 1)
    const outlineId = (db._store.outlines[0] as any).id
    expect((await persistChapter(db, 'p1', { outlineId, content: '  ' })).ok).toBe(false)
  })
})

// ==================== JSON 容错解析 ====================

describe('extractJsonObject / extractJsonArray', () => {
  it('容忍 markdown 代码块与前后杂文', () => {
    expect(extractJsonObject('好的，以下是卡片：\n```json\n{"a":1}\n```\n请查收')).toEqual({ a: 1 })
    expect(extractJsonArray('前言\n[{"name":"林晓"}]\n后记')).toEqual([{ name: '林晓' }])
    expect(extractJsonObject('不是 JSON')).toBeNull()
    expect(extractJsonArray('')).toBeNull()
  })
})
