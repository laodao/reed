/**
 * GraphStoreService 测试（统一图存储 API + 五业务场景回放，双方言 sqlite/pg）
 *
 * 场景回放口径（切换前先证明存储层能满足各业务现行语义）：
 * - lw：章节时间线（validFrom/validUntil）、active-only 幂等（同键重跑不重复、
 *   关停后可重建）、按章节取生效边
 * - kb：strict 幂等、confidence 边权 PPR、邻域、快照（graphSnapshot 投影输入）
 * - dl：prerequisite 判环（对齐 wouldCreatePrereqCycle 的"沿 prerequisite 边反向可达"语义）
 * - ip/world：简单 CRUD + 去重
 * - 跨业务：同名机制按 graph_name 互不可见；removeGraph 级联
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDataSource, getTestDialects, type TestDataSource } from '../helpers/create-test-data-source'
import { GraphEdgeRepository } from '@core/database/repositories/graph-edge.repository'
import { GraphStoreService } from '@core/platform/services/graph/store/graph-store.service'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { runWithUserAsync } from '@core/context/user-context'
import { GraphNames } from '@shared/constants/graph-store'
import { wouldCreatePrereqCycle } from '@core/packs/domain-learning/rules/learning-prerequisites.rules'

const EP = (kind: string, id: string) => ({ kind, id })

describe.each(getTestDialects())('GraphStoreService [%s]', (dialect) => {
  let tds: TestDataSource
  let store: GraphStoreService
  let repo: GraphEdgeRepository

  beforeEach(async () => {
    tds = await createTestDataSource(dialect)
    repo = new GraphEdgeRepository(tds.ds)
    store = new GraphStoreService({ db: { graphEdges: repo } as unknown as ICoreDatabaseManager })
  })

  // ==================== 基础 API ====================

  it('addEdge/addEdges 幂等与批内去重（active-only 缺省）', async () => {
    await runWithUserAsync('u1', async () => {
      const r1 = await store.addEdges(GraphNames.lwProject('p1'), [
        { source: EP('character', 'c1'), target: EP('character', 'c2'), relation: '师徒' },
        { source: EP('character', 'c1'), target: EP('character', 'c2'), relation: '师徒' }, // 批内重复
        { source: EP('character', 'c2'), target: EP('character', 'c3'), relation: '盟友' },
      ])
      expect(r1.created).toHaveLength(2)
      expect(r1.skipped).toBe(1)
      // 跨调用重跑：全部跳过
      const r2 = await store.addEdges(GraphNames.lwProject('p1'), [
        { source: EP('character', 'c1'), target: EP('character', 'c2'), relation: '师徒' },
      ])
      expect(r2.created).toHaveLength(0)
      expect(r2.skipped).toBe(1)
      expect((await store.listEdges(GraphNames.lwProject('p1')))).toHaveLength(2)
    })
  })

  it('listGraphs/stats/getEdge/updateEdge/removeEdge/removeGraph', async () => {
    await runWithUserAsync('u1', async () => {
      const g1 = GraphNames.lwProject('p1')
      const g2 = GraphNames.kb('kb1')
      const e1 = await store.addEdge(g1, { source: EP('character', 'c1'), target: EP('location', 'l1'), relation: '位于' })
      await store.addEdge(g2, { source: EP('entity', 'x1'), target: EP('entity', 'x2'), relation: 'enemy-of', confidence: 0.9 })
      expect(e1).not.toBeNull()

      expect((await store.listGraphs()).map((g) => g.graphName).sort()).toEqual([g1, g2].sort())
      expect((await store.listGraphs('kb:'))).toHaveLength(1)

      const s1 = await store.stats(g1)
      expect(s1.edgeCount).toBe(1)
      expect(s1.byRelation).toEqual({ 位于: 1 })
      expect(s1.byKind).toEqual({ character: 1, location: 1 })

      const upd = await store.updateEdge(g1, e1!.id, { label: '暂居', validUntil: 5 })
      expect(upd).toMatchObject({ label: '暂居', validUntil: 5 })
      expect(await store.getEdge(g2, e1!.id)).toBeNull() // 跨库不可读
      expect(await store.removeEdge(g2, e1!.id)).toBe(false) // 跨库不可删
      expect(await store.removeEdge(g1, e1!.id)).toBe(true)

      await store.addEdge(g1, { source: EP('character', 'c1'), target: EP('character', 'c2'), relation: '盟友' })
      expect(await store.removeGraph(g1)).toBe(1)
      expect(await store.listEdges(g1)).toHaveLength(0)
      expect((await store.listGraphs()).map((g) => g.graphName)).toEqual([g2])
    })
  })

  // ==================== lw 场景回放：章节时间线 + 关停重建 ====================

  it('lw：同键关系关停后重建（active-only 去重 + validAt 时间线）', async () => {
    await runWithUserAsync('u1', async () => {
      const g = GraphNames.lwProject('p1')
      const key = { source: EP('character', 'c1'), target: EP('character', 'c2'), relation: '恋人' }
      // ch1 建立（extract 溯源）
      const first = await store.addEdge(g, { ...key, validFrom: 1, origin: { type: 'extract', chapter: 1 } })
      expect(first).not.toBeNull()
      // 章节抽取重跑（同键同章）→ 幂等跳过
      const rerun = await store.addEdges(g, [{ ...key, validFrom: 1, origin: { type: 'extract', chapter: 1 } }])
      expect(rerun.created).toHaveLength(0)
      expect(rerun.skipped).toBe(1)
      // ch5 反目：旧边关停（endRelation 语义 = updateEdge validUntil）
      await store.updateEdge(g, first!.id, { validUntil: 5 })
      // ch6 重建同键关系 → active-only 不再挡（活跃键已空出）
      const again = await store.addEdge(g, { ...key, validFrom: 6, origin: { type: 'extract', chapter: 6 } })
      expect(again).not.toBeNull()
      // 时间线查询：ch3 生效的是第一条；ch8 生效的是第二条
      const at3 = await store.listEdges(g, { validAt: 3 })
      const at8 = await store.listEdges(g, { validAt: 8 })
      expect(at3.map((e) => e.id)).toEqual([first!.id])
      expect(at8.map((e) => e.id)).toEqual([again!.id])
      // 时间线展示（含已关停）
      expect(await store.listEdges(g)).toHaveLength(2)
    })
  })

  it('lw：章节确认管线批量同步（syncEntityRelations 回放：名称解析后的建边幂等）', async () => {
    await runWithUserAsync('u1', async () => {
      const g = GraphNames.lwProject('p1')
      // 模拟章节抽取产物（名称已解析为 ID）
      const extracted = [
        { source: EP('character', 'c1'), target: EP('character', 'c2'), relation: '敌对', origin: { type: 'extract', chapter: 2 } },
        { source: EP('event', 'ev1'), target: EP('character', 'c1'), relation: 'involves', origin: { type: 'extract', chapter: 2 } },
      ]
      const r1 = await store.addEdges(g, extracted.map((e) => ({ ...e, validFrom: 2 })))
      expect(r1.created).toHaveLength(2)
      // 管线重跑（同章重抽）：deleteByOriginChapter 语义 = removeEdges 后重建，结果一致
      await store.removeEdges(g, { relation: ['敌对', 'involves'] })
      const r2 = await store.addEdges(g, extracted.map((e) => ({ ...e, validFrom: 2 })))
      expect(r2.created).toHaveLength(2)
      expect(await store.listEdges(g)).toHaveLength(2)
      const snapshot = await store.snapshot(g)
      expect(snapshot.nodes).toHaveLength(3) // c1/c2/ev1
    })
  })

  // ==================== kb 场景回放：strict 幂等 + PPR ====================

  it('kb：strict 去重 + 快照 + PPR 多跳（confidence 边权）', async () => {
    await runWithUserAsync('u1', async () => {
      const g = GraphNames.kb('kb1')
      const mk = (s: string, t: string, c: number) => ({
        source: EP('entity', s),
        target: EP('entity', t),
        relation: 'enemy-of' as const,
        evidence: `为什么 ${s}->${t}`,
        confidence: c,
        origin: { type: 'ai' },
      })
      // 中心节点 hub（多条出边）应获得最高 PPR
      const specs = [mk('hub', 'a', 0.9), mk('hub', 'b', 0.8), mk('a', 'leaf', 0.7), mk('b', 'leaf', 0.6)]
      const r1 = await store.addEdges(g, specs, { dedupe: 'strict' })
      expect(r1.created).toHaveLength(4)
      const r2 = await store.addEdges(g, specs, { dedupe: 'strict' })
      expect(r2.created).toHaveLength(0)
      expect(r2.skipped).toBe(4)

      const snap = await store.snapshot(g)
      expect(snap.nodes).toHaveLength(4)
      const hits = await store.ppr(g, [{ endpoint: EP('entity', 'hub'), weight: 1 }], { iterations: 40, eps: 1e-4 })
      expect(hits.length).toBeGreaterThan(0)
      expect(hits[0].endpoint).toEqual(EP('entity', 'hub')) // 种子 + 中心性双重加成
      // 邻域（neighborsOf 收口）
      const aroundHub = await store.neighbors(g, EP('entity', 'hub'), { direction: 'out' })
      expect(aroundHub.map((h) => h.neighbor.id).sort()).toEqual(['a', 'b'])
      const aroundA = await store.neighbors(g, EP('entity', 'a'), { direction: 'in' })
      expect(aroundA.map((h) => h.neighbor.id)).toEqual(['hub'])
      // 人审位
      const e = (await store.listEdges(g, { relation: 'enemy-of' }))[0]
      await store.updateEdge(g, e.id, { verified: true })
      expect((await store.listEdges(g, { verified: true }))).toHaveLength(1)
      // kb 重建管线：先清后建（deleteEntityEntityEdges 语义）
      await store.removeEdges(g, { source: { kind: 'entity', id: 'hub' } })
      expect(await store.listEdges(g)).toHaveLength(2)
    })
  })

  // ==================== dl 场景回放：prerequisite 判环对齐规则函数 ====================

  it('dl：prerequisite 判环与 wouldCreatePrereqCycle 同判（反向可达）', async () => {
    await runWithUserAsync('u1', async () => {
      const g = GraphNames.dlProject('dp1')
      // A 是 B 的前置（A→B），B 是 C 的前置
      await store.addEdges(
        g,
        [
          { source: EP('concept', 'A'), target: EP('concept', 'B'), relation: 'prerequisite', evidence: '手工', verified: true },
          { source: EP('concept', 'B'), target: EP('concept', 'C'), relation: 'prerequisite', evidence: '手工', verified: true },
        ],
        { dedupe: 'strict' },
      )
      const relations = (await store.listEdges(g)).map((e) => ({ source: e.source.id, target: e.target.id, type: e.relation }))
      // 规则函数基准：加 C→A 会成环（A 已是 C 的前置祖先），加 A→C 不会
      expect(wouldCreatePrereqCycle(relations, 'C', 'A')).toBe(true)
      expect(wouldCreatePrereqCycle(relations, 'A', 'C')).toBe(false)
      // store.reachable 同判：candidate 是 concept 的前置祖先 ⟺ 沿 prerequisite 入向可达
      const cAncestors = await store.reachable(g, EP('concept', 'C'), { direction: 'in', relations: ['prerequisite'] })
      expect(cAncestors.has('concept:A')).toBe(true)
      expect(cAncestors.has('concept:B')).toBe(true)
      // confirmRelation 回放：确认 C→A 前先判环 → 判定为成环，跳过建边（存储层不过策略，
      // 拒绝动作发生在模块侧——这正是职责边界）
      const edges = (await store.listEdges(g, { relation: 'prerequisite' })).map((e) => ({
        source: e.source.id,
        target: e.target.id,
        type: e.relation,
      }))
      expect(wouldCreatePrereqCycle(edges, 'C', 'A')).toBe(true) // 模块侧拒绝建 C→A
      // 确认 A→C（不成环）→ 放行
      const ok = await store.addEdge(g, { source: EP('concept', 'A'), target: EP('concept', 'C'), relation: 'prerequisite', verified: true }, { dedupe: 'strict' })
      expect(ok).not.toBeNull()
    })
  })

  it('dl：邻居双向视图（Atlas related 区语义）', async () => {
    await runWithUserAsync('u1', async () => {
      const g = GraphNames.dlProject('dp1')
      await store.addEdges(g, [
        { source: EP('concept', 'A'), target: EP('concept', 'B'), relation: 'prerequisite' },
        { source: EP('concept', 'C'), target: EP('concept', 'B'), relation: 'contrasts' },
      ], { dedupe: 'strict' })
      // 两条边都指向 B：B 的双向邻居都是 'in'（A、C），无出边
      const hits = await store.neighbors(g, EP('concept', 'B'), { direction: 'both' })
      expect(hits).toHaveLength(2)
      expect(hits.every((h) => h.direction === 'in')).toBe(true)
      expect(hits.map((h) => h.neighbor.id).sort()).toEqual(['A', 'C'])
      // 从 A 视角：A→B 是出边，邻居 B
      const fromA = await store.neighbors(g, EP('concept', 'A'), { direction: 'out' })
      expect(fromA.map((h) => h.neighbor.id)).toEqual(['B'])
    })
  })

  // ==================== ip / world 场景回放 ====================

  it('ip/world：简单 CRUD + 去重从无到有', async () => {
    await runWithUserAsync('u1', async () => {
      const ipG = GraphNames.lwIp()
      const e1 = await store.addEdge(ipG, { source: EP('ip_character', 'ipc1'), target: EP('ip_character', 'ipc2'), relation: '师徒', label: '授业' })
      const dup = await store.addEdge(ipG, { source: EP('ip_character', 'ipc1'), target: EP('ip_character', 'ipc2'), relation: '师徒' })
      expect(e1).not.toBeNull()
      expect(dup).toBeNull() // ip 库原先无去重，统一后 active-only 生效
      expect(await store.listEdges(ipG)).toHaveLength(1)
      // 库内原型关系静态：删除走 removeEdge
      expect(await store.removeEdge(ipG, e1!.id)).toBe(true)

      const wG = GraphNames.lwWorld('world1')
      await store.addEdges(wG, [
        { source: EP('world_entry', 'e1'), target: EP('world_entry', 'e2'), relation: '位于' },
        { source: EP('world_entry', 'e1'), target: EP('world_entry', 'e3'), relation: '隶属' },
      ], { dedupe: 'strict' })
      expect(await store.stats(wG)).toMatchObject({ edgeCount: 2 })
    })
  })

  // ==================== 跨业务隔离 ====================

  it('graph_name 隔离：同名五元组在不同库互不干扰', async () => {
    await runWithUserAsync('u1', async () => {
      const spec = { source: EP('entity', 'x'), target: EP('entity', 'y'), relation: 'relates' }
      await store.addEdge(GraphNames.kb('kb1'), spec, { dedupe: 'strict' })
      await store.addEdge(GraphNames.kb('kb2'), spec, { dedupe: 'strict' }) // 另一库同键可建
      expect(await store.listEdges(GraphNames.kb('kb1'))).toHaveLength(1)
      expect(await store.listEdges(GraphNames.kb('kb2'))).toHaveLength(1)
      expect(await store.listGraphs('kb:')).toHaveLength(2)
    })
  })
})
