/**
 * GraphEdgeRepository 测试（统一图存储，双方言 sqlite/pg）
 * 覆盖：CRUD、user_id 租户隔离、findByGraph 全过滤条件、端点改指（kb redirectNode 语义）、
 *       listGraphs/stats 派生查询。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDataSource, getTestDialects, type TestDataSource } from '../helpers/create-test-data-source'
import { GraphEdgeRepository, type GraphEdgeRowInput } from '@core/database/repositories/graph-edge.repository'
import { runWithUserAsync } from '@core/context/user-context'

function row(over: Partial<GraphEdgeRowInput> & { id: string; graphName?: string }): GraphEdgeRowInput {
  return {
    graphName: 'g1',
    sourceKind: 'character',
    sourceId: 'c1',
    targetKind: 'character',
    targetId: 'c2',
    relation: '盟友',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  }
}

describe.each(getTestDialects())('GraphEdgeRepository [%s]', (dialect) => {
  let tds: TestDataSource
  let repo: GraphEdgeRepository

  beforeEach(async () => {
    tds = await createTestDataSource(dialect)
    repo = new GraphEdgeRepository(tds.ds)
  })

  it('insertRows + findByGraph + toDto 往返（origin/props JSON、verified 布尔）', async () => {
    await runWithUserAsync('u1', () =>
      repo.insertRows([
        row({
          id: 'e1',
          origin: JSON.stringify({ type: 'extract', chapter: 3 }),
          props: JSON.stringify({ color: 'red' }),
          confidence: 0.8,
          verified: 1,
          validFrom: 1,
          validUntil: null,
        }),
      ]),
    )
    const edges = await runWithUserAsync('u1', () => repo.findByGraph('g1'))
    expect(edges).toHaveLength(1)
    const e = edges[0]
    expect(e).toMatchObject({
      id: 'e1',
      graphName: 'g1',
      source: { kind: 'character', id: 'c1' },
      target: { kind: 'character', id: 'c2' },
      relation: '盟友',
      confidence: 0.8,
      verified: true,
      validFrom: 1,
      validUntil: null,
    })
    expect(e.origin).toEqual({ type: 'extract', chapter: 3 })
    expect(e.props).toEqual({ color: 'red' })
  })

  it('多租户隔离：u1 的图对 u2 不可见', async () => {
    await runWithUserAsync('u1', () => repo.insertRows([row({ id: 'e1' })]))
    expect(await runWithUserAsync('u1', () => repo.countByGraph('g1'))).toBe(1)
    expect(await runWithUserAsync('u2', () => repo.countByGraph('g1'))).toBe(0)
    expect(await runWithUserAsync('u2', () => repo.getById('g1', 'e1'))).toBeNull()
  })

  it('findByGraph 过滤条件：relation/source/target/kind/validAt/verified/activeOnly', async () => {
    await runWithUserAsync('u1', () =>
      repo.insertRows([
        row({ id: 'e1', relation: '师徒', validFrom: 1, validUntil: null }),
        row({ id: 'e2', relation: '师徒', validFrom: 10, validUntil: 20 }), // 已关停
        row({ id: 'e3', relation: '敌对', sourceId: 'c9', targetId: 'c2' }),
        row({ id: 'e4', relation: '盟友', targetKind: 'location', targetId: 'l1', verified: 1 }),
      ]),
    )
    const q = (f?: Parameters<GraphEdgeRepository['findByGraph']>[1]) =>
      runWithUserAsync('u1', () => repo.findByGraph('g1', f))
    expect((await q({ relation: '师徒' })).map((e) => e.id)).toEqual(['e1', 'e2'])
    expect((await q({ relation: ['师徒', '敌对'] })).map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
    expect((await q({ source: { kind: 'character', id: 'c9' } })).map((e) => e.id)).toEqual(['e3'])
    expect((await q({ target: { kind: 'character', id: 'c2' } })).map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
    expect((await q({ kind: 'location' })).map((e) => e.id)).toEqual(['e4'])
    expect((await q({ validAt: 15 })).map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']) // e2 生效区间 [10,20]，15 在窗内
    expect((await q({ validAt: 25 })).map((e) => e.id)).toEqual(['e1', 'e3', 'e4']) // 25 已出窗
    expect((await q({ validAt: 1 })).map((e) => e.id)).toEqual(['e1', 'e3', 'e4']) // e2 未开始
    expect((await q({ verified: true })).map((e) => e.id)).toEqual(['e4'])
    expect((await q({ activeOnly: true })).map((e) => e.id)).toEqual(['e1', 'e3', 'e4'])
  })

  it('updateRow：局部补丁 + 端点改指（redirect）+ 跨库不命中返回 null', async () => {
    await runWithUserAsync('u1', () => repo.insertRows([row({ id: 'e1' })]))
    const updated = await runWithUserAsync('u1', () =>
      repo.updateRow('g1', 'e1', { relation: '宿敌', targetId: 'c3', confidence: 0.5 }),
    )
    expect(updated).toMatchObject({ relation: '宿敌', target: { id: 'c3' }, confidence: 0.5 })
    // 端点改指（kb 实体合并）
    const redirected = await runWithUserAsync('u1', () =>
      repo.updateRow('g1', 'e1', { sourceId: 'c8' }),
    )
    expect(redirected?.source.id).toBe('c8')
    expect(await runWithUserAsync('u1', () => repo.updateRow('g2', 'e1', { relation: 'x' }))).toBeNull()
  })

  it('deleteByIds / findIdsByFilter / listGraphs / stats / countAll', async () => {
    await runWithUserAsync('u1', () =>
      repo.insertRows([
        row({ id: 'e1', graphName: 'g1', relation: '盟友' }),
        row({ id: 'e2', graphName: 'g1', relation: '敌对' }),
        row({ id: 'e3', graphName: 'g2', relation: '盟友' }),
      ]),
    )
    expect(await runWithUserAsync('u1', () => repo.findIdsByFilter('g1', { relation: '敌对' }))).toEqual(['e2'])
    expect(await runWithUserAsync('u1', () => repo.deleteByIds(['e2']))).toBe(1)
    const graphs = await runWithUserAsync('u1', () => repo.listGraphs())
    expect(graphs).toEqual(
      expect.arrayContaining([
        { graphName: 'g1', edgeCount: 1 },
        { graphName: 'g2', edgeCount: 1 },
      ]),
    )
    const stats = await runWithUserAsync('u1', () => repo.stats('g1'))
    expect(stats.byRelation).toEqual({ 盟友: 1 })
    expect(stats.byKind).toEqual({ character: 2 }) // source+target 各计一次
    expect(await runWithUserAsync('u1', () => repo.countAll())).toBe(2)
    // 按过滤条件删除（store.removeEdges 的两步：先取 id 再删）
    const g2Ids = await runWithUserAsync('u1', () => repo.findIdsByFilter('g2'))
    expect(await runWithUserAsync('u1', () => repo.deleteByIds(g2Ids))).toBe(1)
    expect(await runWithUserAsync('u1', () => repo.countAll())).toBe(1)
  })

  it('label/description/evidence 空值往返（NULL 不变空串）', async () => {
    await runWithUserAsync('u1', () => repo.insertRows([row({ id: 'e1', label: null, description: null, evidence: null })]))
    const e = (await runWithUserAsync('u1', () => repo.findByGraph('g1')))[0]
    expect(e.label).toBeNull()
    expect(e.description).toBeNull()
    expect(e.evidence).toBeNull()
  })
})
