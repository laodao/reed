/**
 * 故事圣经 P0 单测：BibleQueryService 统一读模型（entity/custom 双路由）
 * + 整理器动态分类 `kind:<key>`（动态 prompt/卡片/采纳落 custom_entities）
 * @module tests/unit/core/packs/longwriting/story-room/bible.spec
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import { registerAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { BibleQueryService } from '@core/platform/services/longwriting/bible.service'
import { StoryRoomDistillerService } from '@core/packs/longwriting/story-room/room-distiller'

// ==================== 假 db ====================

const KINDS = [
  { id: 'bk_character', key: 'character', label: '人物', icon: '🧑', sortOrder: 2, storage: 'entity', entityRepo: 'lwCharacters', fieldsSchema: JSON.stringify([{ key: 'name', label: '姓名', type: 'text' }, { key: 'aliases', label: '别名', type: 'tags' }]), promptHint: null, enabled: 1 },
  { id: 'bk_nation', key: 'nation', label: '国别', icon: '🏯', sortOrder: 9, storage: 'custom', entityRepo: null, fieldsSchema: JSON.stringify([{ key: 'name', label: '国名', type: 'text' }, { key: 'stance', label: '立场', type: 'text' }]), promptHint: '{"name":"国名","stance":"立场"}', enabled: 1 },
]

function makeFakeDb() {
  const projects = new Map<string, any>()
  projects.set('p1', { id: 'p1', name: 'x', type: 'story', stage: 'overview', progress: 0, wizardState: { room: { turnNo: 3, ledger: [], pendingCards: [], cardSeq: 0, summarizedTurn: 0, summary: '', phase: 'story-core', contentTarget: 'novel' } } })
  const customRows: Array<Record<string, any>> = []
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
    lwBibleKinds: {
      getEnabled: async () => KINDS,
      getByKey: async (key: string) => KINDS.find((k) => k.key === key) ?? null,
    },
    lwCustomEntities: {
      getByProjectAndKind: async (pid: string, kindKey: string) => customRows.filter((r) => r.projectId === pid && r.kindKey === kindKey).map((r) => ({ ...r, fields: JSON.parse(r.fields || '{}'), origin: r.origin ? JSON.parse(r.origin) : null })),
      createRow: async (pid: string, kindKey: string, name: string, fields: any, origin: any) => {
        const row = { id: `bce_${customRows.length + 1}`, projectId: pid, kindKey, name, fields: JSON.stringify(fields), origin: JSON.stringify(origin), createdAt: 1, updatedAt: 1 }
        customRows.push(row)
        return { ...row, fields, origin }
      },
    },
    lwCharacters: {
      getByProjectId: async () => [{ id: 'c1', name: '林晓', aliases: ['晓哥'], occupation: '外门弟子' }],
      getById: async (id: string) => ({ id, name: '林晓', aliases: ['晓哥'], occupation: '外门弟子' }),
    },
    lwPlots: { getByProjectId: async () => [] },
    lwOutlines: { getTreeByProjectId: async () => [] },
    lwStoryOverviews: { getByProjectId: async () => null },
    lwFactions: { getByProjectId: async () => [] },
    lwSkills: { getByProjectId: async () => [] },
    lwItems: { getByProjectId: async () => [] },
    lwLocations: { getByProjectId: async () => [] },
    lwBackgrounds: { getByProjectId: async () => null },
    lwGraphEdges: { getByEntity: async () => [{ targetName: '大师兄', relationType: '仇敌', validFromChapter: 1 }] },
    _projects: projects,
    _customRows: customRows,
  }
  return db
}

// ==================== BibleQueryService ====================

describe('BibleQueryService（统一读模型）', () => {
  it('entity/custom 双路由聚合：人物带别名，国别读自定义实体', async () => {
    const db = makeFakeDb()
    ;(db._customRows as any[]).push({ id: 'bce_1', projectId: 'p1', kindKey: 'nation', name: '大周王朝', fields: JSON.stringify({ stance: '中立' }), origin: JSON.stringify({ type: 'discussion', turns: [2] }), createdAt: 1, updatedAt: 1 })
    const svc = new BibleQueryService(db)

    const groups = await svc.list('p1')
    const char = groups.find((g) => g.kindKey === 'character')!
    expect(char.entries).toHaveLength(1)
    expect(char.entries[0]).toMatchObject({ name: '林晓', aliases: ['晓哥'] })
    const nation = groups.find((g) => g.kindKey === 'nation')!
    expect(nation.storage).toBe('custom')
    expect(nation.entries[0]).toMatchObject({ name: '大周王朝', origin: { type: 'discussion', turns: [2] } })
  })

  it('detail 返回字段+关系小节数据', async () => {
    const svc = BibleQueryService.getInstance(makeFakeDb())
    const d = await svc.detail('p1', 'character', 'c1')
    expect(d?.fields.name).toBe('林晓')
    expect(d?.relations).toHaveLength(1)
  })

  it('customCreate → list 可见（origin 保留）', async () => {
    const db = makeFakeDb()
    const svc = new BibleQueryService(db)
    await svc.customCreate('p1', 'nation', '北狄', { stance: '敌对' }, { type: 'manual' })
    const groups = await svc.list('p1')
    expect(groups.find((g) => g.kindKey === 'nation')!.entries[0].name).toBe('北狄')
  })
})

// ==================== 整理器动态分类 ====================

const USAGE = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, noCache: 5 }, totalTokens: { total: 15, noCache: 15 } }

function textStream(text: string): LanguageModel {
  return new MockLanguageModelV3({
    provider: 'test', modelId: 'mock',
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: text },
        { type: 'text-end', id: 't' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: USAGE },
      ] }),
    }),
  }) as unknown as LanguageModel
}

function harness(model: LanguageModel, db: any): StoryRoomDistillerService {
  registerAgentLoopHarness({
    registry: new AgentToolRegistry(),
    resolveModel: async () => model,
    trajectoryRepo: { appendBatch: async () => undefined, maxSeq: async () => 0 } as never,
  })
  return new StoryRoomDistillerService(db)
}

describe('整理器 kind:<key>（动态分类）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerEventEmitter(() => ({ emit: () => undefined, emitProgress: () => undefined, emitStatus: () => undefined } as never))
  })

  it('kind:nation：prompt 含字段模板，卡片产出 + 采纳落 lw_custom_entities（origin=discussion）', async () => {
    const db = makeFakeDb()
    const seen: string[] = []
    const model = new MockLanguageModelV3({
      provider: 'test', modelId: 'mock',
      doStream: async (opts: any) => {
        seen.push(JSON.stringify(opts.prompt))
        return { stream: simulateReadableStream({ chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: '{"name":"大周王朝","stance":"中立","note":"分封诸侯"}' },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: USAGE },
        ] }) }
      },
    }) as unknown as LanguageModel
    const svc = harness(model, db)

    const r = await svc.distill('p1', 'kind:nation')
    expect(r.cards).toHaveLength(1)
    expect(r.cards[0].kind).toBe('custom')
    expect((r.cards[0].data as any)._kindKey).toBe('nation')
    // 动态 prompt 携带分类名与字段模板
    expect(seen.join('')).toContain('国别')
    expect(seen.join('')).toContain('stance')

    const card = await svc.adoptCard('p1', r.cards[0].id)
    expect(card.status).toBe('adopted')
    expect(db._customRows).toHaveLength(1)
    expect(db._customRows[0]).toMatchObject({ kindKey: 'nation', name: '大周王朝' })
    expect(JSON.parse(db._customRows[0].origin)).toMatchObject({ type: 'discussion', turns: [3] })
  })

  it('kind:不存在 → 抛错（handler 白名单同理）', async () => {
    const svc = harness(textStream('{}'), makeFakeDb())
    await expect(svc.distill('p1', 'kind:nope' as never)).rejects.toThrow()
  })
})
