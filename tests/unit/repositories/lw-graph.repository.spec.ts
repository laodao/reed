/**
 * LW 图谱 repository 测试（lw-event / lw-graph-edge）
 * 覆盖：CRUD、时间线生效查询（getActiveEdgesAtChapter）、endRelation、实体级联清理、多租户 scoped。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { createLwGraphTables } from '@core/database/migrations/create-lw-graph-tables'
import { createUnifiedGraphTables } from '@core/database/migrations/create-unified-graph-tables'
import { LwEventEntity } from '@core/database/entities/lw-event.entity'
import { LwGraphEdgeEntity } from '@core/database/entities/lw-graph-edge.entity'
import { GraphEdgeEntity } from '@core/database/entities/graph/graph-edge.entity'
import { LwEventRepository } from '@core/database/repositories/lw-event.repository'
import { LwGraphEdgeRepository } from '@core/database/repositories/lw-graph-edge.repository'
import { runWithUserAsync } from '@core/context/user-context'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [LwEventEntity, LwGraphEdgeEntity, GraphEdgeEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createLwGraphTables(ds)
  // 图谱仓储已是统一图存储 facade——graph_edges 必须就绪
  await createUnifiedGraphTables(ds)
  return ds
}

describe('LwEventRepository（故事事件节点）', () => {
  let ds: DataSource
  let events: LwEventRepository

  beforeEach(async () => {
    ds = await buildDs()
    events = new LwEventRepository(ds)
  })

  it('create + getById + involvedEntities JSON 往返', async () => {
    const created = await runWithUserAsync('user-1', () =>
      events.create({
        projectId: 'p1',
        name: '比武大会夺魁',
        chapterNumber: 3,
        storyTime: '第三年春',
        involvedEntities: [{ type: 'character', id: 'c1', name: '林晓' }],
        stateBefore: '林晓负伤',
        stateAfter: '林晓扬名',
      }),
    )
    expect(created.id).toBeTruthy()
    const fetched = await runWithUserAsync('user-1', () => events.getById(created.id))
    expect(fetched?.name).toBe('比武大会夺魁')
    expect(fetched?.chapterNumber).toBe(3)
    expect(fetched?.involvedEntities).toEqual([{ type: 'character', id: 'c1', name: '林晓' }])
    expect(fetched?.stateAfter).toBe('林晓扬名')
  })

  it('getByProjectId 按章节排序 / getByChapter 过滤 / count', async () => {
    await runWithUserAsync('user-1', async () => {
      await events.create({ projectId: 'p1', name: 'e1', chapterNumber: 2 })
      await events.create({ projectId: 'p1', name: 'e2', chapterNumber: 1 })
      await events.create({ projectId: 'p2', name: 'e3', chapterNumber: 1 })
      const all = await events.getByProjectId('p1')
      expect(all.map(e => e.name)).toEqual(['e2', 'e1']) // 按 chapterNumber ASC
      expect(await events.countByProjectId('p1')).toBe(2)
      const ch2 = await events.getByChapter('p1', 2)
      expect(ch2.map(e => e.name)).toEqual(['e1'])
    })
  })

  it('update / delete', async () => {
    const created = await runWithUserAsync('user-1', () =>
      events.create({ projectId: 'p1', name: 'e1', chapterNumber: 1 }),
    )
    const updated = await runWithUserAsync('user-1', () =>
      events.update(created.id, { name: 'e1改', storyTime: '初春' }),
    )
    expect(updated?.name).toBe('e1改')
    expect(updated?.storyTime).toBe('初春')
    expect(await runWithUserAsync('user-1', () => events.delete(created.id))).toBe(true)
    expect(await runWithUserAsync('user-1', () => events.getById(created.id))).toBeNull()
  })

  it('多租户隔离：user-A 创建 user-B 不可见', async () => {
    const created = await runWithUserAsync('user-A', () =>
      events.create({ projectId: 'p1', name: 'e1', chapterNumber: 1 }),
    )
    expect(await runWithUserAsync('user-B', () => events.getById(created.id))).toBeNull()
    expect(await runWithUserAsync('user-B', () => events.getByProjectId('p1'))).toHaveLength(0)
    expect(await runWithUserAsync('user-A', () => events.getByProjectId('p1'))).toHaveLength(1)
  })
})

describe('LwGraphEdgeRepository（关系边 + 时间线）', () => {
  let ds: DataSource
  let edges: LwGraphEdgeRepository

  beforeEach(async () => {
    ds = await buildDs()
    edges = new LwGraphEdgeRepository(ds)
  })

  const mkEdge = (over: Record<string, unknown> = {}) => ({
    projectId: 'p1',
    sourceType: 'character' as const,
    sourceId: 'c1',
    targetType: 'character' as const,
    targetId: 'c2',
    relationType: 'marriage',
    label: '夫妻',
    ...over,
  })

  it('create + getById + getByProjectId', async () => {
    const created = await runWithUserAsync('user-1', () => edges.create(mkEdge({ label: '夫妻', validFromChapter: 1 })))
    const fetched = await runWithUserAsync('user-1', () => edges.getById(created.id))
    expect(fetched?.relationType).toBe('marriage')
    expect(fetched?.label).toBe('夫妻')
    expect(fetched?.validFromChapter).toBe(1)
    expect(fetched?.validUntilChapter).toBeUndefined()
  })

  it('getActiveEdgesAtChapter 按 valid_from/valid_until 过滤', async () => {
    await runWithUserAsync('user-1', async () => {
      // 自第 1 章起持续有效
      await edges.create(mkEdge({ relationType: 'marriage', label: '夫妻', validFromChapter: 1, targetId: 'c2' }))
      // 第 3-5 章有效（后来离婚）
      await edges.create(mkEdge({ relationType: 'lovers', label: '恋人', validFromChapter: 3, validUntilChapter: 5, targetId: 'c3' }))
      // 第 2 章才建立
      await edges.create(mkEdge({ relationType: 'friends', label: '朋友', validFromChapter: 2, targetId: 'c4' }))

      const at2 = await edges.getActiveEdgesAtChapter('p1', 'c1', 2)
      expect(at2.map(e => e.relationType).sort()).toEqual(['friends', 'marriage']) // lovers 未开始
      const at4 = await edges.getActiveEdgesAtChapter('p1', 'c1', 4)
      expect(at4.map(e => e.relationType).sort()).toEqual(['friends', 'lovers', 'marriage'])
      const at6 = await edges.getActiveEdgesAtChapter('p1', 'c1', 6)
      expect(at6.map(e => e.relationType).sort()).toEqual(['friends', 'marriage']) // lovers 已失效
    })
  })

  it('getByEntity 双向命中（source 或 target）', async () => {
    await runWithUserAsync('user-1', async () => {
      await edges.create(mkEdge({ targetId: 'c2' }))
      await edges.create(mkEdge({ sourceType: 'character', sourceId: 'c3', targetType: 'character', targetId: 'c1', relationType: 'enemy' }))
      const ofC1 = await edges.getByEntity('p1', 'character', 'c1')
      expect(ofC1).toHaveLength(2) // c1 作为 source 1 条 + target 1 条
    })
  })

  it('endRelation 写入 valid_until_chapter（离婚不改边，旧边标失效）', async () => {
    const created = await runWithUserAsync('user-1', () => edges.create(mkEdge({ validFromChapter: 1 })))
    const ended = await runWithUserAsync('user-1', () => edges.endRelation(created.id, 8))
    expect(ended?.validUntilChapter).toBe(8)
    const at7 = await runWithUserAsync('user-1', () => edges.getActiveEdgesAtChapter('p1', 'c1', 7))
    expect(at7.some(e => e.id === created.id)).toBe(true)
    const at9 = await runWithUserAsync('user-1', () => edges.getActiveEdgesAtChapter('p1', 'c1', 9))
    expect(at9.some(e => e.id === created.id)).toBe(false)
  })

  it('deleteByEntity 级联清理（source + target 双向）', async () => {
    await runWithUserAsync('user-1', async () => {
      await edges.create(mkEdge({ targetId: 'c2' }))
      await edges.create(mkEdge({ sourceId: 'c3', targetId: 'c1', relationType: 'enemy' }))
      const affected = await edges.deleteByEntity('p1', 'character', 'c1')
      expect(affected).toBe(2)
      expect(await edges.getByProjectId('p1')).toHaveLength(0)
    })
  })

  it('update 修改 label / 有效期', async () => {
    const created = await runWithUserAsync('user-1', () => edges.create(mkEdge()))
    const updated = await runWithUserAsync('user-1', () =>
      edges.update(created.id, { label: '离婚夫妻', relationType: 'divorced' }),
    )
    expect(updated?.label).toBe('离婚夫妻')
    expect(updated?.relationType).toBe('divorced')
  })

  it('多租户隔离', async () => {
    const created = await runWithUserAsync('user-A', () => edges.create(mkEdge()))
    expect(await runWithUserAsync('user-B', () => edges.getById(created.id))).toBeNull()
    expect(await runWithUserAsync('user-B', () => edges.getByProjectId('p1'))).toHaveLength(0)
  })
})
