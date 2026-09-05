/**
 * GraphService 单测（fake dbManager 注入）
 * 覆盖：getGraph 节点 union、resolveEntities 名称→ID、stateAt 时间切片、edgesAt 生效边、
 *       getTimeline 状态序列、getRelations 章节过滤、endRelation、事件关联。
 */
import { describe, it, expect, vi } from 'vitest'
import { GraphService } from '@core/platform/services/longwriting/graph/graph.service'

/** 构造 fake dbManager（仅含图谱需要的接口） */
function makeFakeDb(over: Record<string, unknown> = {}) {
  return {
    lwCharacters: {
      getByProjectId: vi.fn(async () => [
        { id: 'c1', name: '林晓', personality: '沉稳' },
        { id: 'c2', name: '顾言', personality: '洒脱' },
      ]),
      getById: vi.fn(async (id: string) =>
        id === 'c1' ? { id: 'c1', name: '林晓', personality: '沉稳' } : null,
      ),
    },
    lwLocations: {
      getByProjectId: vi.fn(async () => [{ id: 'l1', name: '青云宗', description: '仙门' }]),
      getById: vi.fn(async () => null),
    },
    lwItems: { getByProjectId: vi.fn(async () => []), getById: vi.fn(async () => null) },
    lwFactions: { getByProjectId: vi.fn(async () => []), getById: vi.fn(async () => null) },
    lwSkills: { getByProjectId: vi.fn(async () => []), getById: vi.fn(async () => null) },
    lwEvents: {
      getByProjectId: vi.fn(async () => [
        {
          id: 'e1', projectId: 'p1', name: '大比夺魁', description: '林晓击败宿敌',
          chapterNumber: 3, involvedEntities: [{ type: 'character', id: 'c1', name: '林晓' }],
        },
      ]),
      getById: vi.fn(async (id: string) =>
        id === 'e1' ? { id: 'e1', name: '大比夺魁', description: '林晓击败宿敌' } : null,
      ),
    },
    lwGraphEdges: {
      getByProjectId: vi.fn(async () => [
        { id: 'edge1', projectId: 'p1', sourceType: 'character', sourceId: 'c1', targetType: 'character', targetId: 'c2', relationType: 'marriage', validFromChapter: 1, validUntilChapter: undefined },
        { id: 'edge2', projectId: 'p1', sourceType: 'character', sourceId: 'c1', targetType: 'character', targetId: 'c2', relationType: 'divorced', validFromChapter: 8, validUntilChapter: undefined },
      ]),
      getActiveEdgesAtChapter: vi.fn(async (_pid: string, entityId: string, cn: number) => {
        if (cn < 8) return [{ id: 'edge1', relationType: 'marriage' }]
        return [{ id: 'edge2', relationType: 'divorced' }]
      }),
      getByEntity: vi.fn(async () => []),
      create: vi.fn(async (input: any) => ({ id: 'new-edge', ...input })),
      update: vi.fn(async (id: string, patch: any) => ({ id, ...patch })),
      delete: vi.fn(async () => true),
      endRelation: vi.fn(async (id: string, cn: number) => ({ id, validUntilChapter: cn })),
    },
    lwEntityStates: {
      getEntityStateAtChapter: vi.fn(async (_pid: string, _t: string, _id: string, cn: number) =>
        cn >= 5
          ? { id: 's1', chapterNumber: 5, stateSummary: '林晓已死亡', keyChanges: ['战死'] }
          : { id: 's0', chapterNumber: 2, stateSummary: '林晓负伤', keyChanges: ['受伤'] },
      ),
      getByProjectId: vi.fn(async () => [
        { id: 's0', entityType: 'character', entityId: 'c1', chapterNumber: 2, stateSummary: '负伤', keyChanges: [], createdAt: 1 },
        { id: 's1', entityType: 'character', entityId: 'c1', chapterNumber: 5, stateSummary: '死亡', keyChanges: ['战死'], createdAt: 2 },
      ]),
      getLatestEntityState: vi.fn(async () => ({ chapterNumber: 5, stateSummary: '林晓已死亡', keyChanges: ['战死'] })),
    },
    ...over,
  }
}

describe('GraphService', () => {
  it('getGraph 聚合各实体表 + 事件节点 + 边', async () => {
    const svc = new GraphService(makeFakeDb() as any)
    const g = await svc.getGraph('p1')
    expect(g.nodes).toHaveLength(4) // 2 角色 + 1 地点 + 1 事件
    expect(g.nodes.map(n => n.type).sort()).toEqual(['character', 'character', 'event', 'location'])
    expect(g.edges).toHaveLength(2)
  })

  it('resolveEntities 名称→ID（命中/未命中）', async () => {
    const svc = new GraphService(makeFakeDb() as any)
    const r = await svc.resolveEntities('p1', [
      { type: 'character', name: '林晓' },
      { type: 'character', name: '不存在的人' },
      { type: 'location', name: '青云宗' },
      { type: 'item', name: '无名剑' },
    ])
    expect(r).toEqual([
      { type: 'character', name: '林晓', id: 'c1', resolved: true },
      { type: 'character', name: '不存在的人', resolved: false },
      { type: 'location', name: '青云宗', id: 'l1', resolved: true },
      { type: 'item', name: '无名剑', resolved: false },
    ])
  })

  it('stateAt 返回 <=N 最新切片', async () => {
    const svc = new GraphService(makeFakeDb() as any)
    const at2 = await svc.stateAt('p1', 'character', 'c1', 2)
    expect(at2?.stateSummary).toBe('林晓负伤')
    const at5 = await svc.stateAt('p1', 'character', 'c1', 5)
    expect(at5?.stateSummary).toBe('林晓已死亡')
  })

  it('edgesAt 按章节返回生效边', async () => {
    const svc = new GraphService(makeFakeDb() as any)
    const at4 = await svc.edgesAt('p1', 'c1', 4)
    expect(at4[0].relationType).toBe('marriage')
    const at9 = await svc.edgesAt('p1', 'c1', 9)
    expect(at9[0].relationType).toBe('divorced')
  })

  it('getTimeline 返回按章节升序的状态序列', async () => {
    const svc = new GraphService(makeFakeDb() as any)
    const tl = await svc.getTimeline('p1', 'character', 'c1')
    expect(tl.map(t => t.chapterNumber)).toEqual([2, 5])
    expect(tl[1].keyChanges).toEqual(['战死'])
  })

  it('getNode 返回实体 + 最新状态 + 关联事件', async () => {
    const svc = new GraphService(makeFakeDb() as any)
    const node = await svc.getNode('p1', 'character', 'c1')
    expect(node?.name).toBe('林晓')
    expect(node?.latestState?.stateSummary).toBe('林晓已死亡')
    expect(node?.events?.map(e => e.name)).toEqual(['大比夺魁'])
  })

  it('endRelation 写 valid_until_chapter', async () => {
    const svc = new GraphService(makeFakeDb() as any)
    const edge = await svc.endRelation('edge1', 8)
    expect(edge?.validUntilChapter).toBe(8)
  })

  it('addEdge / deleteEdge 透传 repository', async () => {
    const db = makeFakeDb()
    const svc = new GraphService(db as any)
    const added = await svc.addEdge({ projectId: 'p1', sourceType: 'character', sourceId: 'c1', targetType: 'character', targetId: 'c2', relationType: 'friends' })
    expect(added?.id).toBe('new-edge')
    expect(await svc.deleteEdge('edge1')).toBe(true)
  })
})
