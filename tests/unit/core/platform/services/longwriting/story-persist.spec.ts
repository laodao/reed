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
  normalizePlotInput,
  normalizeOutlineVolume,
  upsertOutlineChapter,
  matchOutlineChapterCard,
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
    backgrounds: [] as Array<Record<string, unknown>>,
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
    update: async (id: string, patch: Record<string, unknown>) => {
      const row = rows.find((r) => r.id === id)
      if (row) Object.assign(row, patch)
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
      getByProjectId: async () => store.outlines,
      getById: async (id: string) => store.outlines.find((o) => o.id === id) ?? null,
      create: async (input: any) => {
        const row = { id: nextId(), orderIndex: store.outlines.length, ...input }
        store.outlines.push(row)
        return row
      },
      update: async (id: string, patch: Record<string, unknown>) => {
        const row = store.outlines.find((o) => o.id === id)
        if (row) Object.assign(row, patch)
        return row
      },
    },
    lwBackgrounds: {
      getByProjectId: async () => (store.backgrounds.length > 0 ? store.backgrounds[0] : null),
      create: async (_projectId: string) => {
        const row = { id: nextId() }
        store.backgrounds.push(row)
        return row
      },
      update: async (id: string, patch: Record<string, unknown>) => {
        const row = store.backgrounds.find((b) => b.id === id)
        if (row) Object.assign(row, patch)
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

  it('同名人物卡 = 权威修正：覆盖字段更新既有行，不重复入库', async () => {
    const db = makeFakeDb()
    await persistCharacters(db, 'p1', [{ name: '林晓', appearance: '旧外形' }])
    const r = await persistCharacters(db, 'p1', [
      { name: '林晓', appearance: '新外形', background: '新背景' },
    ])
    expect(r.ok).toBe(true)
    expect(r.message).toContain('更新人物')
    expect(db._store.characters).toHaveLength(1)
    const lin = db._store.characters.find((c: any) => c.name === '林晓')
    expect(lin.appearance).toBe('新外形')
    expect(lin.background).toBe('新背景')
  })

  it('同名但无可写字段 → 幂等重申：不动库不报错', async () => {
    const db = makeFakeDb()
    await persistCharacters(db, 'p1', [{ name: '林晓' }])
    const r = await persistCharacters(db, 'p1', [{ name: '林晓' }])
    expect(r.ok).toBe(true)
    expect(r.message).toContain('无可写字段')
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

  it('中文字段卡归一化：姓名/年龄/定位等映射到实体字段后入库（实跑修复）', async () => {
    const db = makeFakeDb()
    const r = await persistCharacters(db, 'p1', [{
      姓名: '苏九龄', 年龄: '24 岁', 性别: '女', 身份: '女捕快', 定位: '主角',
      外形: '利落干练', 背景: '穿越的现代刑警', 性格: '冷静锐利', 能力: '指纹比对、尸检',
    }])
    expect(r.ok).toBe(true)
    expect(db._store.characters).toHaveLength(1)
    const c = db._store.characters[0] as any
    expect(c.name).toBe('苏九龄')
    expect(c.age).toBe(24)
    expect(c.gender).toBe('女')
    expect(c.occupation).toBe('女捕快')
    expect(c.rolePosition).toBe('protagonist')
    expect(c.abilities).toBe('指纹比对、尸检')
  })

  it('全部缺姓名 → ok:false 且非 skipped（确认流据此保留条目，不静默吞卡）', async () => {
    const db = makeFakeDb()
    const r = await persistCharacters(db, 'p1', [{ 姓名: '' }])
    expect(r.ok).toBe(false)
    expect((r as any).skipped).toBe(false)
    expect(db._store.characters).toHaveLength(0)
  })

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

describe('normalizePlotInput / normalizeOutlineVolume（研讨室卡片键名归一化）', () => {
  it('故事线卡：lineName→title，一句话+起止状态→summary', async () => {
    const n = normalizePlotInput({ lineName: '主线『残卷博弈』', oneLine: '抢残卷就是抢真相', startingState: '前身被构陷', endingState: '段衡伏法' })
    expect(n.title).toBe('主线『残卷博弈』')
    expect(n.summary).toContain('抢残卷就是抢真相')
    expect(n.summary).toContain('前身被构陷')
  })

  it('大纲卡：volumeTitle→卷名，title/estWords→章 name/estimatedWords，节拍暗线并入概要', async () => {
    const v = normalizeOutlineVolume({
      volumeTitle: '卷一（单卷十章·全书）',
      spec: '每章预估2500字',
      chapters: [{ number: 1, title: '冷雨监房', beat: '穿越+立案', summary: '苏九龄监房复盘', estWords: 2500, darkLineHook: '①前身记忆断片' }],
    })
    expect(v.name).toBe('卷一（单卷十章·全书）')
    expect(v.chapters).toHaveLength(1)
    expect(v.chapters[0].name).toBe('1 冷雨监房')
    expect(v.chapters[0].estimatedWords).toBe(2500)
    expect(v.chapters[0].summary).toContain('苏九龄监房复盘')
    expect(v.chapters[0].summary).toContain('穿越+立案')
    expect(v.chapters[0].summary).toContain('①前身记忆断片')
  })
})

describe('persistWorld specialRules（0916 review：追加去重，不再线性膨胀）', () => {
  it('首次落库 → 再确认同块不重复 → 新块按序追加', async () => {
    const db = makeFakeDb()
    await persistWorld(db, 'p1', { specialRules: '【供货线】回春堂每旬供药' })
    await persistWorld(db, 'p1', { specialRules: '【供货线】回春堂每旬供药' }) // 同块（含空白差异）不重复
    await persistWorld(db, 'p1', { specialRules: '【供货线】回春堂每旬供药\n\n【火场】西厢有人被困' })
    const row = (db as any)._store.backgrounds[0]
    expect(String(row.specialRules)).toBe('【供货线】回春堂每旬供药\n\n【火场】西厢有人被困')
    // 空白折叠语义：换行/空格差异视为同一块
    await persistWorld(db, 'p1', { specialRules: '【火场】西厢 有人被困' })
    expect((db as any)._store.backgrounds[0].specialRules).toBe('【供货线】回春堂每旬供药\n\n【火场】西厢有人被困')
  })
})

describe('matchOutlineChapterCard（一枕两界实跑：「第N集」分集卡识别）', () => {
  it('集卡（中文键 + 「第N集 · 集名」标题）应识别为章卡而非卷卡', () => {
    const card = {
      kind: 'outline',
      title: '第1集 · 夜市常客',
      data: {
        集名: '第1集 · 夜市常客',
        本集事件概要: '沈觉救下不睡觉的商人赵四，宋晏温首次锁定沈觉。',
        结尾钩子: '宋晏温写下待查。',
      },
    }
    const r = matchOutlineChapterCard(card.data, card.title)
    expect(r).not.toBeNull()
    expect(r?.no).toBe(1)
    expect(r?.name).toContain('夜市常客')
    expect(r?.summary).toContain('赵四')
    expect(r?.summary).toContain('待查')
  })

  it('「第N章」卡仍按原口径识别（无回归）', () => {
    const r = matchOutlineChapterCard(
      { 章名: '初雪', 概要: '雪夜验尸', 钩子: '尸身开口' },
      '第2章 · 初雪',
    )
    expect(r).not.toBeNull()
    expect(r?.no).toBe(2)
  })
})

describe('upsertOutlineChapter（0916 review：「第N章 X」命名幂等）', () => {
  it('向导式章名「第2章 初雪」与单章卡「2 初雪」视为同章：更新不重建', async () => {
    const db = makeFakeDb()
    // 模拟向导/AI 大纲建的章节点（挂在首卷下）
    const vol = await (db as any).lwOutlines.create({ projectId: 'p1', name: '第一卷', nodeType: 'volume' })
    await (db as any).lwOutlines.create({ projectId: 'p1', parentId: vol.id, name: '第1章 落发', nodeType: 'chapter' })
    await (db as any).lwOutlines.create({ projectId: 'p1', parentId: vol.id, name: '第2章 初雪', nodeType: 'chapter' })

    // 研讨室单章修正卡产出「N 标题」格式
    const r = await upsertOutlineChapter(db, 'p1', { no: 2, name: '2 初雪', summary: '修正后的概要' })
    expect(r).toEqual({ created: 0, updated: 1 })
    const chapters = (db as any)._store.outlines.filter((o: any) => o.nodeType === 'chapter')
    expect(chapters).toHaveLength(2) // 不再重复建第2章
    expect(chapters.find((c: any) => c.name === '第2章 初雪').summary).toBe('修正后的概要')
  })
})
