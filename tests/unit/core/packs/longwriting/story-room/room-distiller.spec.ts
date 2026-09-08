/**
 * 故事研讨室 v2.1 M4：整理器（Distiller）单测
 * @module tests/unit/core/packs/longwriting/story-room/room-distiller.spec
 *
 * 断言：distill 卡片化（解析/事件/持久化 pending）、采纳→story-persist 落库
 * （人物字段映射/概要 upsert 幂等/大纲建树/世界四类）、反馈重提（旧卡 ignored）、
 * 坏输出容错、分集大纲卡不落 lw_outlines。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import { registerAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'

vi.mock('@core/platform/services/longwriting/graph/graph.service', () => ({
  GraphService: vi.fn().mockImplementation(() => ({
    syncEntityRelations: vi.fn(async () => undefined),
  })),
}))

import { StoryRoomDistillerService } from '@core/packs/longwriting/story-room/room-distiller'
import type { RoomWorkspaceState } from '@shared/types/story-room.types'

// ==================== 基建（对齐 room-session.spec） ====================

const USAGE = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } }

function textStreamChunks(text: string): Array<Record<string, unknown>> {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: text },
    { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: USAGE },
  ]
}

function scriptedModel(streams: string[]): LanguageModel {
  const q = [...streams]
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async () => ({ stream: simulateReadableStream({ chunks: textStreamChunks(q.length > 0 ? q.shift()! : '{}') }) }),
  }) as unknown as LanguageModel
}

function installEventCapture(): Array<{ channel: string; event: any }> {
  const captured: Array<{ channel: string; event: any }> = []
  registerEventEmitter(() => ({
    emit: (channel: string, event: unknown) => captured.push({ channel, event }),
    emitProgress: () => undefined,
    emitStatus: () => undefined,
  } as never))
  return captured
}

const BASE_ROOM: RoomWorkspaceState = {
  ledger: [{ id: 'ce_1', kind: 'premise', title: '主角动机=洗冤复仇', points: [], status: 'confirmed', sourceTurn: 1, updatedAt: 1 }],
  summary: '',
  summarizedTurn: 0,
  turnNo: 5,
  phase: 'characters',
  contentTarget: 'novel',
  pendingCards: [],
  cardSeq: 0,
}

function makeFakeDb(room: Partial<RoomWorkspaceState> = {}) {
  const state: RoomWorkspaceState = { ...BASE_ROOM, ...room }
  const projects = new Map<string, any>()
  projects.set('p1', { id: 'p1', name: '洗冤录', type: 'story', stage: 'overview', progress: 0, wizardState: { room: state } })
  const characters: any[] = []
  const outlines: any[] = []
  const items: any[] = []
  const db = {
    lwProjects: {
      getById: async (id: string) => projects.get(id) ?? null,
      update: async (id: string, patch: any) => {
        const p = projects.get(id)
        if (!p) return null
        if (patch.wizardState !== undefined) p.wizardState = patch.wizardState
        return p
      },
    },
    lwStoryOverviews: {
      getByProjectId: async () => null,
      create: async (pid: string) => ({ id: 'ov1', projectId: pid }),
      update: async () => undefined,
    },
    lwCharacters: {
      getByProjectId: async () => characters,
      create: async (input: any) => {
        const row = { id: `c${characters.length + 1}`, ...input }
        characters.push(row)
        return row
      },
    },
    lwPlots: { getByProjectId: async () => [], batchCreate: async () => undefined },
    lwLocations: { getByProjectId: async () => [], create: async (input: any) => ({ id: 'l1', ...input }) },
    lwFactions: { getByProjectId: async () => [], create: async (input: any) => ({ id: 'f1', ...input }) },
    lwSkills: { getByProjectId: async () => [], create: async (input: any) => ({ id: 's1', ...input }) },
    lwItems: { getByProjectId: async () => items, create: async (input: any) => ({ id: 'i1', ...input }) },
    lwOutlines: {
      getTreeByProjectId: async () => outlines,
      getById: async (id: string) => outlines.find((o) => o.id === id) ?? null,
      create: async (input: any) => {
        const row = { id: `o${outlines.length + 1}`, orderIndex: outlines.length, ...input }
        outlines.push(row)
        return row
      },
    },
    lwGraphEdges: { deleteByEntity: async () => 0 },
    _characters: characters,
    _outlines: outlines,
    _projects: projects,
  }
  return db
}

function harness(model: LanguageModel, db: any): StoryRoomDistillerService {
  registerAgentLoopHarness({
    registry: new AgentToolRegistry(),
    resolveModel: async () => model,
    trajectoryRepo: { appendBatch: async () => undefined, maxSeq: async () => 0 } as never,
  })
  return new StoryRoomDistillerService(db)
}

function roomOf(db: any): RoomWorkspaceState {
  return (db._projects.get('p1').wizardState as any).room
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ==================== 提炼 ====================

describe('distill 提炼', () => {
  it('人物提炼：解析输出 → pending 卡片 + card:ready 事件 + cardSeq 推进', async () => {
    const captured = installEventCapture()
    const db = makeFakeDb()
    const svc = harness(scriptedModel([
      '{"name":"林晓","gender":"male","age":18,"rolePosition":"protagonist","personality":"隐忍","relations":[{"targetName":"大师兄","relationType":"仇敌","description":"被冤"}]}',
    ]), db)

    const r = await svc.distill('p1', 'characters')
    expect(r.cards).toHaveLength(1)
    expect(r.cards[0].kind).toBe('character')
    expect(r.cards[0].title).toContain('林晓')
    expect(r.cards[0].status).toBe('pending')
    expect(r.cards[0].sourceTurns).toEqual([5])
    const room = roomOf(db)
    expect(room.pendingCards).toHaveLength(1)
    expect(room.cardSeq).toBe(1)
    expect(captured.some((c) => c.event?.type === 'card:ready')).toBe(true)
  })

  it('输出坏 JSON：抛错（handler 转错误提示），不产生卡片', async () => {
    const db = makeFakeDb()
    const svc = harness(scriptedModel(['我觉得卡片的格式大概是这样的呢']), db)
    await expect(svc.distill('p1', 'overview')).rejects.toThrow('解析')
    expect(roomOf(db).pendingCards).toHaveLength(0)
  })

  it('分集目标：大纲 scope 提示分集策略，卡片带集号', async () => {
    const db = makeFakeDb({ contentTarget: 'script', phase: 'outline' })
    const svc = harness(scriptedModel([
      '{"index":1,"title":"第一集","hook":"开棺","reversal":"尸体是假的","characters":["林晓"],"scenes":[{"name":"义庄","summary":"守尸","timeOfDay":"夜"}]}',
    ]), db)
    const r = await svc.distill('p1', 'outline')
    expect(r.cards[0].kind).toBe('outline')
    expect(r.cards[0].volumeIndex).toBe(1)
    expect(r.cards[0].title).toContain('第 1 集')
  })
})

// ==================== 采纳 ====================

describe('adoptCard 采纳落库', () => {
  it('人物卡采纳：字段映射入库 + 关系边 + 终态 adopted', async () => {
    installEventCapture()
    const db = makeFakeDb()
    const svc = harness(scriptedModel(['{}']), db)
    // 手工放一张 pending 卡
    roomOf(db).pendingCards = [{
      id: 'card_x1', kind: 'character', title: '人物卡 · 林晓',
      data: { name: '林晓', rolePosition: 'protagonist', personality: '隐忍', relations: [{ targetName: '大师兄', relationType: '仇敌' }] },
      status: 'pending', sourceTurns: [5], createdAt: 1,
    }]

    const card = await svc.adoptCard('p1', 'card_x1')
    expect(card.status).toBe('adopted')
    expect(card.resultNote).toContain('林晓')
    expect(db._characters).toHaveLength(1)
    expect(db._characters[0]).toMatchObject({ name: '林晓', rolePosition: 'protagonist', personality: '隐忍' })
  })

  it('概要卡采纳幂等：二次采纳走 update 不重复建行', async () => {
    const db = makeFakeDb()
    const svc = harness(scriptedModel(['{}']), db)
    const card = {
      id: 'card_o1', kind: 'overview' as const, title: '概要卡 · 洗冤录',
      data: { title: '洗冤录', summary: '被冤弟子的复仇', estimatedChapters: 120 },
      status: 'pending' as const, sourceTurns: [5], createdAt: 1,
    }
    roomOf(db).pendingCards = [card]
    const first = await svc.adoptCard('p1', 'card_o1')
    expect(first.status).toBe('adopted')
    // 已 adopted 的卡不再重复采纳（终态保护）
    const second = await svc.adoptCard('p1', 'card_o1')
    expect(second.status).toBe('adopted')
  })

  it('长篇大纲卡采纳：persistOutlineTree 建卷+章节点', async () => {
    const db = makeFakeDb()
    const svc = harness(scriptedModel(['{}']), db)
    roomOf(db).pendingCards = [{
      id: 'card_v1', kind: 'outline', title: '大纲卡 · 第一卷',
      data: { name: '第一卷 蒙冤', summary: '开局被冤', estimatedWords: 300000, chapters: [{ name: '第1章 逐出师门', summary: '钩子', estimatedWords: 3000 }] },
      status: 'pending', sourceTurns: [5], createdAt: 1,
    }]
    const card = await svc.adoptCard('p1', 'card_v1')
    expect(card.status).toBe('adopted')
    expect(db._outlines.map((o) => o.nodeType)).toEqual(['volume', 'chapter'])
    expect(db._outlines[0].name).toBe('第一卷 蒙冤')
  })

  it('分集大纲卡采纳：定稿不落 lw_outlines（转短剧种子）', async () => {
    const db = makeFakeDb()
    const svc = harness(scriptedModel(['{}']), db)
    roomOf(db).pendingCards = [{
      id: 'card_e1', kind: 'outline', title: '分集大纲卡 · 第 1 集',
      data: { index: 1, title: '第一集', hook: 'x', reversal: 'y', characters: [], scenes: [] },
      status: 'pending', sourceTurns: [5], createdAt: 1,
    }]
    const card = await svc.adoptCard('p1', 'card_e1')
    expect(card.status).toBe('adopted')
    expect(card.resultNote).toContain('定稿')
    expect(db._outlines).toHaveLength(0)
  })

  it('世界卡采纳：四类分别入库', async () => {
    const db = makeFakeDb()
    const svc = harness(scriptedModel(['{}']), db)
    roomOf(db).pendingCards = [{
      id: 'card_w1', kind: 'world', title: '世界设定卡',
      data: { locations: [{ name: '青云宗' }], factions: [], skills: [{ name: '御剑术' }], items: [{ name: '诛仙剑' }] },
      status: 'pending', sourceTurns: [5], createdAt: 1,
    }]
    const card = await svc.adoptCard('p1', 'card_w1')
    expect(card.status).toBe('adopted')
    expect(card.resultNote).toContain('地点1个')
  })
})

// ==================== 重提 / 忽略 ====================

describe('regenerateCard / ignoreCard', () => {
  it('带反馈重提：旧卡 ignored（带 feedback），新卡 pending 且继承集号', async () => {
    const db = makeFakeDb()
    const model = scriptedModel([
      '{"name":"林晓","personality":"外冷内热","motive":"赎罪"}',
    ])
    const svc = harness(model, db)
    roomOf(db).pendingCards = [{
      id: 'card_r1', kind: 'character', title: '人物卡 · 林晓',
      data: { name: '林晓', personality: '隐忍重情' },
      status: 'pending', sourceTurns: [5], createdAt: 1,
    }]

    const r = await svc.regenerateCard('p1', 'card_r1', '动机改成赎罪而不是复仇')
    expect(r.cards).toHaveLength(1)
    const room = roomOf(db)
    const oldCard = room.pendingCards.find((c: any) => c.id === 'card_r1')
    const newCard = room.pendingCards.find((c: any) => c.id !== 'card_r1')
    expect(oldCard.status).toBe('ignored')
    expect(oldCard.feedback).toContain('赎罪')
    expect(newCard.status).toBe('pending')
    expect(newCard.data.motive).toBe('赎罪')
  })

  it('忽略卡片：状态 ignored', async () => {
    const db = makeFakeDb()
    const svc = harness(scriptedModel(['{}']), db)
    roomOf(db).pendingCards = [{
      id: 'card_i1', kind: 'plot', title: '故事线卡 · 洗冤线',
      data: { title: '洗冤线' }, status: 'pending', sourceTurns: [5], createdAt: 1,
    }]
    const card = await svc.ignoreCard('p1', 'card_i1')
    expect(card.status).toBe('ignored')
  })
})
