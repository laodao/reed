/**
 * GraphService.syncEntityRelations 单测（图谱关系构建落库）
 * 覆盖：正常落库、幂等去重、名称解析失败跳过、自环跳过、同对多关系并存。
 */
import { describe, it, expect, vi } from 'vitest'
import { GraphService } from '@core/platform/services/longwriting/graph/graph.service'

function makeFakeDb() {
  const characters = [
    { id: 'c1', name: '林晓' },
    { id: 'c2', name: '顾言' },
  ]
  const locations = [{ id: 'l1', name: '青云宗' }]
  const items = [{ id: 'i1', name: '青云剑' }]
  const edges: any[] = []

  return {
    lwCharacters: {
      getByProjectId: vi.fn(async () => characters),
      getById: vi.fn(async () => null),
    },
    lwLocations: { getByProjectId: vi.fn(async () => locations), getById: vi.fn(async () => null) },
    lwItems: { getByProjectId: vi.fn(async () => items), getById: vi.fn(async () => null) },
    lwFactions: { getByProjectId: vi.fn(async () => []), getById: vi.fn(async () => null) },
    lwSkills: { getByProjectId: vi.fn(async () => []), getById: vi.fn(async () => null) },
    lwEvents: { getByProjectId: vi.fn(async () => []), getById: vi.fn(async () => null) },
    lwEntityStates: {
      getLatestEntityState: vi.fn(async () => null),
      getByProjectId: vi.fn(async () => []),
    },
    lwGraphEdges: {
      getByProjectId: vi.fn(async () => [...edges]),
      getByEntity: vi.fn(async () => []),
      batchCreate: vi.fn(async (list: any[]) => {
        const created = list.map(e => ({ id: `e${edges.length + 1}`, ...e }))
        edges.push(...created)
        return created
      }),
      create: vi.fn(async (input: any) => {
        const e = { id: `e${edges.length + 1}`, ...input }
        edges.push(e)
        return e
      }),
    },
  }
}

describe('GraphService.syncEntityRelations 关系落库', () => {
  it('正常落库：名称解析成功 → created 且边可读回', async () => {
    const db = makeFakeDb()
    const svc = new GraphService(db as any)
    const result = await svc.syncEntityRelations('p1', [
      { sourceType: 'character', sourceName: '林晓', targetType: 'character', targetName: '顾言', relationType: '师徒', description: '林晓师从顾言' },
      { sourceType: 'character', sourceName: '林晓', targetType: 'location', targetName: '青云宗', relationType: '所在', description: '林晓所在门派' },
      { sourceType: 'character', sourceName: '林晓', targetType: 'item', targetName: '青云剑', relationType: '持有', description: '林晓的佩剑' },
    ])
    expect(result.created).toBe(3)
    expect(result.skipped).toBe(0)
    const edges = await db.lwGraphEdges.getByProjectId('p1')
    expect(edges).toHaveLength(3)
    expect(edges[0]).toMatchObject({ sourceId: 'c1', targetId: 'c2', relationType: '师徒', validFromChapter: 1 })
    expect(edges[1]).toMatchObject({ sourceId: 'c1', targetId: 'l1', relationType: '所在' })
    expect(edges[2]).toMatchObject({ sourceId: 'c1', targetId: 'i1', relationType: '持有' })
  })

  it('幂等：重复分析同一关系 → 不产生重复边', async () => {
    const db = makeFakeDb()
    const svc = new GraphService(db as any)
    const rel = [{ sourceType: 'character', sourceName: '林晓', targetType: 'character', targetName: '顾言', relationType: '师徒' }]
    const first = await svc.syncEntityRelations('p1', rel)
    expect(first.created).toBe(1)
    const second = await svc.syncEntityRelations('p1', rel)
    expect(second.created).toBe(0)
    expect(second.skipped).toBe(1)
    expect((await db.lwGraphEdges.getByProjectId('p1')).length).toBe(1)
  })

  it('名称解析失败（实体不存在）→ 跳过', async () => {
    const db = makeFakeDb()
    const svc = new GraphService(db as any)
    const result = await svc.syncEntityRelations('p1', [
      { sourceType: 'character', sourceName: '林晓', targetType: 'character', targetName: '不存在的人', relationType: '师徒' },
      { sourceType: 'character', sourceName: '不存在的师父', targetType: 'character', targetName: '顾言', relationType: '师徒' },
    ])
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(2)
  })

  it('自环跳过', async () => {
    const db = makeFakeDb()
    const svc = new GraphService(db as any)
    const result = await svc.syncEntityRelations('p1', [
      { sourceType: 'character', sourceName: '林晓', targetType: 'character', targetName: '林晓', relationType: '自己' },
    ])
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('同一对实体多种关系并存（师徒 + 宿敌 是两个边）', async () => {
    const db = makeFakeDb()
    const svc = new GraphService(db as any)
    const result = await svc.syncEntityRelations('p1', [
      { sourceType: 'character', sourceName: '林晓', targetType: 'character', targetName: '顾言', relationType: '师徒' },
      { sourceType: 'character', sourceName: '林晓', targetType: 'character', targetName: '顾言', relationType: '宿敌' },
    ])
    expect(result.created).toBe(2)
  })

  it('空关系数组 → 不报错', async () => {
    const db = makeFakeDb()
    const svc = new GraphService(db as any)
    const result = await svc.syncEntityRelations('p1', [])
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(0)
  })
})
